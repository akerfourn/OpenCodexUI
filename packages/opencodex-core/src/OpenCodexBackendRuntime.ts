import {
  CodexProcessError,
  type CodexNotification,
  type FuzzyFileSearchResponse,
  type v2,
  type CodexServerRequest
} from "@open-codex-ui/codex-rpc";
import type {
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexApprovalDecision,
  OpenCodexCommitMessageGenerationResult,
  OpenCodexCommitMessageLanguage,
  OpenCodexComposerReference,
  OpenCodexCommitPrompt,
  OpenCodexEvent,
  OpenCodexFileSearchResult,
  OpenCodexImageAttachment,
  OpenCodexGitCommitResult,
  OpenCodexGitStatus,
  OpenCodexLogEntry,
  OpenCodexLogPage,
  OpenCodexLogRetentionUnit,
  OpenCodexPluginDetail,
  OpenCodexPluginInstallResult,
  OpenCodexPluginListResult,
  OpenCodexProject,
  OpenCodexProjectCommand,
  OpenCodexProjectCommandRun,
  OpenCodexRequest,
  OpenCodexReasoningEffort,
  OpenCodexSettings,
  OpenCodexSkillSearchResult,
  OpenCodexSource,
  OpenCodexSourceLocalSettings,
  OpenCodexThread,
  OpenCodexTurn,
  OpenCodexUsageLimits
} from "@open-codex-ui/opencodex-protocol";

import { ThreadTurnCache } from "./ThreadTurnCache.js";
import type { OpenCodexBackendOptions } from "./types.js";
import { ApprovalService } from "./backend/ApprovalService.js";
import { OpenCodexClientPool } from "./backend/OpenCodexClientPool.js";
import { NotificationService } from "./backend/NotificationService.js";
import { ProjectSourceService } from "./backend/ProjectSourceService.js";
import { ProjectTrustService } from "./backend/ProjectTrustService.js";
import {
  fallbackModels,
  readModels
} from "./backend/codexReaders.js";
import {
  getBackendLabels,
  normalizeError,
  toError
} from "./backend/errors.js";
import { ThreadConversationService } from "./backend/ThreadConversationService.js";
import { ThreadCacheService } from "./backend/ThreadCacheService.js";
import { GitService } from "./backend/GitService.js";
import { CommitMessageService } from "./backend/CommitMessageService.js";
import { ProjectCommandService } from "./backend/ProjectCommandService.js";
import { PluginService } from "./backend/PluginService.js";
import { readObject, readString } from "./mapping.js";
import {
  mapUsageLimitsNotification,
  mapUsageLimitsResponse
} from "./backend/usageMapping.js";

/**
 * Coordinates backend services exposed to the UI transport.
 */
export class OpenCodexBackendRuntime {
  private settings: OpenCodexSettings;
  private readonly threadTurnCache = new ThreadTurnCache();
  private readonly cacheRepository: OpenCodexCacheRepository | null;
  private readonly approvalService: ApprovalService;
  private readonly clientPool: OpenCodexClientPool;
  private readonly notificationService: NotificationService;
  private readonly projectSourceService: ProjectSourceService;
  private readonly projectTrustService: ProjectTrustService;
  private readonly threadCacheService: ThreadCacheService;
  private readonly threadConversationService: ThreadConversationService;
  private readonly gitService: GitService;
  private readonly commitMessageService: CommitMessageService;
  private readonly projectCommandService: ProjectCommandService;
  private readonly pluginService: PluginService;
  private readonly ignoredNotificationThreadIds = new Set<string>();

