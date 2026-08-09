import type {
  CachedProjectCommandRuleCreateInput,
  CachedProjectCommandRuleUpdateInput
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexApprovalDecision,
  OpenCodexCodexReleaseCheck,
  OpenCodexCommitMessageGenerationResult,
  OpenCodexCollaborationEvent,
  OpenCodexCollaborationQuery,
  OpenCodexCommitMessageLanguage,
  OpenCodexComposerReference,
  OpenCodexCommitPrompt,
  OpenCodexFileSearchResult,
  OpenCodexGitBranch,
  OpenCodexGitBranchKind,
  OpenCodexGitCommitDetails,
  OpenCodexImageAttachment,
  OpenCodexGitCommitResult,
  OpenCodexGitLogPage,
  OpenCodexGitRemote,
  OpenCodexGitStatus,
  OpenCodexGitTagFetchResult,
  OpenCodexGitTagListResult,
  OpenCodexLogEntry,
  OpenCodexLogPage,
  OpenCodexLogRetentionUnit,
  OpenCodexModel,
  OpenCodexPluginDetail,
  OpenCodexPluginInstallResult,
  OpenCodexPluginListResult,
  OpenCodexProject,
  OpenCodexProjectGroupsSnapshot,
  OpenCodexProjectStatistics,
  OpenCodexProjectPreferences,
  OpenCodexProjectCommand,
  OpenCodexProjectCommandRule,
  OpenCodexProjectCommandRuleApplyResult,
  OpenCodexProjectCommandRulesSnapshot,
  OpenCodexProjectCommandRuleTestResult,
  OpenCodexProjectCommandRun,
  OpenCodexProjectTask,
  OpenCodexProjectTaskStatus,
  OpenCodexRequest,
  OpenCodexReasoningEffort,
  OpenCodexSettings,
  OpenCodexSkillSearchResult,
  OpenCodexSource,
  OpenCodexSourceColor,
  OpenCodexSourceKind,
  OpenCodexSourceSettingsPatch,
  OpenCodexThread,
  OpenCodexThreadEventLogPage,
  OpenCodexThreadRuntimeStatus,
  OpenCodexToolVersionStatus,
  OpenCodexTurn,
  OpenCodexUsageHistory,
  OpenCodexUsageHistoryAggregation,
  OpenCodexUsageResetConsumeResult,
  OpenCodexUsageSnapshot
} from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexBackendOptions } from "./types.js";
import { isPrereleaseVersion } from "./version.js";
import type { UsageRateLimitLogReason } from "./backend/usageRateLimitDiagnostics.js";
import { createBackendServiceGraph } from "./backend/runtime/createBackendServiceGraph.js";
import type { BackendServiceGraph } from "./backend/runtime/BackendServiceGraph.js";

/**
 * Coordinates backend services exposed to the UI transport.
 */
export class OpenCodexBackendRuntime {
  /** Whether this runtime belongs to an application pre-release build. */
  readonly isPrerelease: boolean;
  /** Fully wired services owned by this runtime instance. */
  private readonly services: BackendServiceGraph;

  /**
   * Creates a backend runtime and wires its internal services.
   *
   * @param options Host integration and persistence options.
   */
  constructor(private readonly options: OpenCodexBackendOptions) {
    this.isPrerelease = isPrereleaseVersion(options.appVersion);
    this.services = createBackendServiceGraph(options, this.isPrerelease);
  }

  /**
   * Releases runtime resources.
   *
   * @returns Promise resolved when resources are disposed.
   */
  async dispose(): Promise<void> {
    this.services.notificationCoordinator.flushAll();
    await this.services.clientPool.dispose();
    await this.services.cacheRepository?.close();
  }

  /**
   * Sends initial settings, sources, projects, and models to the UI.
   *
   * @returns Success result.
   */
  async bootstrap(): Promise<{ ok: true }> {
    await this.services.projectRuntimeHandler.ensureSourcesInitialized();
    await this.services.codexUpdateService.checkLatestRelease(false);
    this.services.events.emit({
      type: "app.bootstrap",
      settings: this.services.settings.getSettings(),
      sources: await this.services.projectRuntimeHandler.listOpenCodexSources(),
      projectPath: this.options.projectPath,
      appVersion: this.options.appVersion ?? null,
      isPrerelease: this.isPrerelease
    });
    await this.listProjects();
    await this.listProjectGroups();
    await this.listModels();
    await this.readUsageLimits(this.services.settings.getSettings().defaultSourceId, "bootstrap");
    return { ok: true };
  }

