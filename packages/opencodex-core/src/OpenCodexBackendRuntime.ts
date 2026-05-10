import {
  CodexProcessError,
  type CodexNotification,
  type CodexServerRequest
} from "@open-codex-ui/codex-rpc";
import type {
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexApprovalDecision,
  OpenCodexEvent,
  OpenCodexImageAttachment,
  OpenCodexProject,
  OpenCodexRequest,
  OpenCodexSettings,
  OpenCodexSource,
  OpenCodexSourceLocalSettings,
  OpenCodexThread,
  OpenCodexTurn
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
      applyCodexThreadTitle: (threadId, title) => this.applyCodexThreadTitle(threadId, title)
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
  }

  async dispose(): Promise<void> {
    await this.clientPool.dispose();
    await this.cacheRepository?.close();
  }

  async bootstrap(): Promise<{ ok: true }> {
    await this.projectSourceService.ensureSourcesInitialized();
    this.emit({
      type: "app.bootstrap",
      settings: this.settings,
      sources: await this.projectSourceService.listOpenCodexSources(),
      projectPath: this.options.projectPath
    });
    await this.projectSourceService.cacheProject(this.options.projectPath, null);
    await this.listProjects();
    await this.listModels();
    return { ok: true };
  }

  getSettings(): OpenCodexSettings {
    return this.settings;
  }

  async updateSettings(patch: Partial<OpenCodexSettings>): Promise<OpenCodexSettings> {
    this.settings = { ...this.settings, ...patch };
    await this.options.saveSettings?.(this.settings);
    return this.settings;
  }

  async pickSourceExecutable(): Promise<string | null> {
    return await this.options.pickExecutableFile?.() ?? null;
  }

  handleRequestError(request: OpenCodexRequest, error: unknown): never {
    const normalized = normalizeError(error, this.settings.language);
    const recoverableThreadId = this.readRecoverableThreadId(request, error);
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

  private async ensureClient(sourceId: string | null = this.settings.defaultSourceId) {
    return await this.clientPool.ensureClient(sourceId);
  }

  async listProjects(): Promise<OpenCodexProject[]> {
    return await this.projectSourceService.listProjects();
  }

  async listSources(): Promise<OpenCodexSource[]> {
    return await this.projectSourceService.listSources();
  }

  async createSource(name?: string): Promise<OpenCodexSource> {
    return await this.projectSourceService.createSource(name);
  }

  async syncSources(sourceId: string | null): Promise<OpenCodexProject[]> {
    return await this.projectSourceService.syncSources(sourceId);
  }

  async setProjectHidden(projectId: string, isHidden: boolean): Promise<{ ok: true }> {
    return await this.projectSourceService.setProjectHidden(projectId, isHidden);
  }

  async deleteSource(sourceId: string): Promise<{ ok: true }> {
    return await this.projectSourceService.deleteSource(sourceId);
  }

  async updateSource(
    sourceId: string,
    patch: Partial<Pick<OpenCodexSource, "name">> & {
      settings?: Partial<OpenCodexSourceLocalSettings>;
    }
  ): Promise<OpenCodexSource> {
    return await this.projectSourceService.updateSource(sourceId, patch);
  }

  async openProject(
    projectPath: string,
    sourceId: string | null,
    createIfMissing: boolean
  ): Promise<OpenCodexProject> {
    return await this.projectSourceService.openProject(projectPath, sourceId, createIfMissing);
  }

  async pickProjectDirectory(
    mode: "open" | "create",
    sourceId: string | null
  ): Promise<OpenCodexProject | null> {
    return await this.projectSourceService.pickProjectDirectory(mode, sourceId);
  }

  async pickImageFiles(): Promise<OpenCodexImageAttachment[]> {
    return await this.options.pickImageFiles?.() ?? [];
  }

  private async cacheProject(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<OpenCodexProject | null> {
    return await this.projectSourceService.cacheProject(projectPath, sourceId);
  }

  async listThreads(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId: string | null,
    searchTerm?: string
  ): Promise<OpenCodexThread[]> {
    return await this.threadConversationService.listThreads(scope, projectPath, sourceId, searchTerm);
  }

  async openThread(threadId: string): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.threadConversationService.openThread(threadId);
  }

  async loadOlderThreadMessages(
    threadId: string
  ): Promise<{ turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean }> {
    return await this.threadConversationService.loadOlderThreadMessages(threadId);
  }

  async recoverThread(threadId: string): Promise<{ ok: true }> {
    return await this.threadConversationService.recoverThread(threadId);
  }

  async createThread(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.threadConversationService.createThread(projectPath, sourceId);
  }

  async startTurn(
    threadId: string | null,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    model: string | null,
    reasoningEffort: "low" | "medium" | "high" | "xhigh" | null
  ): Promise<{ threadId: string; turnId: string }> {
    return await this.threadConversationService.startTurn(
      threadId,
      projectPath,
      sourceId,
      text,
      attachments,
      model,
      reasoningEffort
    );
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.threadConversationService.interruptTurn(threadId, turnId);
  }

  async renameThread(threadId: string, name: string): Promise<void> {
    await this.threadConversationService.renameThread(threadId, name);
  }

  async openLink(href: string, projectPath: string | null): Promise<{ ok: true }> {
    const target = href.trim();

    if (target.length === 0) {
      return { ok: true };
    }

    if (this.options.openExternalLink === undefined) {
      throw new Error(getBackendLabels(this.settings.language).missingLinkHandler);
    }

    await this.options.openExternalLink(target, this.resolveCurrentProjectPath(projectPath));
    return { ok: true };
  }

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

  private handleNotification(notification: CodexNotification, sourceId: string): void {
    this.notificationService.handleNotification(notification, sourceId);
  }

  private handleServerRequest(request: CodexServerRequest, sourceId: string): void {
    this.approvalService.handleServerRequest(request, sourceId);
  }

  async trustProject(projectPath: string): Promise<{ ok: true }> {
    return await this.projectTrustService.trustProject(projectPath);
  }

  dismissProjectTrustRequest(projectPath: string): void {
    this.projectTrustService.dismissProjectTrustRequest(projectPath);
  }

  private handleCodexStderr(message: string, sourceId: string): void {
    this.projectTrustService.handleCodexStderr(message, sourceId);
  }

  resolveApproval(approvalId: string, decision: OpenCodexApprovalDecision): void {
    this.approvalService.resolveApproval(approvalId, decision);
  }

  private handleClientError(error: Error): void {
    const normalized = normalizeError(error, this.settings.language);
    this.emit({ type: "error", message: normalized.message, details: normalized.details });
  }

  private handleClientClose(sourceId: string): void {
    this.clientPool.deleteClient(sourceId);

    if (!this.clientPool.hasClients()) {
      this.emit({ type: "connection.status", status: "stopped" });
    }
  }

  private readRecoverableThreadId(request: OpenCodexRequest, error: unknown): string | null {
    if (!(error instanceof CodexProcessError)) {
      return null;
    }

    if (request.type === "turn.start") {
      return request.threadId;
    }

    if (request.type === "threads.open" || request.type === "threads.recover") {
      return request.threadId;
    }

    return null;
  }

  private emit(event: OpenCodexEvent): void {
    this.options.emit(event);
  }

  private async readCachedProjects(): Promise<OpenCodexProject[]> {
    return await this.projectSourceService.readCachedProjects();
  }

  private resolveCurrentProjectPath(projectPath: string | null): string | null {
    return normalizeProjectPath(projectPath) ?? normalizeProjectPath(this.options.projectPath);
  }

  private async ensureSourcesInitialized(): Promise<void> {
    await this.projectSourceService.ensureSourcesInitialized();
  }

  private async resolveSource(sourceId: string | null): Promise<CachedSource> {
    return await this.projectSourceService.resolveSource(sourceId);
  }

  private async listOpenCodexSources(): Promise<OpenCodexSource[]> {
    return await this.projectSourceService.listOpenCodexSources();
  }

  private async restartSourceClient(sourceId: string): Promise<void> {
    await this.clientPool.restartClient(sourceId);
  }

  private applyCodexThreadTitle(threadId: string, title: string): void {
    const cacheEntry = this.threadTurnCache.updateCodexThreadTitle(threadId, title);

    if (cacheEntry !== null) {
      this.emit({ type: "thread.metadata.updated", thread: cacheEntry.thread });
    }

    void this.threadCacheService.writeCodexTitle(threadId, title);
  }

}