  /**
   * Creates a backend runtime and wires its internal services.
   *
   * @param options Host integration and persistence options.
   */
  constructor(private readonly options: OpenCodexBackendOptions) {
    this.settings = options.settings;
    this.cacheRepository = options.cacheRepository ?? null;
    this.clientPool = new OpenCodexClientPool({
      getSettings: () => this.settings,
      resolveSource: (sourceId) => this.resolveSource(sourceId),
      emit: (event) => this.emit(event),
      logger: options.logger,
      handleNotification: (notification, sourceId) => this.handleNotification(notification, sourceId),
      handleServerRequest: (request, sourceId) => this.handleServerRequest(request, sourceId),
      handleError: (error) => this.handleClientError(error),
      handleClose: (sourceId) => this.handleClientClose(sourceId),
      handleStderr: (message, sourceId) => this.handleCodexStderr(message, sourceId)
    });
    this.approvalService = new ApprovalService({
      getSettings: () => this.settings,
      emit: (event) => this.emit(event),
      getClient: (sourceId) => this.clientPool.getClient(sourceId)
    });
    this.notificationService = new NotificationService({
      getSettings: () => this.settings,
      emit: (event) => this.emit(event),
      applyCodexThreadTitle: (threadId, title) => this.applyCodexThreadTitle(threadId, title),
      syncCompletedTurn: (threadId) => this.syncCompletedTurn(threadId)
    });
    this.projectSourceService = new ProjectSourceService({
      backendOptions: options,
      cacheRepository: this.cacheRepository,
      getSettings: () => this.settings,
      setSettings: (settings) => {
        this.settings = settings;
      },
      emit: (event) => this.emit(event),
      ensureClient: (sourceId) => this.ensureClient(sourceId),
      restartSourceClient: (sourceId) => this.restartSourceClient(sourceId)
    });
    this.projectTrustService = new ProjectTrustService({
      backendOptions: options,
      getSettings: () => this.settings,
      emit: (event) => this.emit(event),
      ensureClient: (sourceId) => this.ensureClient(sourceId)
    });
    this.threadCacheService = new ThreadCacheService({
      backendOptions: options,
      cacheRepository: this.cacheRepository,
      threadTurnCache: this.threadTurnCache,
      getSettings: () => this.settings,
      emit: (event) => this.emit(event)
    });
    this.threadConversationService = new ThreadConversationService({
      backendOptions: options,
      threadTurnCache: this.threadTurnCache,
      threadCacheService: this.threadCacheService,
      getSettings: () => this.settings,
      emit: (event) => this.emit(event),
      ensureClient: (sourceId) => this.ensureClient(sourceId),
      resolveSource: (sourceId) => this.resolveSource(sourceId),
      cacheProject: (projectPath, sourceId) => this.cacheProject(projectPath, sourceId),
      readCachedProjects: () => this.readCachedProjects(),
      handleClientError: (error) => this.handleClientError(error)
    });
    this.gitService = new GitService({
      ensureClient: (sourceId) => this.ensureClient(sourceId)
    });
    this.commitMessageService = new CommitMessageService({
      userDataPath: options.userDataPath,
      defaultPromptPath: options.defaultCommitPromptPath,
      generationPromptPath: options.generationCommitPromptPath,
      gitService: this.gitService,
      getSettings: () => this.settings,
      ensureClient: (sourceId) => this.ensureClient(sourceId),
      ignoreThreadNotifications: (threadId) => {
        this.ignoredNotificationThreadIds.add(threadId);
      },
      releaseThreadNotifications: (threadId) => {
        this.ignoredNotificationThreadIds.delete(threadId);
      },
      logger: options.logger
    });
    this.projectCommandService = new ProjectCommandService({
      cacheRepository: this.cacheRepository,
      userDataPath: options.userDataPath,
      emit: (event) => this.emit(event),
      ensureClient: (sourceId) => this.ensureClient(sourceId)
    });
    this.pluginService = new PluginService({
      ensureClient: (sourceId) => this.ensureClient(sourceId)
    });
  }

  /**
   * Releases runtime resources.
   *
   * @returns Promise resolved when resources are disposed.
   */
  async dispose(): Promise<void> {
    await this.clientPool.dispose();
    await this.cacheRepository?.close();
  }

  /**
   * Sends initial settings, sources, projects, and models to the UI.
   *
   * @returns Success result.
   */
  async bootstrap(): Promise<{ ok: true }> {
    await this.projectSourceService.ensureSourcesInitialized();
    this.emit({
      type: "app.bootstrap",
      settings: this.settings,
      sources: await this.projectSourceService.listOpenCodexSources(),
      projectPath: this.options.projectPath
    });
    await this.listProjects();
    await this.listModels();
    await this.readUsageLimits();
    return { ok: true };
  }

  /**
   * Returns current backend settings.
   *
   * @returns Settings snapshot.
   */
  getSettings(): OpenCodexSettings {
    return this.settings;
  }

  /**
   * Updates and persists backend settings.
   *
   * @param patch Settings patch.
   *
   * @returns Updated settings.
   */
  async updateSettings(patch: Partial<OpenCodexSettings>): Promise<OpenCodexSettings> {
    this.settings = { ...this.settings, ...patch };
    await this.options.saveSettings?.(this.settings);
    return this.settings;
  }

  /**
   * Opens the host executable picker for source commands.
   *
   * @returns Selected executable path, or `null`.
   */
  async pickSourceExecutable(): Promise<string | null> {
    return await this.options.pickExecutableFile?.() ?? null;
  }

  /**
   * Searches project files through the Codex source filesystem.
   *
   * @param projectPath Project root path.
   * @param sourceId Source identifier, or `null`.
   * @param query Fuzzy search query.
   * @param limit Maximum number of results.
   *
   * @returns Matching files.
   */
  async searchProjectFiles(
    projectPath: string,
    sourceId: string | null,
    query: string,
    limit: number
  ): Promise<OpenCodexFileSearchResult[]> {
    const root = normalizeProjectPath(projectPath);

    if (root === null) {
      return [];
    }

    const client = await this.ensureClient(sourceId);
    const response = await client.request<FuzzyFileSearchResponse>("fuzzyFileSearch", {
      query,
      roots: [root],
      cancellationToken: null
    });

    return response.files
      .filter((file) => file.match_type === "file")
      .slice(0, Math.max(1, limit))
      .map((file) => ({
        root: file.root,
        path: file.path,
        relativePath: readRelativeFilePath(file.root, file.path),
        fileName: file.file_name,
        matchType: file.match_type
      }));
  }