  /** Returns the current backend settings. */
  getSettings(): OpenCodexSettings {
    return this.services.settings.getSettings();
  }

  /**
   * Updates and persists backend settings.
   *
   * @param patch Settings patch.
   *
   * @returns Updated settings.
   */
  async updateSettings(patch: Partial<OpenCodexSettings>): Promise<OpenCodexSettings> {
    const nextSettings = { ...this.services.settings.getSettings(), ...patch };

    if (!nextSettings.developerMode || !nextSettings.performanceMonitoringEnabled) {
      nextSettings.advancedPerformanceMonitoringEnabled = false;
    }

    this.services.settings.setSettings(nextSettings);
    await this.options.saveSettings?.(nextSettings);
    return nextSettings;
  }

  /** Opens the host executable picker for source commands. */
  async pickSourceExecutable(): Promise<string | null> {
    return await this.services.hostIntegrationService.pickSourceExecutable();
  }

  /** Searches project files through the Codex source filesystem. */
  async searchProjectFiles(
    projectPath: string,
    sourceId: string | null,
    query: string,
    limit: number
  ): Promise<OpenCodexFileSearchResult[]> {
    return await this.services.projectSearchService.searchProjectFiles(projectPath, sourceId, query, limit);
  }

  /** Searches Codex skills available for a project. */
  async searchProjectSkills(
    projectPath: string,
    sourceId: string | null,
    query: string,
    limit: number
  ): Promise<OpenCodexSkillSearchResult[]> {
    return await this.services.projectSearchService.searchProjectSkills(projectPath, sourceId, query, limit);
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
    return this.services.runtimeErrorCoordinator.handleRequestError(request, error);
  }

  /** Lists cached projects. */
  async listProjects(): Promise<OpenCodexProject[]> {
    return await this.services.projectRuntimeHandler.listProjects();
  }

  /** Lists the OpenCodexUI-only project group tree. */
  async listProjectGroups(): Promise<OpenCodexProjectGroupsSnapshot> {
    return await this.services.projectRuntimeHandler.listProjectGroups();
  }

  /** Creates a project group; omitted parent and color use the root group and blue. */
  async createProjectGroup(
    name: string,
    parentGroupId: string | null = null,
    color: OpenCodexSourceColor = "blue"
  ): Promise<OpenCodexProjectGroupsSnapshot> {
    return await this.services.projectRuntimeHandler.createProjectGroup(name, parentGroupId, color);
  }

  /** Updates a project group. */
  async updateProjectGroup(
    groupId: string,
    patch: { name?: string; color?: OpenCodexSourceColor; isCollapsed?: boolean }
  ): Promise<OpenCodexProjectGroupsSnapshot> {
    return await this.services.projectRuntimeHandler.updateProjectGroup(groupId, patch);
  }

  /** Deletes a project group while retaining its children. */
  async deleteProjectGroup(groupId: string): Promise<OpenCodexProjectGroupsSnapshot> {
    return await this.services.projectRuntimeHandler.deleteProjectGroup(groupId);
  }

  /** Assigns a project to a group or to the ungrouped root. */
  async assignProjectToGroup(
    projectId: string,
    groupId: string | null
  ): Promise<OpenCodexProjectGroupsSnapshot> {
    return await this.services.projectRuntimeHandler.assignProjectToGroup(projectId, groupId);
  }

  /** Lists persisted application logs. */
  async listLogs(beforeCreatedAt: string | null, limit: number): Promise<OpenCodexLogPage> {
    return await this.services.applicationLogService.listLogs(beforeCreatedAt, limit);
  }

  /** Deletes one persisted application log. */
  async deleteLog(logId: string): Promise<{ ok: true }> {
    return await this.services.applicationLogService.deleteLog(logId);
  }

  /** Clears all logs or retains entries newer than the requested amount and unit. */
  async clearLogs(
    mode: "all" | "olderThan",
    amount: number,
    unit: OpenCodexLogRetentionUnit
  ): Promise<{ ok: true }> {
    return await this.services.applicationLogService.clearLogs(mode, amount, unit);
  }