  /**
   * Searches Codex skills available for a project.
   *
   * @param projectPath Project root path.
   * @param sourceId Source identifier, or `null`.
   * @param query User query without the `$` trigger.
   * @param limit Maximum number of results.
   *
   * @returns Matching skills.
   */
  async searchProjectSkills(
    projectPath: string,
    sourceId: string | null,
    query: string,
    limit: number
  ): Promise<OpenCodexSkillSearchResult[]> {
    const root = normalizeProjectPath(projectPath);

    if (root === null) {
      return [];
    }

    const client = await this.ensureClient(sourceId);
    const response = await client.request<v2.SkillsListResponse>("skills/list", {
      cwds: [root],
      forceReload: false
    });
    const allSkills = response.data.flatMap((entry: v2.SkillsListEntry) => entry.skills);
    const enabledSkills = allSkills.filter((skill: v2.SkillMetadata) => skill.enabled);
    const scoredSkills = enabledSkills
      .map((skill: v2.SkillMetadata) => ({
        skill,
        score: scoreSkillSearchResult(skill.name, skill.interface?.displayName, query)
      }))
      .filter((entry: { skill: v2.SkillMetadata; score: number }) => entry.score >= 0)
      .sort((
        left: { skill: v2.SkillMetadata; score: number },
        right: { skill: v2.SkillMetadata; score: number }
      ) => right.score - left.score || left.skill.name.localeCompare(right.skill.name));

    return scoredSkills.slice(0, Math.max(1, limit)).map(({ skill }) => ({
      name: skill.name,
      displayName: skill.interface?.displayName ?? skill.name,
      description: skill.description,
      shortDescription: skill.interface?.shortDescription ?? skill.shortDescription ?? null,
      path: String(skill.path),
      scope: skill.scope
    }));
  }

  /**
   * Converts request failures to protocol errors and starts recovery when possible.
   *
   * @param request Request that failed.
   * @param error Unknown thrown value.
   *
   * @returns Never returns because it rethrows the normalized error.
   */
  handleRequestError(request: OpenCodexRequest, error: unknown): never {
    const normalized = normalizeError(error, this.settings.language);
    const recoverableThreadId = this.readRecoverableThreadId(request, error);
    this.persistLog("error", normalized.message, normalized.details);
    this.emit({
      type: "error",
      message: normalized.message,
      details: normalized.details,
      recoverable: recoverableThreadId !== null,
      threadId: recoverableThreadId ?? undefined
    });

    if (recoverableThreadId !== null) {
      void this.recoverThread(recoverableThreadId).catch((recoverError: unknown) => {
        this.handleClientError(toError(recoverError));
      });
    }

    throw normalized;
  }

  /**
   * Ensures a Codex client for a source.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   *
   * @returns Started Codex client.
   */
  private async ensureClient(sourceId: string | null = this.settings.defaultSourceId) {
    return await this.clientPool.ensureClient(sourceId);
  }

  /**
   * Lists cached projects.
   *
   * @returns Project collection.
   */
  async listProjects(): Promise<OpenCodexProject[]> {
    return await this.projectSourceService.listProjects();
  }

  /**
   * Lists persisted application logs.
   *
   * @param beforeCreatedAt Optional pagination cursor.
   * @param limit Maximum number of entries to read.
   *
   * @returns Log page.
   */
  async listLogs(beforeCreatedAt: string | null, limit: number): Promise<OpenCodexLogPage> {
    if (this.cacheRepository === null) {
      return { logs: [], hasMore: false };
    }

    return await this.cacheRepository.listLogs({ beforeCreatedAt, limit });
  }

  /**
   * Deletes one persisted application log.
   *
   * @param logId Log identifier.
   *
   * @returns Success result.
   */
  async deleteLog(logId: string): Promise<{ ok: true }> {
    await this.cacheRepository?.deleteLog(logId);
    this.emit({ type: "logs.deleted", logId });
    return { ok: true };
  }

  /**
   * Clears persisted application logs.
   *
   * @param mode Clear mode.
   * @param amount Retention amount when keeping recent logs.
   * @param unit Retention unit when keeping recent logs.
   *
   * @returns Success result.
   */
  async clearLogs(
    mode: "all" | "olderThan",
    amount: number,
    unit: OpenCodexLogRetentionUnit
  ): Promise<{ ok: true }> {
    if (mode === "all") {
      await this.cacheRepository?.clearLogs();
    } else {
      await this.cacheRepository?.clearLogsOlderThan(calculateRetentionCutoff(amount, unit));
    }

    this.emit({ type: "logs.cleared" });
    return { ok: true };
  }

  /**
   * Lists configured sources.
   *
   * @returns Source collection.
   */
  async listSources(): Promise<OpenCodexSource[]> {
    return await this.projectSourceService.listSources();
  }

  /**
   * Creates a source.
   *
   * @param name Optional source name.
   *
   * @returns Created source.
   */
  async createSource(name?: string): Promise<OpenCodexSource> {
    return await this.projectSourceService.createSource(name);
  }

  /**
   * Synchronizes projects from sources.
   *
   * @param sourceId Source identifier, or `null` for all sources.
   *
   * @returns Refreshed projects.
   */
  async syncSources(sourceId: string | null): Promise<OpenCodexProject[]> {
    return await this.projectSourceService.syncSources(sourceId);
  }

  /**
   * Updates project hidden state.
   *
   * @param projectId Project identifier.
   * @param isHidden Hidden flag.
   *
   * @returns Success result.
   */
  async setProjectHidden(projectId: string, isHidden: boolean): Promise<{ ok: true }> {
    return await this.projectSourceService.setProjectHidden(projectId, isHidden);
  }

  /**
   * Deletes a project from the local cache.
   *
   * @param projectId Project identifier.
   *
   * @returns Success result.
   */
  async deleteProject(projectId: string): Promise<{ ok: true }> {
    return await this.projectSourceService.deleteProject(projectId);
  }

  /**
   * Deletes a source.
   *
   * @param sourceId Source identifier.
   *
   * @returns Success result.
   */
  async deleteSource(sourceId: string): Promise<{ ok: true }> {
    return await this.projectSourceService.deleteSource(sourceId);
  }

  /**
   * Updates source metadata and settings.
   *
   * @param sourceId Source identifier.
   * @param patch Source patch.
   *
   * @returns Updated source.
   */
  async updateSource(
    sourceId: string,
    patch: Partial<Pick<OpenCodexSource, "name">> & {
      settings?: Partial<OpenCodexSourceLocalSettings>;
    }
  ): Promise<OpenCodexSource> {
    return await this.projectSourceService.updateSource(sourceId, patch);
  }

  /**
   * Opens and caches a project.
   *
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @param createIfMissing Whether the directory may be created.
   *
   * @returns Opened project.
   */
  async openProject(
    projectPath: string,
    sourceId: string | null,
    createIfMissing: boolean
  ): Promise<OpenCodexProject> {
    return await this.projectSourceService.openProject(projectPath, sourceId, createIfMissing);
  }

  /**
   * Opens the host project directory picker.
   *
   * @param mode Picker mode.
   * @param sourceId Source identifier, or `null`.
   *
   * @returns Opened project, or `null` when cancelled.
   */
  async pickProjectDirectory(
    mode: "open" | "create",
    sourceId: string | null
  ): Promise<OpenCodexProject | null> {
    return await this.projectSourceService.pickProjectDirectory(mode, sourceId);
  }

  /**
   * Opens the host image picker.
   *
   * @returns Selected image attachments.
   */
  async pickImageFiles(): Promise<OpenCodexImageAttachment[]> {
    return await this.options.pickImageFiles?.() ?? [];
  }

  /**
   * Caches project metadata.
   *
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   *
   * @returns Cached project, or `null`.
   */
  private async cacheProject(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<OpenCodexProject | null> {
    return await this.projectSourceService.cacheProject(projectPath, sourceId);
  }

  /**
   * Lists thread metadata.
   *
   * @param scope Thread list scope.
   * @param projectPath Current project path.
   * @param sourceId Source identifier, or `null`.
   * @param searchTerm Optional search text.
   *
   * @returns Thread collection.
   */
  async listThreads(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId: string | null,
    searchTerm?: string
  ): Promise<OpenCodexThread[]> {
    return await this.threadConversationService.listThreads(scope, projectPath, sourceId, searchTerm);
  }

  /**
   * Opens a thread and loads its current turns.
   *
   * @param threadId Thread identifier.
   *
   * @returns Opened thread and turns.
   */
  async openThread(threadId: string): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.threadConversationService.openThread(threadId);
  }

  /**
   * Loads older messages for a thread.
   *
   * @param threadId Thread identifier.
   *
   * @returns Older turn result.
   */
  async loadOlderThreadMessages(
    threadId: string
  ): Promise<{ turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean }> {
    return await this.threadConversationService.loadOlderThreadMessages(threadId);
  }

  /**
   * Recovers a thread after a recoverable process error.
   *
   * @param threadId Thread identifier.
   *
   * @returns Success result.
   */
  async recoverThread(threadId: string): Promise<{ ok: true }> {
    return await this.threadConversationService.recoverThread(threadId);
  }

  /**
   * Creates a thread in a project.
   *
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   *
   * @returns Created thread and initial turns.
   */
  async createThread(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.threadConversationService.createThread(projectPath, sourceId);
  }

  /**
   * Starts a user turn.
   *
   * @param threadId Thread identifier, or `null` to create one.
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @param text User text.
   * @param attachments Image attachments.
   * @param model Optional model override.
   * @param reasoningEffort Optional reasoning effort override.
   *
   * @returns Thread and turn identifiers.
   */
  async startTurn(
    threadId: string | null,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: "low" | "medium" | "high" | "xhigh" | null
  ): Promise<{ threadId: string; turnId: string }> {
    return await this.threadConversationService.startTurn(
      threadId,
      projectPath,
      sourceId,
      text,
      attachments,
      references,
      model,
      reasoningEffort
    );
  }

  /**
   * Steers a running turn.
   *
   * @param threadId Thread identifier.
   * @param turnId Active turn identifier.
   * @param text User text.
   * @param attachments Image attachments.
   *
   * @returns Thread and turn identifiers.
   */
  async steerTurn(
    threadId: string,
    turnId: string,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[]
  ): Promise<{ threadId: string; turnId: string }> {
    return await this.threadConversationService.steerTurn(
      threadId,
      turnId,
      text,
      attachments,
      references
    );
  }