  /** Persists an application log entry. */
  async createLog(
    type: OpenCodexLogEntry["type"],
    message: string,
    details: unknown
  ): Promise<{ ok: true }> {
    return await this.services.applicationLogService.createLog(type, message, details);
  }

  /** Lists configured sources. */
  async listSources(): Promise<OpenCodexSource[]> {
    return await this.services.projectRuntimeHandler.listSources();
  }

  /** Creates a source. */
  async createSource(
    name: string,
    kind: OpenCodexSourceKind,
    settings: OpenCodexSourceSettingsPatch
  ): Promise<OpenCodexSource> {
    return await this.services.projectRuntimeHandler.createSource(name, kind, settings);
  }

  /** Synchronizes one source, or every source when `sourceId` is `null`. */
  async syncSources(sourceId: string | null): Promise<OpenCodexProject[]> {
    return await this.services.projectRuntimeHandler.syncSources(sourceId);
  }

  /** Refreshes release metadata, bypassing cache when forced, and emits the source snapshot. */
  async checkCodexRelease(force: boolean): Promise<OpenCodexCodexReleaseCheck> {
    return await this.services.projectRuntimeHandler.checkCodexRelease(force);
  }

  /** Updates one source, rejecting active turns and restarting its client afterward. */
  async updateCodexSource(sourceId: string): Promise<OpenCodexSource[]> {
    return await this.services.projectRuntimeHandler.updateCodexSource(sourceId);
  }

  /** Updates project hidden state. */
  async setProjectHidden(projectId: string, isHidden: boolean): Promise<{ ok: true }> {
    return await this.services.projectRuntimeHandler.setProjectHidden(projectId, isHidden);
  }

  /** Updates a cached project display name. */
  async updateProjectDisplayName(
    projectId: string,
    displayName: string | null
  ): Promise<OpenCodexProject> {
    return await this.services.projectRuntimeHandler.updateProjectDisplayName(projectId, displayName);
  }

  /** Updates project preferences. */
  async updateProjectPreferences(
    projectId: string,
    patch: Partial<OpenCodexProjectPreferences>
  ): Promise<OpenCodexProject> {
    return await this.services.projectRuntimeHandler.updateProjectPreferences(projectId, patch);
  }

  /** Synchronizes project context folders into `.codex/config.toml`. */
  async syncProjectContext(projectId: string): Promise<OpenCodexProject> {
    return await this.services.projectRuntimeHandler.syncProjectContext(projectId);
  }

  /** Deletes a project from the local cache. */
  async deleteProject(projectId: string): Promise<{ ok: true }> {
    return await this.services.projectRuntimeHandler.deleteProject(projectId);
  }

  /** Deletes a source; the configured default source cannot be deleted. */
  async deleteSource(sourceId: string): Promise<{ ok: true }> {
    return await this.services.projectRuntimeHandler.deleteSource(sourceId);
  }

  /** Updates source metadata and settings. */
  async updateSource(
    sourceId: string,
    patch: Partial<Pick<OpenCodexSource, "name">> & {
      settings?: OpenCodexSourceSettingsPatch;
    }
  ): Promise<OpenCodexSource> {
    return await this.services.projectRuntimeHandler.updateSource(sourceId, patch);
  }

  /** Opens and caches a project, optionally creating its path in the selected source. */
  async openProject(
    projectPath: string,
    sourceId: string | null,
    createIfMissing: boolean
  ): Promise<OpenCodexProject> {
    return await this.services.projectRuntimeHandler.openProject(projectPath, sourceId, createIfMissing);
  }

  /** Opens the host project directory picker. */
  async pickProjectDirectory(
    mode: "open" | "create",
    sourceId: string | null
  ): Promise<OpenCodexProject | null> {
    return await this.services.projectRuntimeHandler.pickProjectDirectory(mode, sourceId);
  }

  /** Opens the host directory picker for an external context folder. */
  async pickProjectContextFolder(): Promise<string | null> {
    return await this.services.projectRuntimeHandler.pickProjectContextFolder();
  }

  /** Opens the host image picker. */
  async pickImageFiles(): Promise<OpenCodexImageAttachment[]> {
    return await this.services.hostIntegrationService.pickImageFiles();
  }

  /** Lists thread metadata, excluding archived threads by default. */
  async listThreads(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId: string | null,
    searchTerm?: string,
    isArchived = false
  ): Promise<OpenCodexThread[]> {
    return await this.services.threadRuntimeHandler.listThreads(
      scope,
      projectPath,
      sourceId,
      searchTerm,
      isArchived
    );
  }

  /** Reads aggregate token usage for one project from the local cache. */
  async readProjectStatistics(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexProjectStatistics> {
    return await this.services.projectRuntimeHandler.readProjectStatistics(projectPath, sourceId);
  }

  /** Archives a thread through Codex and local cache. */
  async archiveThread(threadId: string): Promise<{ ok: true }> {
    return await this.services.threadRuntimeHandler.archiveThread(threadId);
  }

  /** Permanently deletes a thread through Codex and local cache. */
  async deleteThread(threadId: string): Promise<{ ok: true }> {
    return await this.services.threadRuntimeHandler.deleteThread(threadId);
  }

  /** Restores an archived thread through Codex and local cache. */
  async unarchiveThread(threadId: string): Promise<{ ok: true }> {
    return await this.services.threadRuntimeHandler.unarchiveThread(threadId);
  }

  /** Opens a thread and loads its current turns. */
  async openThread(
    threadId: string,
    sourceId: string | null = null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.services.threadRuntimeHandler.openThread(threadId, sourceId);
  }

  /** Reads the in-memory metadata trace for one chat thread. */
  readThreadEventLog(
    threadId: string,
    sourceId: string | null,
    limit: number
  ): OpenCodexThreadEventLogPage {
    return this.services.threadRuntimeHandler.readThreadEventLog(threadId, sourceId, limit);
  }

  /** Lists sub-agent threads spawned by a parent thread. */
  async listSubAgentThreads(
    parentThreadId: string,
    sourceId: string | null
  ): Promise<OpenCodexThread[]> {
    return await this.services.threadRuntimeHandler.listSubAgentThreads(parentThreadId, sourceId);
  }

  /** Lists persisted collaboration events using explicit source-aware filters. */
  async listCollaborationEvents(
    query: OpenCodexCollaborationQuery
  ): Promise<OpenCodexCollaborationEvent[]> {
    return await this.services.threadRuntimeHandler.listCollaborationEvents(query);
  }

  /** Reads a secondary thread without changing the selected chat. */
  async readThreadReadonly(
    threadId: string,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.services.threadRuntimeHandler.readThreadReadonly(threadId, sourceId);
  }

  /** Loads older messages for a thread. */
  async loadOlderThreadMessages(
    threadId: string
  ): Promise<{ turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean }> {
    return await this.services.threadRuntimeHandler.loadOlderThreadMessages(threadId);
  }

  /** Recovers a thread after a recoverable process error. */
  async recoverThread(threadId: string): Promise<{ ok: true }> {
    return await this.services.threadRuntimeHandler.recoverThread(threadId);
  }

  /** Creates a thread in a project. */
  async createThread(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.services.threadRuntimeHandler.createThread(projectPath, sourceId);
  }

  /** Persists the local composer model settings for a thread. */
  async updateThreadComposerSettings(
    threadId: string,
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null
  ): Promise<void> {
    await this.services.threadRuntimeHandler.updateThreadComposerSettings(
      threadId,
      model,
      reasoningEffort
    );
  }

  /** Starts a turn, creating its thread when `threadId` is `null` and applying turn options. */
  async startTurn(
    threadId: string | null,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    serviceTier: string | null
  ): Promise<{ threadId: string; turnId: string }> {
    return await this.services.threadRuntimeHandler.startTurn(
      threadId,
      projectPath,
      sourceId,
      text,
      attachments,
      references,
      model,
      reasoningEffort,
      serviceTier
    );
  }

  /** Steers a running turn. */
  async steerTurn(
    threadId: string,
    turnId: string,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[]
  ): Promise<{ threadId: string; turnId: string }> {
    return await this.services.threadRuntimeHandler.steerTurn(
      threadId,
      turnId,
      text,
      attachments,
      references
    );
  }

  /** Rolls back the last turn and refreshes state, applying model and reasoning-effort options. */
  async editLastTurn(
    threadId: string,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    serviceTier: string | null
  ): Promise<{ threadId: string }> {
    return await this.services.threadRuntimeHandler.editLastTurn(
      threadId,
      projectPath,
      sourceId,
      text,
      attachments,
      references,
      model,
      reasoningEffort,
      serviceTier
    );
  }

  /** Interrupts a running turn. */
  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.services.threadRuntimeHandler.interruptTurn(threadId, turnId);
  }