  /**
   * Rolls back the last turn before restarting it with edited user input.
   *
   * @param threadId Thread identifier.
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @param text Edited user text.
   * @param attachments Image attachments.
   * @param model Optional model override.
   * @param reasoningEffort Optional reasoning effort override.
   *
   * @returns Thread identifier after rollback.
   */
  async editLastTurn(
    threadId: string,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: "low" | "medium" | "high" | "xhigh" | null
  ): Promise<{ threadId: string }> {
    return await this.threadConversationService.editLastTurn(
      threadId,
      projectPath,
      sourceId,
      text,
      attachments,
      references,
      model,
      reasoningEffort
    );
  }

  /**
   * Interrupts a running turn.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   *
   * @returns Promise resolved when Codex accepts the interrupt.
   */
  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.threadConversationService.interruptTurn(threadId, turnId);
  }

  /**
   * Starts an inline review of the current thread.
   *
   * @param threadId Thread identifier.
   *
   * @returns Success result.
   */
  async startThreadReview(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    return await this.threadConversationService.startReview(threadId, projectPath);
  }

  /**
   * Starts context compaction for a thread.
   *
   * @param threadId Thread identifier.
   *
   * @returns Success result.
   */
  async compactThread(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    return await this.threadConversationService.compactThread(threadId, projectPath);
  }

  /**
   * Renames a thread.
   *
   * @param threadId Thread identifier.
   * @param name New title.
   *
   * @returns Promise resolved when rename completes.
   */
  async renameThread(threadId: string, name: string): Promise<void> {
    await this.threadConversationService.renameThread(threadId, name);
  }

  /**
   * Opens an external link through the host.
   *
   * @param href Link target.
   * @param projectPath Project path used as context.
   *
   * @returns Success result.
   */
  async openLink(
    href: string,
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ ok: true }> {
    const target = href.trim();

    if (target.length === 0) {
      return { ok: true };
    }

    if (this.options.openExternalLink === undefined) {
      throw new Error(getBackendLabels(this.settings.language).missingLinkHandler);
    }

    const source = sourceId === null ? null : await this.resolveSource(sourceId);
    const openerCommand = source?.settings.openFileCommand ?? null;

    await this.options.openExternalLink(
      target,
      this.resolveCurrentProjectPath(projectPath),
      openerCommand
    );
    return { ok: true };
  }

  /**
   * Opens a project folder through its configured source opener.
   *
   * @param projectPath Project folder path.
   * @param sourceId Source identifier.
   *
   * @returns Success result.
   */
  async openProjectInIde(projectPath: string, sourceId: string | null): Promise<{ ok: true }> {
    if (sourceId === null) {
      return { ok: true };
    }

    const source = await this.resolveSource(sourceId);
    const openerCommand = source.settings.openFolderCommand;

    if (openerCommand === null || this.options.openExternalLink === undefined) {
      return { ok: true };
    }

    await this.options.openExternalLink(projectPath, projectPath, openerCommand);
    return { ok: true };
  }

  /**
   * Lists available Codex models.
   *
   * @returns Model identifiers.
   */
  async listModels(): Promise<string[]> {
    const client = await this.ensureClient();

    try {
      const response = await client.request("model/list", { limit: 100 });
      const models = readModels(response);
      const resolvedModels = models.length > 0 ? models : fallbackModels();
      this.emit({ type: "models.updated", models: resolvedModels });
      return resolvedModels;
    } catch (error) {
      this.options.logger?.(`model/list unavailable: ${String(error)}`);
      const models = fallbackModels();
      this.emit({ type: "models.updated", models });
      return models;
    }
  }

  /**
   * Reads current Codex account usage limits.
   *
   * @returns Usage limits, or `null` when unavailable.
   */
  async readUsageLimits(): Promise<OpenCodexUsageLimits | null> {
    const client = await this.ensureClient();

    try {
      const response = await client.request("account/rateLimits/read", undefined);
      const usage = mapUsageLimitsResponse(response);
      this.emit({ type: "usage.updated", usage });
      return usage;
    } catch (error) {
      this.options.logger?.(`account/rateLimits/read unavailable: ${String(error)}`);
      this.emit({ type: "usage.updated", usage: null });
      return null;
    }
  }

  /**
   * Lists plugins visible from a Codex source.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   * @returns Plugin marketplaces.
   */
  async listPlugins(sourceId: string | null): Promise<OpenCodexPluginListResult> {
    return await this.pluginService.list(sourceId);
  }

  /**
   * Reads one plugin detail from a Codex source.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   * @param marketplaceName Marketplace identifier.
   * @param marketplacePath Local marketplace path, when available.
   * @param pluginName Plugin name inside the marketplace.
   * @returns Plugin detail.
   */
  async readPlugin(
    sourceId: string | null,
    marketplaceName: string,
    marketplacePath: string | null,
    pluginName: string
  ): Promise<OpenCodexPluginDetail> {
    return await this.pluginService.read({
      sourceId,
      marketplaceName,
      marketplacePath,
      pluginName
    });
  }

  /**
   * Installs one plugin through a Codex source.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   * @param marketplaceName Marketplace identifier.
   * @param marketplacePath Local marketplace path, when available.
   * @param pluginName Plugin name inside the marketplace.
   * @returns Installation result.
   */
  async installPlugin(
    sourceId: string | null,
    marketplaceName: string,
    marketplacePath: string | null,
    pluginName: string
  ): Promise<OpenCodexPluginInstallResult> {
    return await this.pluginService.install({
      sourceId,
      marketplaceName,
      marketplacePath,
      pluginName
    });
  }

  /**
   * Uninstalls one plugin through a Codex source.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   * @param pluginId Installed plugin identifier.
   * @returns Success result.
   */
  async uninstallPlugin(sourceId: string | null, pluginId: string): Promise<{ ok: true }> {
    return await this.pluginService.uninstall(sourceId, pluginId);
  }

  /**
   * Reads Git status for a project through its Codex source.
   *
   * @param projectPath Project path.
   * @param sourceId Source identifier.
   *
   * @returns Parsed Git status.
   */
  async readGitStatus(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await this.gitService.status(projectPath, sourceId);
  }

  /**
   * Stages selected Git paths.
   *
   * @param projectPath Project path.
   * @param sourceId Source identifier.
   * @param paths Relative paths to stage.
   *
   * @returns Refreshed Git status.
   */
  async stageGitPaths(
    projectPath: string,
    sourceId: string | null,
    paths: string[]
  ): Promise<OpenCodexGitStatus> {
    return await this.gitService.stage(projectPath, sourceId, paths);
  }

  /**
   * Unstages selected Git paths.
   *
   * @param projectPath Project path.
   * @param sourceId Source identifier.
   * @param paths Relative paths to unstage.
   *
   * @returns Refreshed Git status.
   */
  async unstageGitPaths(
    projectPath: string,
    sourceId: string | null,
    paths: string[]
  ): Promise<OpenCodexGitStatus> {
    return await this.gitService.unstage(projectPath, sourceId, paths);
  }

  /**
   * Creates a Git commit from staged paths.
   *
   * @param projectPath Project path.
   * @param sourceId Source identifier.
   * @param message Commit message.
   *
   * @returns Commit result.
   */
  async commitGitChanges(
    projectPath: string,
    sourceId: string | null,
    message: string
  ): Promise<OpenCodexGitCommitResult> {
    return await this.gitService.commit(projectPath, sourceId, message);
  }

  /**
   * Pushes local commits to the configured upstream.
   *
   * @param projectPath Project path.
   * @param sourceId Source identifier.
   *
   * @returns Refreshed Git status.
   */
  async pushGitChanges(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await this.gitService.push(projectPath, sourceId);
  }

  /**
   * Lists commands configured for a project.
   *
   * @param projectId Project identifier.
   *
   * @returns Project commands.
   */
  async listProjectCommands(projectId: string): Promise<OpenCodexProjectCommand[]> {
    return await this.projectCommandService.listCommands(projectId);
  }

  /**
   * Creates a project command.
   *
   * @param projectId Project identifier.
   * @param name Command display name.
   * @param command Command line.
   * @param allowParallel Whether multiple instances may run at once.
   * @param persistLogs Whether output should be written to disk.
   *
   * @returns Created command.
   */
  async createProjectCommand(
    projectId: string,
    name: string,
    command: string,
    allowParallel: boolean,
    persistLogs: boolean
  ): Promise<OpenCodexProjectCommand> {
    return await this.projectCommandService.createCommand({
      projectId,
      name,
      command,
      allowParallel,
      persistLogs
    });
  }

  /**
   * Updates a project command.
   *
   * @param commandId Command identifier.
   * @param patch Command patch.
   *
   * @returns Updated command.
   */
  async updateProjectCommand(
    commandId: string,
    patch: {
      name?: string;
      command?: string;
      allowParallel?: boolean;
      persistLogs?: boolean;
    }
  ): Promise<OpenCodexProjectCommand> {
    return await this.projectCommandService.updateCommand(commandId, patch);
  }

  /**
   * Deletes a project command.
   *
   * @param commandId Command identifier.
   *
   * @returns Success result.
   */
  async deleteProjectCommand(commandId: string): Promise<{ ok: true }> {
    await this.projectCommandService.deleteCommand(commandId);
    return { ok: true };
  }

  /**
   * Starts a project command.
   *
   * @param commandId Command identifier.
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   *
   * @returns Started run.
   */
  async runProjectCommand(
    commandId: string,
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexProjectCommandRun> {
    return await this.projectCommandService.runCommand(commandId, projectPath, sourceId);
  }

  /**
   * Stops a project command run.
   *
   * @param runId Run identifier.
   *
   * @returns Success result.
   */
  async stopProjectCommandRun(runId: string): Promise<{ ok: true }> {
    return await this.projectCommandService.stopRun(runId);
  }

  /**
   * Reads the editable commit generation prompt.
   *
   * @returns Prompt state.
   */
  async readCommitPrompt(): Promise<OpenCodexCommitPrompt> {
    return await this.commitMessageService.readPrompt();
  }

  /**
   * Persists the editable commit generation prompt.
   *
   * @param prompt Prompt content.
   * @returns Prompt state.
   */
  async updateCommitPrompt(prompt: string): Promise<OpenCodexCommitPrompt> {
    return await this.commitMessageService.updatePrompt(prompt);
  }

  /**
   * Restores the default commit generation prompt.
   *
   * @returns Prompt state.
   */
  async resetCommitPrompt(): Promise<OpenCodexCommitPrompt> {
    return await this.commitMessageService.resetPrompt();
  }

  /**
   * Generates a commit message from currently staged changes.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param instruction Optional generation instruction.
   * @param model Optional model override.
   * @param language Output language.
   * @returns Generated commit message.
   */
  async generateGitCommitMessage(
    projectPath: string,
    sourceId: string | null,
    instruction: string,
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    language: OpenCodexCommitMessageLanguage
  ): Promise<OpenCodexCommitMessageGenerationResult> {
    return await this.commitMessageService.generateCommitMessage(
      projectPath,
      sourceId,
      instruction,
      model,
      reasoningEffort,
      language
    );
  }

  /**
   * Pulls remote commits from the configured upstream.
   *
   * @param projectPath Project path.
   * @param sourceId Source identifier.
   *
   * @returns Refreshed Git status.
   */
  async pullGitChanges(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await this.gitService.pull(projectPath, sourceId);
  }

  /**
   * Routes Codex notifications into the notification service.
   *
   * @param notification Codex notification.
   * @param sourceId Source that produced the notification.
   *
   * @returns Nothing.
   */
  private handleNotification(notification: CodexNotification, sourceId: string): void {
    const threadId = readString(readObject(notification.params).threadId);

    if (threadId.length > 0 && this.ignoredNotificationThreadIds.has(threadId)) {
      return;
    }

    this.threadConversationService.recordNotification(notification);
    this.projectCommandService.handleNotification(notification);
    this.notificationService.handleNotification(notification, sourceId);

    if (notification.method === "account/rateLimits/updated") {
      this.emit({
        type: "usage.updated",
        usage: mapUsageLimitsNotification(notification.params)
      });
    }

    if (notification.method === "turn/completed") {
      void this.readUsageLimits();
    }
  }

  /**
   * Routes Codex server requests into the approval service.
   *
   * @param request Codex server request.
   * @param sourceId Source that owns the request.
   *
   * @returns Nothing.
   */
  private handleServerRequest(request: CodexServerRequest, sourceId: string): void {
    this.approvalService.handleServerRequest(request, sourceId);
  }

  /**
   * Trusts a project in Codex configuration.
   *
   * @param projectPath Project path.
   *
   * @returns Success result.
   */
  async trustProject(projectPath: string): Promise<{ ok: true }> {
    return await this.projectTrustService.trustProject(projectPath);
  }

  /**
   * Dismisses a project trust request.
   *
   * @param projectPath Project path.
   *
   * @returns Nothing.
   */
  dismissProjectTrustRequest(projectPath: string): void {
    this.projectTrustService.dismissProjectTrustRequest(projectPath);
  }

  /**
   * Handles Codex stderr output.
   *
   * @param message stderr message.
   * @param sourceId Source that produced the message.
   *
   * @returns Nothing.
   */
  private handleCodexStderr(message: string, sourceId: string): void {
    this.projectTrustService.handleCodexStderr(message, sourceId);
  }

  /**
   * Resolves a pending approval request.
   *
   * @param approvalId Approval identifier.
   * @param decision User decision.
   *
   * @returns Nothing.
   */
  resolveApproval(approvalId: string, decision: OpenCodexApprovalDecision): void {
    this.approvalService.resolveApproval(approvalId, decision);
  }

  /**
   * Emits a normalized client error.
   *
   * @param error Client error.
   *
   * @returns Nothing.
   */
  private handleClientError(error: Error): void {
    const normalized = normalizeError(error, this.settings.language);
    this.persistLog("error", normalized.message, normalized.details);
    this.emit({ type: "error", message: normalized.message, details: normalized.details });
  }

  /**
   * Updates connection state after a source client closes.
   *
   * @param sourceId Source identifier.
   *
   * @returns Nothing.
   */
  private handleClientClose(sourceId: string): void {
    this.clientPool.deleteClient(sourceId);

    if (!this.clientPool.hasClients()) {
      this.emit({ type: "connection.status", status: "stopped" });
    }
  }

  /**
   * Reads the recoverable thread identifier for a failed request.
   *
   * @param request Request that failed.
   * @param error Unknown thrown value.
   *
   * @returns Thread identifier, or `null`.
   */
  private readRecoverableThreadId(request: OpenCodexRequest, error: unknown): string | null {
    if (!(error instanceof CodexProcessError)) {
      return null;
    }

    if (request.type === "turn.start") {
      return request.threadId;
    }

    if (
      request.type === "threads.open" ||
      request.type === "threads.recover" ||
      request.type === "thread.review" ||
      request.type === "thread.compact"
    ) {
      return request.threadId;
    }

    return null;
  }

  /**
   * Emits an event to the host transport.
   *
   * @param event Event payload.
   *
   * @returns Nothing.
   */
  private emit(event: OpenCodexEvent): void {
    this.options.emit(event);
  }

  private persistLog(
    type: OpenCodexLogEntry["type"],
    message: string,
    details: unknown
  ): void {
    if (this.cacheRepository === null) {
      return;
    }

    void this.cacheRepository.createLog({ type, message, details }).then((log) => {
      this.emit({ type: "logs.created", log });
    }).catch((error: unknown) => {
      this.options.logger?.(`application log write failed: ${String(error)}`);
    });
  }

  /**
   * Reads cached projects through the project service.
   *
   * @returns Cached projects.
   */
  private async readCachedProjects(): Promise<OpenCodexProject[]> {
    return await this.projectSourceService.readCachedProjects();
  }

  /**
   * Resolves a current project path with runtime fallback.
   *
   * @param projectPath Project path candidate.
   *
   * @returns Normalized project path, or `null`.
   */
  private resolveCurrentProjectPath(projectPath: string | null): string | null {
    return normalizeProjectPath(projectPath) ?? normalizeProjectPath(this.options.projectPath);
  }

  /**
   * Ensures sources are initialized.
   *
   * @returns Promise resolved when initialization completes.
   */
  private async ensureSourcesInitialized(): Promise<void> {
    await this.projectSourceService.ensureSourcesInitialized();
  }

  /**
   * Resolves a source.
   *
   * @param sourceId Source identifier, or `null`.
   *
   * @returns Resolved source.
   */
  private async resolveSource(sourceId: string | null): Promise<CachedSource> {
    return await this.projectSourceService.resolveSource(sourceId);
  }

  /**
   * Lists sources as UI protocol objects.
   *
   * @returns Source collection.
   */
  private async listOpenCodexSources(): Promise<OpenCodexSource[]> {
    return await this.projectSourceService.listOpenCodexSources();
  }

  /**
   * Restarts a source client after command changes.
   *
   * @param sourceId Source identifier.
   *
   * @returns Promise resolved when restarted.
   */
  private async restartSourceClient(sourceId: string): Promise<void> {
    await this.clientPool.restartClient(sourceId);
  }

  /**
   * Applies a Codex-generated thread title to memory and cache.
   *
   * @param threadId Thread identifier.
   * @param title Codex-generated title.
   *
   * @returns Nothing.
   */
  private applyCodexThreadTitle(threadId: string, title: string): void {
    const cacheEntry = this.threadTurnCache.updateCodexThreadTitle(threadId, title);

    if (cacheEntry !== null) {
      this.emit({ type: "thread.metadata.updated", thread: cacheEntry.thread });
    }

    void this.threadCacheService.writeCodexTitle(threadId, title);
  }

  /**
   * Refreshes a completed turn after Codex has had time to persist its items.
   *
   * @param threadId Thread identifier.
   *
   * @returns Nothing.
   */
  private syncCompletedTurn(threadId: string): void {
    void this.threadConversationService.syncCompletedTurn(threadId).catch((error: unknown) => {
      this.handleClientError(toError(error));
    });
  }

}