  /** Reads the runtime active/idle status for a thread. */
  async readThreadRuntimeStatus(threadId: string): Promise<OpenCodexThreadRuntimeStatus> {
    return await this.services.threadRuntimeHandler.readThreadRuntimeStatus(threadId);
  }

  /** Starts an inline review for a thread in the given project context. */
  async startThreadReview(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    return await this.services.threadRuntimeHandler.startThreadReview(threadId, projectPath);
  }

  /** Starts context compaction for a thread in the given project context. */
  async compactThread(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    return await this.services.threadRuntimeHandler.compactThread(threadId, projectPath);
  }

  /** Renames a thread. */
  async renameThread(threadId: string, name: string): Promise<void> {
    await this.services.threadRuntimeHandler.renameThread(threadId, name);
  }

  /** Opens a non-empty link with the selected source's opener and project context. */
  async openLink(
    href: string,
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ ok: true }> {
    return await this.services.hostIntegrationService.openLink(href, projectPath, sourceId);
  }

  /** Opens a project folder through its configured source opener. */
  async openProjectInIde(projectPath: string, sourceId: string | null): Promise<{ ok: true }> {
    return await this.services.hostIntegrationService.openProjectInIde(projectPath, sourceId);
  }

  /** Opens a local project folder with the host file manager. */
  async openProjectFolder(projectPath: string, sourceId: string | null): Promise<{ ok: true }> {
    return await this.services.hostIntegrationService.openProjectFolder(projectPath, sourceId);
  }

  /** Opens a host terminal with a local project as its working directory. */
  async openProjectTerminal(projectPath: string, sourceId: string | null): Promise<{ ok: true }> {
    return await this.services.hostIntegrationService.openProjectTerminal(projectPath, sourceId);
  }

  /** Lists available Codex models. */
  async listModels(): Promise<OpenCodexModel[]> {
    return await this.services.modelCatalogService.listModels(
      this.services.settings.getSettings().defaultSourceId
    );
  }

  /** Reads usage limits for the requested or configured default source; reason defaults to `"request"`. */
  async readUsageLimits(
    sourceId: string | null = null,
    reason: Exclude<UsageRateLimitLogReason, "accountRateLimitsUpdated"> = "request"
  ): Promise<OpenCodexUsageSnapshot | null> {
    return await this.services.usageRuntimeService.readUsageLimits(sourceId, reason);
  }

  /** Reads cached source-scoped usage history for an ISO range and optional aggregation. */
  async readUsageHistory(
    sourceId: string,
    from: string,
    to: string,
    aggregation?: OpenCodexUsageHistoryAggregation
  ): Promise<OpenCodexUsageHistory> {
    return await this.services.usageRuntimeService.readUsageHistory(sourceId, from, to, aggregation);
  }

  /** Consumes a source-scoped reset credit idempotently, then refreshes usage limits. */
  async consumeUsageReset(
    sourceId: string,
    creditId: string,
    idempotencyKey: string
  ): Promise<OpenCodexUsageResetConsumeResult> {
    return await this.services.usageRuntimeService.consumeUsageReset(sourceId, creditId, idempotencyKey);
  }

  /** Lists plugins visible from a Codex source. */
  async listPlugins(sourceId: string | null): Promise<OpenCodexPluginListResult> {
    return await this.services.pluginService.list(sourceId);
  }

  /** Reads one plugin detail from a Codex source. */
  async readPlugin(
    sourceId: string | null,
    marketplaceName: string,
    marketplacePath: string | null,
    pluginName: string
  ): Promise<OpenCodexPluginDetail> {
    return await this.services.pluginService.read({
      sourceId,
      marketplaceName,
      marketplacePath,
      pluginName
    });
  }

  /** Installs one plugin through a Codex source. */
  async installPlugin(
    sourceId: string | null,
    marketplaceName: string,
    marketplacePath: string | null,
    pluginName: string
  ): Promise<OpenCodexPluginInstallResult> {
    return await this.services.pluginService.install({
      sourceId,
      marketplaceName,
      marketplacePath,
      pluginName
    });
  }

  /** Uninstalls one plugin through a Codex source. */
  async uninstallPlugin(sourceId: string | null, pluginId: string): Promise<{ ok: true }> {
    return await this.services.pluginService.uninstall(sourceId, pluginId);
  }

  /** Reads the Git version available to the host runtime. */
  async readGitVersion(): Promise<OpenCodexToolVersionStatus> {
    return await this.services.gitRuntimeHandler.readGitVersion();
  }

  /** Reads Git status for a project through its Codex source. */
  async readGitStatus(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await this.services.gitRuntimeHandler.readGitStatus(projectPath, sourceId);
  }

  /** Initializes a Git repository for a project through its Codex source. */
  async initializeGitRepository(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitStatus> {
    return await this.services.gitRuntimeHandler.initializeGitRepository(projectPath, sourceId);
  }

  /** Lists configured Git remotes for a project. */
  async listGitRemotes(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitRemote[]> {
    return await this.services.gitRuntimeHandler.listGitRemotes(projectPath, sourceId);
  }

  /** Adds or updates one Git remote. */
  async upsertGitRemote(
    projectPath: string,
    sourceId: string | null,
    name: string,
    url: string
  ): Promise<OpenCodexGitStatus> {
    return await this.services.gitRuntimeHandler.upsertGitRemote(projectPath, sourceId, name, url);
  }

  /** Lists local and remote Git branches for a project. */
  async listGitBranches(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitBranch[]> {
    return await this.services.gitRuntimeHandler.listGitBranches(projectPath, sourceId);
  }

  /** Lists Git tags for a project. */
  async listGitTags(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitTagListResult> {
    return await this.services.gitRuntimeHandler.listGitTags(projectPath, sourceId);
  }

  /** Fetches remote Git tags and returns the refreshed local tag list. */
  async fetchGitTags(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitTagFetchResult> {
    return await this.services.gitRuntimeHandler.fetchGitTags(projectPath, sourceId);
  }

  /** Creates a lightweight Git tag. */
  async createGitTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string
  ): Promise<OpenCodexGitTagListResult> {
    return await this.services.gitRuntimeHandler.createGitTag(projectPath, sourceId, tagName);
  }

  /** Pushes one Git tag, optionally replacing the remote tag when `force` is true. */
  async pushGitTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string,
    force: boolean
  ): Promise<OpenCodexGitTagListResult> {
    return await this.services.gitRuntimeHandler.pushGitTag(projectPath, sourceId, tagName, force);
  }

  /** Pushes all local Git tags to the configured remote. */
  async pushGitTags(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitTagListResult> {
    return await this.services.gitRuntimeHandler.pushGitTags(projectPath, sourceId);
  }

  /** Counts commits since a reference tag. */
  async countGitCommitsSinceTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string
  ): Promise<number> {
    return await this.services.gitRuntimeHandler.countGitCommitsSinceTag(projectPath, sourceId, tagName);
  }

  /** Reads a page of Git history for a project. */
  async readGitLog(
    projectPath: string,
    sourceId: string | null,
    limit: number,
    skip: number
  ): Promise<OpenCodexGitLogPage> {
    return await this.services.gitRuntimeHandler.readGitLog(projectPath, sourceId, limit, skip);
  }

  /** Reads details for one Git commit. */
  async readGitCommitDetails(
    projectPath: string,
    sourceId: string | null,
    hash: string
  ): Promise<OpenCodexGitCommitDetails> {
    return await this.services.gitRuntimeHandler.readGitCommitDetails(projectPath, sourceId, hash);
  }

  /** Checks out an existing Git branch and returns the refreshed status. */
  async checkoutGitBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string,
    branchKind: OpenCodexGitBranchKind
  ): Promise<OpenCodexGitStatus> {
    return await this.services.gitRuntimeHandler.checkoutGitBranch(projectPath, sourceId, branchName, branchKind);
  }

  /** Creates and checks out a new Git branch. */
  async createGitBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string
  ): Promise<OpenCodexGitStatus> {
    return await this.services.gitRuntimeHandler.createGitBranch(projectPath, sourceId, branchName);
  }

  /** Merges an existing Git branch into the current branch. */
  async mergeGitBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string
  ): Promise<OpenCodexGitStatus> {
    return await this.services.gitRuntimeHandler.mergeGitBranch(projectPath, sourceId, branchName);
  }