function calculateRetentionCutoff(amount: number, unit: OpenCodexLogRetentionUnit): string {
  const normalizedAmount = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 24;
  const cutoff = new Date();

  if (unit === "hours") {
    cutoff.setHours(cutoff.getHours() - normalizedAmount);
  }

  if (unit === "days") {
    cutoff.setDate(cutoff.getDate() - normalizedAmount);
  }

  if (unit === "weeks") {
    cutoff.setDate(cutoff.getDate() - normalizedAmount * 7);
  }

  if (unit === "months") {
    cutoff.setMonth(cutoff.getMonth() - normalizedAmount);
  }

  return cutoff.toISOString();
}

function readRelativeFilePath(root: string, filePath: string): string {
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/+$/, "");
  const normalizedPath = filePath.replaceAll("\\", "/");
  const rootPrefix = `${normalizedRoot}/`;

  if (normalizedPath.startsWith(rootPrefix)) {
    return normalizedPath.slice(rootPrefix.length);
  }

  return normalizedPath.replace(/^\/+/, "");
}

function scoreSkillSearchResult(
  name: string,
  displayName: string | undefined,
  query: string
): number {
  const normalizedQuery = query.trim().toLowerCase();
  const candidates = [
    name.toLowerCase(),
    displayName?.toLowerCase() ?? ""
  ];

  if (normalizedQuery.length === 0) {
    return 1;
  }

  if (candidates.some((candidate) => candidate === normalizedQuery)) {
    return 100;
  }

  if (candidates.some((candidate) => candidate.startsWith(normalizedQuery))) {
    return 80;
  }

  if (candidates.some((candidate) => candidate.includes(normalizedQuery))) {
    return 60;
  }

  if (candidates.some((candidate) => isFuzzyMatch(candidate, normalizedQuery))) {
    return 30;
  }

  return -1;
}

function isFuzzyMatch(candidate: string, query: string): boolean {
  let candidateIndex = 0;

  for (const queryCharacter of query) {
    candidateIndex = candidate.indexOf(queryCharacter, candidateIndex);

    if (candidateIndex === -1) {
      return false;
    }

    candidateIndex += 1;
  }

  return true;
}