  /** Stages selected Git paths. */
  async stageGitPaths(
    projectPath: string,
    sourceId: string | null,
    paths: string[]
  ): Promise<OpenCodexGitStatus> {
    return await this.services.gitRuntimeHandler.stageGitPaths(projectPath, sourceId, paths);
  }

  /** Unstages selected Git paths. */
  async unstageGitPaths(
    projectPath: string,
    sourceId: string | null,
    paths: string[]
  ): Promise<OpenCodexGitStatus> {
    return await this.services.gitRuntimeHandler.unstageGitPaths(projectPath, sourceId, paths);
  }

  /** Creates a Git commit from staged paths. */
  async commitGitChanges(
    projectPath: string,
    sourceId: string | null,
    message: string
  ): Promise<OpenCodexGitCommitResult> {
    return await this.services.gitRuntimeHandler.commitGitChanges(projectPath, sourceId, message);
  }

  /** Pushes local commits to the configured upstream. */
  async pushGitChanges(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await this.services.gitRuntimeHandler.pushGitChanges(projectPath, sourceId);
  }

  /** Publishes the current local branch to a remote and configures its upstream. */
  async publishCurrentGitBranch(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitStatus> {
    return await this.services.gitRuntimeHandler.publishCurrentGitBranch(projectPath, sourceId);
  }

  /** Lists commands configured for a project. */
  async listProjectCommands(projectId: string): Promise<OpenCodexProjectCommand[]> {
    return await this.services.projectAutomationRuntimeHandler.listProjectCommands(projectId);
  }

  /** Creates a project command. */
  async createProjectCommand(
    projectId: string,
    name: string,
    command: string,
    allowParallel: boolean,
    persistLogs: boolean
  ): Promise<OpenCodexProjectCommand> {
    return await this.services.projectAutomationRuntimeHandler.createProjectCommand(
      projectId,
      name,
      command,
      allowParallel,
      persistLogs
    );
  }

  /** Updates a project command. */
  async updateProjectCommand(
    commandId: string,
    patch: {
      name?: string;
      command?: string;
      allowParallel?: boolean;
      persistLogs?: boolean;
    }
  ): Promise<OpenCodexProjectCommand> {
    return await this.services.projectAutomationRuntimeHandler.updateProjectCommand(commandId, patch);
  }

  /** Reorders project commands. */
  async reorderProjectCommands(
    projectId: string,
    commandIds: string[]
  ): Promise<OpenCodexProjectCommand[]> {
    return await this.services.projectAutomationRuntimeHandler.reorderProjectCommands(projectId, commandIds);
  }

  /** Deletes a project command. */
  async deleteProjectCommand(commandId: string): Promise<{ ok: true }> {
    return await this.services.projectAutomationRuntimeHandler.deleteProjectCommand(commandId);
  }

  /** Starts a project command. */
  async runProjectCommand(
    commandId: string,
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexProjectCommandRun> {
    return await this.services.projectAutomationRuntimeHandler.runProjectCommand(
      commandId,
      projectPath,
      sourceId
    );
  }

  /** Stops a project command run. */
  async stopProjectCommandRun(runId: string): Promise<{ ok: true }> {
    return await this.services.projectAutomationRuntimeHandler.stopProjectCommandRun(runId);
  }

  /** Lists managed command rules and synchronization state for one project. */
  async listProjectRules(projectId: string): Promise<OpenCodexProjectCommandRulesSnapshot> {
    return await this.services.projectAutomationRuntimeHandler.listProjectRules(projectId);
  }

  /** Creates a managed project command rule. */
  async createProjectRule(
    input: CachedProjectCommandRuleCreateInput
  ): Promise<OpenCodexProjectCommandRule> {
    return await this.services.projectAutomationRuntimeHandler.createProjectRule(input);
  }

  /** Updates a managed project command rule. */
  async updateProjectRule(
    ruleId: string,
    patch: CachedProjectCommandRuleUpdateInput
  ): Promise<OpenCodexProjectCommandRule> {
    return await this.services.projectAutomationRuntimeHandler.updateProjectRule(ruleId, patch);
  }

  /** Deletes a managed project command rule. */
  async deleteProjectRule(ruleId: string): Promise<{ ok: true }> {
    return await this.services.projectAutomationRuntimeHandler.deleteProjectRule(ruleId);
  }

  /** Generates project rules, optionally overwriting external changes when `force` is true. */
  async applyProjectRules(
    projectId: string,
    force = false
  ): Promise<OpenCodexProjectCommandRuleApplyResult> {
    return await this.services.projectAutomationRuntimeHandler.applyProjectRules(projectId, force);
  }

  /** Tests a command against the generated project rules file. */
  async testProjectRules(
    projectId: string,
    command: string
  ): Promise<OpenCodexProjectCommandRuleTestResult> {
    return await this.services.projectAutomationRuntimeHandler.testProjectRules(projectId, command);
  }

  /** Restarts the project's source runtime to load generated rules. */
  async restartProjectRules(projectId: string): Promise<OpenCodexProjectCommandRulesSnapshot> {
    return await this.services.projectAutomationRuntimeHandler.restartProjectRules(projectId);
  }

  /** Lists local tasks configured for a project. */
  async listProjectTasks(projectId: string): Promise<OpenCodexProjectTask[]> {
    return await this.services.projectRuntimeHandler.listProjectTasks(projectId);
  }

  /** Creates a local project task. */
  async createProjectTask(
    projectId: string,
    title: string,
    description: string,
    status: OpenCodexProjectTaskStatus
  ): Promise<OpenCodexProjectTask> {
    return await this.services.projectRuntimeHandler.createProjectTask(
      projectId,
      title,
      description,
      status
    );
  }

  /** Updates a local project task. */
  async updateProjectTask(
    taskId: string,
    patch: {
      title?: string;
      description?: string;
      status?: OpenCodexProjectTaskStatus;
    }
  ): Promise<OpenCodexProjectTask> {
    return await this.services.projectRuntimeHandler.updateProjectTask(taskId, patch);
  }

  /** Deletes a local project task. */
  async deleteProjectTask(taskId: string): Promise<{ ok: true }> {
    return await this.services.projectRuntimeHandler.deleteProjectTask(taskId);
  }

  /** Reads the editable commit generation prompt. */
  async readCommitPrompt(): Promise<OpenCodexCommitPrompt> {
    return await this.services.gitRuntimeHandler.readCommitPrompt();
  }

  /** Persists the editable commit generation prompt. */
  async updateCommitPrompt(prompt: string): Promise<OpenCodexCommitPrompt> {
    return await this.services.gitRuntimeHandler.updateCommitPrompt(prompt);
  }

  /** Restores the default commit generation prompt. */
  async resetCommitPrompt(): Promise<OpenCodexCommitPrompt> {
    return await this.services.gitRuntimeHandler.resetCommitPrompt();
  }

  /** Generates a commit message with optional model, reasoning-effort, and language options. */
  async generateGitCommitMessage(
    projectPath: string,
    sourceId: string | null,
    instruction: string,
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    language: OpenCodexCommitMessageLanguage
  ): Promise<OpenCodexCommitMessageGenerationResult> {
    return await this.services.gitRuntimeHandler.generateGitCommitMessage(
      projectPath,
      sourceId,
      instruction,
      model,
      reasoningEffort,
      language
    );
  }

  /** Pulls remote commits from the configured upstream. */
  async pullGitChanges(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await this.services.gitRuntimeHandler.pullGitChanges(projectPath, sourceId);
  }

  /** Trusts a project in Codex configuration. */
  async trustProject(projectPath: string): Promise<{ ok: true }> {
    return await this.services.projectRuntimeHandler.trustProject(projectPath);
  }

  /**
   * Dismisses a project trust request.
   *
   * @param projectPath Project path.
   *
   * @returns Nothing.
   */
  dismissProjectTrustRequest(projectPath: string): void {
    this.services.projectRuntimeHandler.dismissProjectTrustRequest(projectPath);
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
    this.services.approvalService.resolveApproval(approvalId, decision);
  }

}
