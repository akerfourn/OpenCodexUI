/**
 * Coordinates UI requests with the local Codex app-server and the optional SQLite cache.
 */
import { statSync } from "node:fs";

import {
  CodexAppServerClient,
  CodexProcessError,
  JsonRpcError,
  resolveCodexCommandPath,
  type CodexNotification,
  type CodexServerRequest,
  type v2
} from "@open-codex-ui/codex-rpc";
import type {
  CachedProject,
  CachedSource,
  CachedThreadDelta,
  CachedThreadSnapshot,
  CachedThreadSummary,
  CachedThreadSyncState,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import { createProjectIdentity, normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexApprovalDecision,
  OpenCodexEvent,
  OpenCodexImageAttachment,
  OpenCodexMessage,
  OpenCodexMessagePhase,
  OpenCodexProject,
  OpenCodexRequest,
  OpenCodexSettings,
  OpenCodexSource,
  OpenCodexSourceLocalSettings,
  OpenCodexThread,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import {
  buildApprovalResponse,
  createActivityFromNotification,
  createApprovalRequest,
  mapThread,
  mapTurnsToOpenCodexTurns,
  readMessagePhase,
  readObject,
  readNullableNumber,
  readString
} from "./mapping.js";
import { ThreadTurnCache, type ThreadTurnCacheEntry } from "./ThreadTurnCache.js";
import type { OpenCodexBackendOptions } from "./types.js";

const THREAD_LIST_PAGE_SIZE = 100;
const THREAD_LIST_MAX_PAGES = 20;
const THREAD_INITIAL_CACHED_TURNS = 10;
const THREAD_TURNS_PAGE_SIZE = 20;
const LEGACY_DEFAULT_SOURCE_ID = "default";

type ThreadSourceKind =
  | "cli"
  | "vscode"
  | "exec"
  | "appServer"
  | "subAgent"
  | "subAgentReview"
  | "subAgentCompact"
  | "subAgentThreadSpawn"
  | "subAgentOther"
  | "unknown";

type OpenCodexThreadWithProjectState = OpenCodexThread & {
  projectHidden?: boolean;
};

type ThreadListParams = {
  cursor?: string | null;
  limit?: number | null;
  sortKey?: "created_at" | "updated_at" | null;
  sortDirection?: "asc" | "desc" | null;
  sourceKinds?: ThreadSourceKind[] | null;
  cwd?: string | string[] | null;
  searchTerm?: string | null;
};

const THREAD_SOURCE_KINDS: ThreadSourceKind[] = [
  "cli",
  "vscode",
  "exec",
  "appServer",
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther",
  "unknown"
];

/**
 * Coordinates UI requests, Codex app-server calls, and cache persistence.
 */
export class OpenCodexBackend {
  private readonly clientsBySourceId = new Map<string, CodexAppServerClient>();
  private settings: OpenCodexSettings;
  private readonly pendingApprovals = new Map<string, { request: CodexServerRequest; sourceId: string }>();
  private readonly assistantMessagePhases = new Map<string, OpenCodexMessagePhase | null>();
  private readonly threadTurnCache = new ThreadTurnCache();
  private readonly cacheRepository: OpenCodexCacheRepository | null;
  private readonly codexStderrBufferBySourceId = new Map<string, string>();
  private readonly trustSourceIdByProjectPath = new Map<string, string>();
  private readonly recoveringThreadIds = new Set<string>();

  /**
   * Creates a new open codex backend instance.
   *
   * @param options Configuration options.
   */
  constructor(private readonly options: OpenCodexBackendOptions) {
    this.settings = options.settings;
    this.cacheRepository = options.cacheRepository ?? null;
  }

  /**
   * Handles dispose.
   *
   * @returns Promise resolved when the operation completes.
   */
  async dispose(): Promise<void> {
    await Promise.all(Array.from(this.clientsBySourceId.values()).map((client) => client.stop()));
    await this.cacheRepository?.close();
    this.clientsBySourceId.clear();
  }

  /**
   * Executes a backend request and normalizes failures for the UI.
   *
   * @param request Request payload.
   *
   * @returns Promise resolved with the requested result.
   */
  async handleRequest(request: OpenCodexRequest): Promise<unknown> {
    try {
      return await this.handleValidRequest(request);
    } catch (error) {
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
  }

  /**
   * Dispatches a validated backend request to the matching handler.
   *
   * @param request Request payload.
   *
   * @returns Promise resolved with the requested result.
   */
  private async handleValidRequest(request: OpenCodexRequest): Promise<unknown> {
    switch (request.type) {
      case "app.bootstrap":
        await this.ensureSourcesInitialized();
        this.emit({
          type: "app.bootstrap",
          settings: this.settings,
          sources: await this.listOpenCodexSources(),
          projectPath: this.options.projectPath
        });
        await this.cacheProject(this.options.projectPath, null);
        await this.handleValidRequest({ type: "projects.list" });
        await this.handleValidRequest({ type: "models.list" });
        return { ok: true };
      case "projects.list":
        return this.listProjects();
      case "projects.open":
        return this.openProject(
          request.projectPath,
          request.sourceId === undefined ? this.settings.defaultSourceId : request.sourceId,
          request.createIfMissing === true
        );
      case "projects.pickDirectory":
        return this.pickProjectDirectory(
          request.mode,
          request.sourceId === undefined ? this.settings.defaultSourceId : request.sourceId
        );
      case "projects.setHidden":
        return this.setProjectHidden(request.projectId, request.isHidden);
      case "attachments.pickImages":
        return this.pickImageFiles();
      case "sources.list":
        return this.listSources();
      case "sources.create":
        return this.createSource(request.name);
      case "sources.sync":
        return this.syncSources(request.sourceId ?? null);
      case "sources.delete":
        return this.deleteSource(request.sourceId);
      case "sources.update":
        return this.updateSource(request.sourceId, request.patch);
      case "sources.pickExecutable":
        return this.options.pickExecutableFile?.() ?? null;
      case "threads.list":
        return this.listThreads(
          request.scope,
          request.projectPath ?? null,
          request.sourceId ?? null,
          request.searchTerm
        );
      case "threads.open":
        return this.openThread(request.threadId);
      case "threads.loadOlder":
        return this.loadOlderThreadMessages(request.threadId);
      case "threads.recover":
        return this.recoverThread(request.threadId);
      case "threads.create":
        return this.createThread(request.projectPath ?? null, request.sourceId ?? null);
      case "threads.rename":
        return this.renameThread(request.threadId, request.name);
      case "system.openLink":
        return this.openLink(request.href, request.projectPath ?? null);
      case "turn.start":
        return this.startTurn(
          request.threadId,
          request.projectPath ?? null,
          request.sourceId ?? null,
          request.text,
          request.attachments ?? [],
          request.model ?? null,
          request.reasoningEffort ?? null
        );
      case "turn.interrupt":
        return this.interruptTurn(request.threadId, request.turnId);
      case "approval.respond":
        return this.resolveApproval(request.approvalId, request.decision);
      case "project.trust":
        return this.trustProject(request.projectPath);
      case "project.trust.dismiss":
        this.dismissProjectTrustRequest(request.projectPath);
        return { ok: true };
      case "models.list":
        return this.listModels();
      case "settings.get":
        return this.settings;
      case "settings.update":
        this.settings = { ...this.settings, ...request.patch };
        await this.options.saveSettings?.(this.settings);
        return this.settings;
    }
  }

  /**
   * Returns a started Codex app-server client.
   *
   * @returns Promise resolved with the requested result.
   */
  private async ensureClient(sourceId: string | null = this.settings.defaultSourceId): Promise<CodexAppServerClient> {
    const source = await this.resolveSource(sourceId);
    const existingClient = this.clientsBySourceId.get(source.id);

    if (existingClient !== undefined) {
      return existingClient;
    }

    this.emit({ type: "connection.status", status: "starting" });

    const client = new CodexAppServerClient({
      command: resolveSourceCommand(source, this.settings.codexCommand),
      experimentalApi: this.settings.experimentalApi,
      logger: (message) => this.options.logger?.(message),
      stderr: (message) => this.handleCodexStderr(message, source.id)
    });

    this.clientsBySourceId.set(source.id, client);
    client.onNotification((notification) => this.handleNotification(notification, source.id));
    client.onServerRequest((request) => this.handleServerRequest(request, source.id));
    client.onError((error) => this.handleClientError(error));
    client.onClose(() => this.handleClientClose(source.id));

    await client.start();
    this.emit({ type: "connection.status", status: "ready" });
    return client;
  }

  /**
   * Lists projects known by the local cache.
   *
   * @returns Promise resolved with cached projects.
   */
  private async listProjects(): Promise<OpenCodexProject[]> {
    const cachedProjects = await this.readCachedProjects();

    this.emit({ type: "projects.updated", projects: cachedProjects });
    return cachedProjects;
  }

  /**
   * Lists configured Codex sources and emits them to the UI.
   *
   * @returns Promise resolved with configured sources.
   */
  private async listSources(): Promise<OpenCodexSource[]> {
    await this.ensureSourcesInitialized();
    const sources = await this.listOpenCodexSources();
    this.emit({
      type: "sources.updated",
      sources,
      defaultSourceId: this.settings.defaultSourceId
    });
    return sources;
  }

  /**
   * Creates a new local Codex source.
   *
   * @param name Optional source name.
   * @returns Created source.
   */
  private async createSource(name?: string): Promise<OpenCodexSource> {
    if (this.cacheRepository === null) {
      throw new Error("Source storage is unavailable.");
    }

    const createdSource = await this.cacheRepository.createSource(name);
    const source = toOpenCodexSource(createdSource, this.settings.codexCommand, 0);
    this.emit({
      type: "sources.updated",
      sources: await this.listOpenCodexSources(),
      defaultSourceId: this.settings.defaultSourceId
    });
    return source;
  }

  /**
   * Synchronizes one source or all sources with Codex.
   *
   * @param sourceId Optional source identifier.
   * @returns Synchronized projects.
   */
  private async syncSources(sourceId: string | null): Promise<OpenCodexProject[]> {
    await this.ensureSourcesInitialized();

    if (this.cacheRepository === null) {
      return [];
    }

    const sources = sourceId === null
      ? await this.cacheRepository.listSources()
      : [await this.resolveSource(sourceId)];

    for (const source of sources) {
      await this.syncSource(source);
    }

    const projects = await this.readCachedProjects();
    this.emit({ type: "projects.updated", projects });
    this.emit({
      type: "sources.updated",
      sources: await this.listOpenCodexSources(),
      defaultSourceId: this.settings.defaultSourceId
    });
    return projects;
  }

  /**
   * Synchronizes threads and project associations for one source.
   *
   * @param source Source to synchronize.
   * @returns Promise resolved when sync completes.
   */
  private async syncSource(source: CachedSource): Promise<void> {
    const client = await this.ensureClient(source.id);
    const threads = (await readThreadPages(client, {
      limit: THREAD_LIST_PAGE_SIZE,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: THREAD_SOURCE_KINDS
    })).map((thread) => withSourceId(
      {
        ...thread,
        projectHidden: shouldHideProjectPath(thread.projectPath, source)
      },
      source.id
    ));

    await this.writeThreadIndex(threads);
  }

  /**
   * Updates whether one project is hidden from the default project list.
   *
   * @param projectId Project identifier.
   * @param isHidden Whether the project should be hidden.
   * @returns Success response.
   */
  private async setProjectHidden(projectId: string, isHidden: boolean): Promise<{ ok: true }> {
    if (this.cacheRepository === null) {
      return { ok: true };
    }

    await this.cacheRepository.setProjectHidden(projectId, isHidden);
    this.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
    return { ok: true };
  }

  /**
   * Deletes one source and orphans its associated projects and threads.
   *
   * @param sourceId Source identifier.
   * @returns Deletion result.
   */
  private async deleteSource(sourceId: string): Promise<{ ok: true }> {
    if (sourceId === this.settings.defaultSourceId) {
      throw new Error("Cannot delete the default Codex source.");
    }

    if (this.cacheRepository === null) {
      throw new Error("Source storage is unavailable.");
    }

    await this.cacheRepository.clearSourceAssociations(sourceId);
    await this.cacheRepository.deleteSource(sourceId);
    await this.restartSourceClient(sourceId);

    const sources = await this.listOpenCodexSources();
    this.emit({
      type: "sources.updated",
      sources,
      defaultSourceId: this.settings.defaultSourceId
    });
    this.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
    return { ok: true };
  }

  /**
   * Updates a Codex source and refreshes the UI source list.
   *
   * @param sourceId Source identifier.
   * @param patch Editable source fields.
   * @returns Updated source.
   */
  private async updateSource(
    sourceId: string,
    patch: Partial<Pick<OpenCodexSource, "name">> & {
      settings?: Partial<OpenCodexSourceLocalSettings>;
    }
  ): Promise<OpenCodexSource> {
    if (this.cacheRepository === null) {
      throw new Error("Source storage is unavailable.");
    }

    const previousSource = await this.cacheRepository.getSource(sourceId);
    const updatedSource = await this.cacheRepository.updateSource(sourceId, patch);
    const shouldClearAssociations = previousSource !== null && (
      previousSource.settings.commandMode !== updatedSource.settings.commandMode ||
      previousSource.settings.command !== updatedSource.settings.command
    );

    if (shouldClearAssociations) {
      await this.cacheRepository.clearSourceAssociations(sourceId);
    }

    const source = toOpenCodexSource(
      updatedSource,
      this.settings.codexCommand,
      await this.cacheRepository.getSourceProjectCount(sourceId)
    );
    this.emit({
      type: "sources.updated",
      sources: await this.listOpenCodexSources(),
      defaultSourceId: this.settings.defaultSourceId
    });
    await this.restartSourceClient(sourceId);
    this.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
    return source;
  }

  /**
   * Opens a project folder and stores it in the local project index.
   *
   * @param projectPath Project folder path.
   * @param createIfMissing Whether missing folders should be created.
   *
   * @returns Promise resolved with the opened project.
   */
  private async openProject(
    projectPath: string,
    sourceId: string | null,
    createIfMissing: boolean
  ): Promise<OpenCodexProject> {
    const ensuredProjectPath = await this.ensureProjectPath(projectPath, createIfMissing);
    const project = await this.cacheProject(ensuredProjectPath, sourceId);

    if (project === null) {
      throw new Error("Project path is required.");
    }

    await this.listProjects();
    this.emit({ type: "project.opened", project });
    return project;
  }

  /**
   * Opens the host directory picker and then opens the selected project.
   *
   * @param mode Picker mode requested by the UI.
   *
   * @returns Promise resolved with the opened project, or `null` when cancelled.
   */
  private async pickProjectDirectory(
    mode: "open" | "create",
    sourceId: string | null
  ): Promise<OpenCodexProject | null> {
    const selectedPath = await this.options.pickProjectDirectory?.(mode) ?? null;

    if (selectedPath === null) {
      return null;
    }

    return this.openProject(selectedPath, sourceId, mode === "create");
  }

  /**
   * Opens the host image picker.
   *
   * @returns Promise resolved with selected image paths.
   */
  private async pickImageFiles(): Promise<OpenCodexImageAttachment[]> {
    return await this.options.pickImageFiles?.() ?? [];
  }

  /**
   * Validates and normalizes a project path before it is opened.
   *
   * @param projectPath Project folder path.
   * @param createIfMissing Whether missing folders should be created.
   *
   * @returns Promise resolved with the normalized project path.
   */
  private async ensureProjectPath(projectPath: string, createIfMissing: boolean): Promise<string> {
    const ensuredPath = await this.options.ensureProjectDirectory?.(projectPath, createIfMissing)
      ?? projectPath;
    const normalizedPath = normalizeProjectPath(ensuredPath);

    if (normalizedPath === null) {
      throw new Error("Project path is required.");
    }

    return normalizedPath;
  }

  /**
   * Stores a project path in the cache when a cache repository is available.
   *
   * @param projectPath Project path to store.
   *
   * @returns Cached project entry, or `null` when no project can be stored.
   */
  private async cacheProject(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<OpenCodexProject | null> {
    const normalizedProjectPath = normalizeProjectPath(projectPath);

    if (normalizedProjectPath === null) {
      return null;
    }

    const projectIdentity = createProjectIdentity(normalizedProjectPath);

    if (projectIdentity === null) {
      return null;
    }

    if (this.cacheRepository === null) {
      const now = new Date().toISOString();

      return {
        id: projectIdentity.id,
        sourceId,
        path: projectIdentity.path,
        defaultName: projectIdentity.defaultName,
        displayName: null,
        isHidden: false,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        editedAt: now
      };
    }

    try {
      const project = await this.cacheRepository.upsertProject(normalizedProjectPath, sourceId);
      return toOpenCodexProject(project);
    } catch (error) {
      this.options.logger?.(`project cache write failed: ${String(error)}`);
      const now = new Date().toISOString();

      return {
        id: projectIdentity.id,
        sourceId,
        path: projectIdentity.path,
        defaultName: projectIdentity.defaultName,
        displayName: null,
        isHidden: false,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
        editedAt: now
      };
    }
  }

  /**
   * Loads threads from the cache and refreshes them from Codex.
   *
   * @param scope Requested thread scope.
   * @param projectPath Project path used by the current-project scope.
   * @param searchTerm Optional search term.
   *
   * @returns Promise resolved with the requested result.
   */
  private async listThreads(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId: string | null,
    searchTerm?: string
  ): Promise<OpenCodexThread[]> {
    const currentProjectPath = scope === "currentProject"
      ? this.resolveCurrentProjectPath(projectPath)
      : null;
    const cachedThreads = await this.readCachedThreads(
      scope,
      currentProjectPath,
      sourceId,
      searchTerm
    );

    if (cachedThreads.length > 0) {
      this.emitThreadsUpdated(cachedThreads, currentProjectPath);
    }

    if (sourceId === null) {
      return cachedThreads;
    }

    const resolvedSource = await this.resolveSource(sourceId);
    const client = await this.ensureClient(resolvedSource.id);
    const params: ThreadListParams = {
      limit: THREAD_LIST_PAGE_SIZE,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: THREAD_SOURCE_KINDS
    };
    const trimmedSearchTerm = searchTerm?.trim() ?? "";

    if (trimmedSearchTerm.length > 0) {
      params.searchTerm = trimmedSearchTerm;
    }

    if (scope === "currentProject" && currentProjectPath !== null) {
      params.cwd = currentProjectPath;
    }

    const threads = (await readThreadPages(client, params)).map((thread) => ({
      ...thread,
      sourceId: resolvedSource.id
    }));
    await this.writeThreadIndex(threads);

    const mergedThreads = await this.readCachedThreads(
      scope,
      currentProjectPath,
      resolvedSource.id,
      searchTerm
    );
    const updatedThreads = mergeFreshThreadList(threads, mergedThreads);
    this.emitThreadsUpdated(updatedThreads, currentProjectPath);
    this.emit({ type: "projects.updated", projects: await this.readCachedProjects() });

    return updatedThreads;
  }

  /**
   * Opens a thread, preferring cached turns before refreshing from Codex.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved with the requested result.
   */
  private async openThread(threadId: string): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    const openStartedAt = Date.now();
    const cachedSnapshot = await this.readCachedThreadSnapshot(threadId);

    if (cachedSnapshot !== null && cachedSnapshot.syncState.hasLoadedLatest) {
      const cacheEntry = this.threadTurnCache.replaceFromSnapshot(cachedSnapshot);
      const turns = this.readCachedTurns(cacheEntry);
      this.logThreadTiming("sqlite load finished", {
        threadId,
        startedAt: openStartedAt,
        turnCount: turns.length,
        cacheHit: true
      });

      this.emitThreadOpened(cacheEntry, turns);

      if (cachedSnapshot.thread.sourceId !== null) {
        void this.resumeAndSyncCachedThread(threadId).catch((error: unknown) => {
          this.handleThreadOpenError(threadId, toError(error));
        });
      }

      return { thread: cacheEntry.thread, turns };
    }

    if (cachedSnapshot !== null && cachedSnapshot.thread.sourceId === null) {
      const cacheEntry = this.threadTurnCache.replaceFromSnapshot(cachedSnapshot);
      const turns = this.readCachedTurns(cacheEntry);
      this.emitThreadOpened(cacheEntry, turns);
      return { thread: cacheEntry.thread, turns };
    }

    const client = await this.ensureClient(cachedSnapshot?.thread.sourceId ?? null);
    this.logThreadTiming("sqlite load finished", {
      threadId,
      startedAt: openStartedAt,
      turnCount: 0,
      cacheHit: false
    });

    const codexStartedAt = Date.now();
    let response: unknown;

    try {
      response = await client.resumeThread(threadId, { excludeTurns: true });
    } catch (error) {
      await this.handleMissingRollout(threadId, error);
      throw error;
    }
    const responseObject = readObject(response);
    const threadValue = responseObject.thread;
    const thread = mapThread(
      threadValue,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    );
    const cacheEntry = this.threadTurnCache.getOrCreate(thread);

    if (cacheEntry.hasLoadedLatest) {
      const turns = this.readCachedTurns(cacheEntry);
      this.logThreadTiming("codex load finished", {
        threadId,
        startedAt: codexStartedAt,
        turnCount: turns.length,
        mode: "resume-only"
      });
      this.emitThreadOpened(cacheEntry, turns);
      void this.syncLatestTurns(client, cacheEntry).catch((error: unknown) => {
        this.handleClientError(toError(error));
      });
      return { thread, turns };
    }

    await this.loadLatestTurns(client, cacheEntry);
    await this.writeThreadSnapshot(cacheEntry);
    const turns = this.readCachedTurns(cacheEntry);
    this.logThreadTiming("codex load finished", {
      threadId,
      startedAt: codexStartedAt,
      turnCount: turns.length,
      mode: "initial-turns"
    });
    this.emitThreadOpened(cacheEntry, turns);
    return { thread, turns };
  }

  /**
   * Loads the latest turns for a thread into the in-memory cache.
   *
   * @param client Connected Codex app-server client.
   * @param cacheEntry In-memory cache entry for a thread.
   *
   * @returns Promise resolved when the operation completes.
   */
  private async loadLatestTurns(
    client: CodexAppServerClient,
    cacheEntry: ThreadTurnCacheEntry
  ): Promise<void> {
    const response = await client.listThreadTurns({
      threadId: cacheEntry.thread.id,
      limit: THREAD_TURNS_PAGE_SIZE,
      sortDirection: "desc"
    });
    const responseObject = readObject(response);
    const turns = Array.isArray(responseObject.data) ? responseObject.data : [];
    const olderCursor = readString(responseObject.nextCursor) || null;

    this.threadTurnCache.mergeLatestTurns(cacheEntry, turns, olderCursor);
  }

  /**
   * Loads older thread turns from the cache or the backend.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved with the requested result.
   */
  private async loadOlderThreadMessages(
    threadId: string
  ): Promise<{ turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean }> {
    const cacheEntry = this.threadTurnCache.get(threadId);

    if (cacheEntry === null || cacheEntry.hasLoadedAllOlderTurns || cacheEntry.olderCursor === null) {
      return { turns: [], hasMoreOlderMessages: false };
    }

    if (isCacheOlderCursor(cacheEntry.olderCursor)) {
      const cachedResult = await this.loadOlderCachedTurns(cacheEntry, cacheEntry.olderCursor);

      if (cachedResult !== null) {
        return cachedResult;
      }
    }

    if (cacheEntry.thread.sourceId === null) {
      return { turns: [], hasMoreOlderMessages: false };
    }

    const client = await this.ensureClient(cacheEntry.thread.sourceId);
    const response = await client.listThreadTurns({
      threadId,
      cursor: cacheEntry.olderCursor,
      limit: THREAD_TURNS_PAGE_SIZE,
      sortDirection: "desc"
    });
    const responseObject = readObject(response);
    const rawTurns = Array.isArray(responseObject.data) ? responseObject.data : [];
    const olderCursor = readString(responseObject.nextCursor) || null;
    const previousTurnIds = new Set(cacheEntry.orderedTurnIds);

    this.threadTurnCache.mergeOlderTurns(cacheEntry, rawTurns, olderCursor);
    await this.writeThreadDelta(cacheEntry, rawTurns);

    const addedTurns = this.threadTurnCache
      .toTurns(cacheEntry)
      .filter((turn) => !previousTurnIds.has(readString(readObject(turn).id)));
    const turns = mapTurnsToOpenCodexTurns(threadId, addedTurns, this.settings.language);
    const hasMoreOlderMessages = !cacheEntry.hasLoadedAllOlderTurns;

    if (turns.length > 0) {
      this.emit({
        type: "thread.turns.prepended",
        threadId,
        turns,
        hasMoreOlderMessages
      });
    }

    return { turns, hasMoreOlderMessages };
  }

  /**
   * Refreshes the latest turns for a cached thread in the background.
   *
   * @param client Connected Codex app-server client.
   * @param cacheEntry In-memory cache entry for a thread.
   * @param existingStartedAt Existing started at.
   *
   * @returns Promise resolved when the operation completes.
   */
  private async syncLatestTurns(
    client: CodexAppServerClient,
    cacheEntry: ThreadTurnCacheEntry,
    existingStartedAt: number | null = null
  ): Promise<void> {
    const syncStartedAt = existingStartedAt ?? Date.now();

    if (existingStartedAt === null) {
      this.emit({ type: "thread.sync.started", threadId: cacheEntry.thread.id });
    }

    try {
      const previousSignature = createCacheSignature(cacheEntry);
      await this.loadLatestTurns(client, cacheEntry);
      await this.writeThreadSnapshot(cacheEntry);
      const nextSignature = createCacheSignature(cacheEntry);

      if (previousSignature !== nextSignature) {
        this.emit({
          type: "thread.turns.synced",
          threadId: cacheEntry.thread.id,
          turns: this.readCachedTurns(cacheEntry),
          hasMoreOlderMessages: !cacheEntry.hasLoadedAllOlderTurns
        });
      }
    } finally {
      this.logThreadTiming("codex load finished", {
        threadId: cacheEntry.thread.id,
        startedAt: syncStartedAt,
        turnCount: cacheEntry.orderedTurnIds.length,
        mode: "background-sync"
      });
      this.emit({ type: "thread.sync.completed", threadId: cacheEntry.thread.id });
    }
  }

  /**
   * Maps cached raw turns to the UI turn shape.
   *
   * @param cacheEntry In-memory cache entry for a thread.
   *
   * @returns Requested values.
   */
  private readCachedTurns(cacheEntry: ThreadTurnCacheEntry): OpenCodexTurn[] {
    return mapTurnsToOpenCodexTurns(
      cacheEntry.thread.id,
      this.threadTurnCache.toTurns(cacheEntry),
      this.settings.language
    );
  }

  /**
   * Resumes a cached thread and refreshes its latest turns.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved when the operation completes.
   */
  private async resumeAndSyncCachedThread(threadId: string): Promise<void> {
    const syncStartedAt = Date.now();
    this.emit({ type: "thread.sync.started", threadId });

    const cachedSnapshot = await this.readCachedThreadSnapshot(threadId);
    const sourceId = cachedSnapshot?.thread.sourceId ?? null;
    if (sourceId === null) {
      throw new Error("Cannot synchronize a thread without a Codex source.");
    }

    const client = await this.ensureClient(sourceId);
    const response = await client.resumeThread(threadId, { excludeTurns: true });
    const responseObject = readObject(response);
    const thread = withSourceId(mapThread(
      responseObject.thread,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    ), sourceId);
    const cacheEntry = this.threadTurnCache.getOrCreate(thread);

    await this.writeThreadIndex([thread]);
    this.emit({ type: "thread.metadata.updated", thread: cacheEntry.thread });
    await this.syncLatestTurns(client, cacheEntry, syncStartedAt);
  }

  /**
   * Recovers a thread after a client interruption or process restart.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved with the requested result.
   */
  private async recoverThread(threadId: string): Promise<{ ok: true }> {
    if (this.recoveringThreadIds.has(threadId)) {
      return { ok: true };
    }

    this.recoveringThreadIds.add(threadId);
    this.emit({ type: "thread.recovery.started", threadId });

    try {
      const cachedSnapshot = await this.readCachedThreadSnapshot(threadId);

      if (cachedSnapshot !== null && cachedSnapshot.syncState.hasLoadedLatest) {
        const cacheEntry = this.threadTurnCache.replaceFromSnapshot(cachedSnapshot);
        this.emitThreadOpened(cacheEntry, this.readCachedTurns(cacheEntry));
        await this.resumeAndSyncCachedThread(threadId);
      } else {
        await this.openThread(threadId);
      }

      this.emit({ type: "thread.recovery.completed", threadId });
      return { ok: true };
    } finally {
      this.recoveringThreadIds.delete(threadId);
    }
  }

  /**
   * Handles errors raised while opening a thread.
   *
   * @param threadId Thread identifier.
   * @param error Error to handle or normalize.
   *
   * @returns Nothing.
   */
  private handleThreadOpenError(threadId: string, error: Error): void {
    if (isMissingRolloutError(error)) {
      void this.forgetCachedThread(threadId);
    }

    this.handleClientError(error);
  }

  /**
   * Drops cached state when Codex no longer knows a thread rollout.
   *
   * @param threadId Thread identifier.
   * @param error Error to handle or normalize.
   *
   * @returns Promise resolved when the operation completes.
   */
  private async handleMissingRollout(threadId: string, error: unknown): Promise<void> {
    if (!isMissingRolloutError(error)) {
      return;
    }

    await this.forgetCachedThread(threadId);
  }

  /**
   * Removes a thread from the cache and refreshes the thread list.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved when the operation completes.
   */
  private async forgetCachedThread(threadId: string): Promise<void> {
    const cachedSnapshot = await this.readCachedThreadSnapshot(threadId);
    const projectPath = this.resolveCurrentProjectPath(cachedSnapshot?.thread.projectPath ?? null);

    if (this.cacheRepository !== null) {
      try {
        await this.cacheRepository.deleteThread(threadId);
      } catch (error) {
        this.options.logger?.(`thread cache delete failed: ${String(error)}`);
      }
    }

    const cachedThreads = await this.readCachedThreads(
      "currentProject",
      projectPath,
      cachedSnapshot?.thread.sourceId ?? null
    );
    this.emitThreadsUpdated(cachedThreads, projectPath);
  }

  /**
   * Emits the thread-opened event for the current thread snapshot.
   *
   * @param cacheEntry In-memory cache entry for a thread.
   * @param turns Turn collection to process.
   *
   * @returns Nothing.
   */
  private emitThreadOpened(cacheEntry: ThreadTurnCacheEntry, turns: OpenCodexTurn[]): void {
    this.emit({
      type: "thread.opened",
      thread: cacheEntry.thread,
      turns,
      hasMoreOlderMessages: !cacheEntry.hasLoadedAllOlderTurns
    });
  }

  /**
   * Creates a new empty thread and persists it in the cache index.
   *
   * @param projectPath Project path used as the thread working directory.
   *
   * @returns Promise resolved with the requested result.
   */
  private async createThread(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    if (sourceId === null) {
      throw new Error("Cannot create a thread for a project without a Codex source.");
    }

    const resolvedSource = await this.resolveSource(sourceId);
    const client = await this.ensureClient(resolvedSource.id);
    const currentProjectPath = this.resolveCurrentProjectPath(projectPath);
    await this.cacheProject(currentProjectPath, resolvedSource.id);
    const response = await client.startThread({
      cwd: currentProjectPath,
      model: this.settings.defaultModel
    });
    const responseObject = readObject(response);
    const thread = withSourceId(mapThread(
      responseObject.thread,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    ), resolvedSource.id);
    const turns: OpenCodexTurn[] = [];

    this.emit({ type: "thread.created", thread, turns });
    await this.writeThreadIndex([thread]);
    return { thread, turns };
  }

  /**
   * Starts a turn on the selected thread and emits the optimistic user message.
   *
   * @param threadId Thread identifier.
   * @param projectPath Project path used when a new thread must be created.
   * @param text User message text.
   * @param model Selected model identifier.
   * @param reasoningEffort Selected reasoning effort.
   *
   * @returns Promise resolved with the requested result.
   */
  private async startTurn(
    threadId: string | null,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    model: string | null,
    reasoningEffort: "low" | "medium" | "high" | "xhigh" | null
  ): Promise<{ threadId: string; turnId: string }> {
    const trimmedText = text.trim();
    const input = buildTurnInput(trimmedText, attachments);

    if (input.length === 0) {
      return { threadId: threadId ?? "", turnId: "" };
    }

    if (sourceId === null) {
      throw new Error("Cannot start a turn for a project without a Codex source.");
    }

    const resolvedSource = await this.resolveSource(sourceId);
    const client = await this.ensureClient(resolvedSource.id);
    const targetThreadId = threadId ?? (
      await this.createThreadAndReturnId(client, projectPath, resolvedSource.id)
    );
    const message: OpenCodexMessage = {
      id: createId("user"),
      threadId: targetThreadId,
      role: "user",
      content: trimmedText,
      status: "completed",
      createdAt: new Date().toISOString(),
      attachments
    };

    this.emit({ type: "message.started", threadId: targetThreadId, message });

    const turnResponse = await client.startTurn({
      threadId: targetThreadId,
      input,
      model,
      effort: reasoningEffort ?? this.settings.defaultReasoningEffort
    });
    const turn = readObject(readObject(turnResponse).turn);
    const turnId = readString(turn.id);

    if (turnId.length > 0) {
      this.emit({ type: "turn.started", threadId: targetThreadId, turnId });
    }

    return { threadId: targetThreadId, turnId };
  }

  /**
   * Creates a thread and returns its identifier.
   *
   * @param client Connected Codex app-server client.
   * @param projectPath Project path used as the thread working directory.
   *
   * @returns Promise resolved with the requested result.
   */
  private async createThreadAndReturnId(
    client: CodexAppServerClient,
    projectPath: string | null,
    sourceId: string
  ): Promise<string> {
    const currentProjectPath = this.resolveCurrentProjectPath(projectPath);
    await this.cacheProject(currentProjectPath, sourceId);
    const response = await client.startThread({
      cwd: currentProjectPath,
      model: this.settings.defaultModel
    });
    const responseObject = readObject(response);
    const thread = withSourceId(mapThread(
      responseObject.thread,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    ), sourceId);
    await this.writeThreadIndex([thread]);
    this.emit({ type: "thread.created", thread, turns: [] });
    return thread.id;
  }

  /**
   * Interrupts the active turn on the backend.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   *
   * @returns Promise resolved when the operation completes.
   */
  private async interruptTurn(threadId: string, turnId: string): Promise<void> {
    const sourceId = await this.resolveThreadSourceId(threadId);

    if (sourceId === null) {
      throw new Error("Cannot interrupt a thread without a Codex source.");
    }

    const client = await this.ensureClient(sourceId);
    await client.interruptTurn(threadId, turnId);
  }

  /**
   * Resolves the Codex source owning a thread.
   *
   * @param threadId Thread identifier.
   * @returns Source id, or `null` when the thread is orphaned or unknown.
   */
  private async resolveThreadSourceId(threadId: string): Promise<string | null> {
    const cacheEntry = this.threadTurnCache.get(threadId);

    if (cacheEntry?.thread.sourceId !== null && cacheEntry?.thread.sourceId !== undefined) {
      return cacheEntry.thread.sourceId;
    }

    const cachedSnapshot = await this.readCachedThreadSnapshot(threadId);
    return cachedSnapshot?.thread.sourceId ?? null;
  }

  /**
   * Renames a thread and persists the new title.
   *
   * @param threadId Thread identifier.
   * @param name Name value to persist.
   *
   * @returns Promise resolved when the operation completes.
   */
  private async renameThread(threadId: string, name: string): Promise<void> {
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      return;
    }

    const cachedSnapshot = await this.readCachedThreadSnapshot(threadId);
    if (cachedSnapshot === null || cachedSnapshot.thread.sourceId === null) {
      throw new Error("Cannot rename a thread without a Codex source.");
    }

    const client = await this.ensureClient(cachedSnapshot.thread.sourceId);
    await client.renameThread(threadId, trimmedName);
    await this.writeThreadTitle(threadId, trimmedName);
    this.threadTurnCache.renameThread(threadId, trimmedName);
    this.emit({ type: "thread.renamed", threadId, name: trimmedName });
  }

  /**
   * Opens an external link through the configured platform callback.
   *
   * @param href Link target to open.
   * @param projectPath Project path used to resolve relative links.
   *
   * @returns Promise resolved with the requested result.
   */
  private async openLink(href: string, projectPath: string | null): Promise<{ ok: true }> {
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

  /**
   * Loads the available models and falls back to a default list when needed.
   *
   * @returns Promise resolved with the requested result.
   */
  private async listModels(): Promise<string[]> {
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
   * Handles backend notifications and maps them to UI events.
   *
   * @param notification Notification payload emitted by Codex.
   *
   * @returns Nothing.
   */
  private handleNotification(notification: CodexNotification, sourceId: string): void {
    const activity = createActivityFromNotification(notification);

    if (activity !== null && this.settings.showActivityPanel) {
      this.emit({ type: "activity.updated", threadId: activity.threadId, activity });
    }

    const params = readObject(notification.params);

    if (notification.method === "item/agentMessage/delta") {
      const threadId = readString(params.threadId);
      const turnId = readString(params.turnId);
      const messageId = readString(params.itemId);
      const delta = readString(params.delta);
      const phaseKey = createAssistantMessagePhaseKey(sourceId, threadId, messageId);
      const phase = this.assistantMessagePhases.get(phaseKey) ?? null;

      if (threadId.length > 0 && turnId.length > 0 && messageId.length > 0 && delta.length > 0) {
        this.emit({ type: "message.delta", threadId, turnId, messageId, delta, phase });
      }
    }

    if (notification.method === "item/started") {
      const threadId = readString(params.threadId);
      const item = readObject(params.item);

      if (readString(item.type) === "agentMessage") {
        const messageId = readString(item.id);
        const phase = readMessagePhase(item.phase);

        if (threadId.length > 0 && messageId.length > 0) {
          this.assistantMessagePhases.set(
            createAssistantMessagePhaseKey(sourceId, threadId, messageId),
            phase
          );
        }
      }
    }

    if (notification.method === "item/completed") {
      const threadId = readString(params.threadId);
      const item = readObject(params.item);

      if (readString(item.type) === "agentMessage") {
        const messageId = readString(item.id);

        if (threadId.length > 0 && messageId.length > 0) {
          this.assistantMessagePhases.delete(createAssistantMessagePhaseKey(sourceId, threadId, messageId));
        }
      }
    }

    if (notification.method === "turn/started") {
      const threadId = readString(params.threadId);
      const turnId = readString(readObject(params.turn).id);

      if (threadId.length > 0 && turnId.length > 0) {
        this.emit({ type: "turn.started", threadId, turnId });
      }
    }

    if (notification.method === "turn/completed") {
      const threadId = readString(params.threadId);
      const turnId = readString(readObject(params.turn).id);
      const durationMs = readNullableNumber(readObject(params.turn).durationMs);

      if (threadId.length > 0 && turnId.length > 0) {
        this.emit({ type: "turn.completed", threadId, turnId, durationMs });
      }
    }

    if (notification.method === "thread/name/updated") {
      const threadId = readString(params.threadId);
      const name = readString(params.name);

      if (threadId.length > 0) {
          this.applyCodexThreadTitle(threadId, name);
      }
    }
  }

  /**
   * Converts a backend server request into a UI approval prompt.
   *
   * @param request Request payload.
   *
   * @returns Nothing.
   */
  private handleServerRequest(request: CodexServerRequest, sourceId: string): void {
    const approval = createApprovalRequest(request, this.settings.language);
    this.pendingApprovals.set(approval.id, { request, sourceId });
    this.emit({ type: "approval.requested", approval });
  }

  /**
   * Marks a project as trusted through the Codex configuration API.
   *
   * @param projectPath Project path.
   *
   * @returns Promise resolved with the requested result.
   */
  private async trustProject(projectPath: string): Promise<{ ok: true }> {
    const normalizedProjectPath = projectPath.trim();

    if (normalizedProjectPath.length === 0) {
      return { ok: true };
    }

    const sourceId = this.trustSourceIdByProjectPath.get(normalizedProjectPath)
      ?? this.settings.defaultSourceId;
    const client = await this.ensureClient(sourceId);

    await client.request("config/batchWrite", {
      edits: [
        {
          keyPath: `projects.${normalizedProjectPath}.trust_level`,
          value: "trusted",
          mergeStrategy: "upsert"
        }
      ],
      reloadUserConfig: true
    });

    this.emit({
      type: "project.trust.completed",
      projectPath: normalizedProjectPath
    });
    this.trustSourceIdByProjectPath.delete(normalizedProjectPath);

    return { ok: true };
  }

  /**
   * Dismisses the pending project trust request in the UI.
   *
   * @param projectPath Project path.
   *
   * @returns Nothing.
   */
  private dismissProjectTrustRequest(projectPath: string): void {
    const normalizedProjectPath = projectPath.trim();

    if (normalizedProjectPath.length === 0) {
      return;
    }

    this.emit({
      type: "project.trust.completed",
      projectPath: normalizedProjectPath
    });
    this.trustSourceIdByProjectPath.delete(normalizedProjectPath);
  }

  /**
   * Scans Codex stderr output for trust warnings.
   *
   * @param message Human-readable message.
   *
   * @returns Nothing.
   */
  private handleCodexStderr(message: string, sourceId: string): void {
    const previousBuffer = this.codexStderrBufferBySourceId.get(sourceId) ?? "";
    const nextBuffer = `${previousBuffer}\n${message}`.slice(-8000);
    this.codexStderrBufferBySourceId.set(sourceId, nextBuffer);

    const trustWarning = parseProjectTrustWarning(
      nextBuffer,
      this.options.projectPath
    );

    if (trustWarning === null) {
      return;
    }

    this.codexStderrBufferBySourceId.set(sourceId, "");
    this.trustSourceIdByProjectPath.set(trustWarning.projectPath, sourceId);
    this.emit({
      type: "project.trust.required",
      projectPath: trustWarning.projectPath,
      disabledFolders: trustWarning.disabledFolders
    });
  }

  /**
   * Sends the selected approval decision back to Codex.
   *
   * @param approvalId Approval identifier.
   * @param decision Approval decision to apply.
   *
   * @returns Nothing.
   */
  private resolveApproval(approvalId: string, decision: OpenCodexApprovalDecision): void {
    const pendingApproval = this.pendingApprovals.get(approvalId);
    const client = pendingApproval === undefined
      ? undefined
      : this.clientsBySourceId.get(pendingApproval.sourceId);

    if (pendingApproval === undefined || client === undefined) {
      this.emit({
        type: "error",
        message: getBackendLabels(this.settings.language).approvalUnavailable
      });
      return;
    }

    const { request } = pendingApproval;
    this.pendingApprovals.delete(approvalId);

    if (request.method === "item/permissions/requestApproval" && decision !== "accept") {
      client.rejectServerRequest(request.id, "Permission request declined by the user.");
    } else {
      client.respond(request.id, buildApprovalResponse(request.method, decision));
    }

    this.emit({ type: "approval.resolved", approvalId });
  }

  /**
   * Normalizes and emits a client-side error event.
   *
   * @param error Error to handle or normalize.
   *
   * @returns Nothing.
   */
  private handleClientError(error: Error): void {
    const normalized = normalizeError(error, this.settings.language);
    this.emit({ type: "error", message: normalized.message, details: normalized.details });
  }

  /**
   * Handles an unexpected client shutdown and triggers recovery when possible.
   *
   * @returns Nothing.
   */
  private handleClientClose(sourceId: string): void {
    this.clientsBySourceId.delete(sourceId);

    if (this.clientsBySourceId.size === 0) {
      this.emit({ type: "connection.status", status: "stopped" });
    }
  }

  /**
   * Determines which thread can be recovered for a failed request.
   *
   * @param request Request payload.
   * @param error Error to handle or normalize.
   *
   * @returns String value, or `null` when unavailable.
   */
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

  /**
   * Emits a backend event to the UI transport.
   *
   * @param event Event payload to apply or inspect.
   *
   * @returns Nothing.
   */
  private emit(event: OpenCodexEvent): void {
    this.options.emit(event);
  }

  /**
   * Emits the refreshed thread list to the UI.
   *
   * @param threads Thread collection to process.
   * @param projectPath Project path associated with the update.
   *
   * @returns Nothing.
   */
  private emitThreadsUpdated(threads: OpenCodexThread[], projectPath: string | null): void {
    this.emit({
      type: "threads.updated",
      threads,
      currentProjectFilterAvailable: projectPath !== null,
      projectPath
    });
  }

  /**
   * Reads cached projects from the repository.
   *
   * @returns Promise resolved with cached projects.
   */
  private async readCachedProjects(): Promise<OpenCodexProject[]> {
    if (this.cacheRepository === null) {
      return [];
    }

    try {
      const projects = await this.cacheRepository.listProjects();
      return projects.map((project) => toOpenCodexProject(project));
    } catch (error) {
      this.options.logger?.(`project cache read failed: ${String(error)}`);
      return [];
    }
  }

  /**
   * Reads cached threads for the requested scope and search term.
   *
   * @param scope Requested thread scope.
   * @param projectPath Project path used by the current-project scope.
   * @param searchTerm Optional search term.
   *
   * @returns Promise resolved with the requested result.
   */
  private async readCachedThreads(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId?: string | null,
    searchTerm?: string
  ): Promise<OpenCodexThread[]> {
    if (this.cacheRepository === null) {
      return [];
    }

    try {
      const threads = await this.cacheRepository.listThreads({
        scope,
        currentProjectPath: projectPath,
        sourceId,
        searchTerm
      });
      return threads.map((thread) => toOpenCodexThread(thread));
    } catch (error) {
      this.options.logger?.(`thread cache read failed: ${String(error)}`);
      return [];
    }
  }

  /**
   * Resolves the project path that should be used for a project-scoped operation.
   *
   * @param projectPath Request-specific project path.
   *
   * @returns Normalized project path, or `null` when no path is available.
   */
  private resolveCurrentProjectPath(projectPath: string | null): string | null {
    return normalizeProjectPath(projectPath) ?? normalizeProjectPath(this.options.projectPath);
  }

  /**
   * Ensures at least one source exists and a default source is selected.
   *
   * @returns Promise resolved after settings and storage are consistent.
   */
  private async ensureSourcesInitialized(): Promise<void> {
    if (this.cacheRepository === null) {
      return;
    }

    const fallbackSource = await this.cacheRepository.ensureDefaultSource();
    const sources = await this.cacheRepository.listSources();

    if (sources.length === 0) {
      return;
    }

    const configuredSource = this.settings.defaultSourceId === null
      ? null
      : await this.cacheRepository.getSource(this.settings.defaultSourceId);

    if (configuredSource !== null) {
      return;
    }

    const defaultSource = this.settings.defaultSourceId === LEGACY_DEFAULT_SOURCE_ID
      ? fallbackSource
      : sources[0] ?? fallbackSource;

    this.settings = {
      ...this.settings,
      defaultSourceId: defaultSource.id
    };
    await this.options.saveSettings?.(this.settings);
  }

  /**
   * Resolves a source id to a cached source, falling back to the default.
   *
   * @param sourceId Requested source id.
   * @returns Cached source.
   */
  private async resolveSource(sourceId: string | null): Promise<CachedSource> {
    if (this.cacheRepository === null) {
      return createDefaultCachedSource();
    }

    await this.ensureSourcesInitialized();

    const requestedSource = sourceId === null ? null : await this.cacheRepository.getSource(sourceId);

    if (requestedSource !== null) {
      return requestedSource;
    }

    const sources = await this.cacheRepository.listSources();
    return sources[0] ?? createDefaultCachedSource();
  }

  /**
   * Reads sources and enriches them with the executable currently resolved.
   *
   * @returns Sources ready for the UI.
   */
  private async listOpenCodexSources(): Promise<OpenCodexSource[]> {
    if (this.cacheRepository === null) {
      return [toOpenCodexSource(createDefaultCachedSource(), this.settings.codexCommand, 0)];
    }

    await this.ensureSourcesInitialized();
    const cacheRepository = this.cacheRepository;
    const sources = await cacheRepository.listSources();
    return await Promise.all(sources.map(async (source) => (
      toOpenCodexSource(
        source,
        this.settings.codexCommand,
        await cacheRepository.getSourceProjectCount(source.id)
      )
    )));
  }

  /**
   * Stops the client associated with a source after its command changes.
   *
   * @param sourceId Source identifier.
   * @returns Promise resolved when the client is stopped.
   */
  private async restartSourceClient(sourceId: string): Promise<void> {
    const client = this.clientsBySourceId.get(sourceId);

    if (client === undefined) {
      return;
    }

    this.clientsBySourceId.delete(sourceId);
    await client.stop();
  }

  /**
   * Reads the initial cached thread snapshot.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved with the requested result.
   */
  private async readCachedThreadSnapshot(threadId: string): Promise<CachedThreadSnapshot | null> {
    if (this.cacheRepository === null) {
      return null;
    }

    try {
      return await this.cacheRepository.getThread(threadId, {
        latestTurnLimit: THREAD_INITIAL_CACHED_TURNS
      });
    } catch (error) {
      this.options.logger?.(`thread cache snapshot read failed: ${String(error)}`);
      return null;
    }
  }

  /**
   * Loads older turns directly from the local cache.
   *
   * @param cacheEntry In-memory cache entry for a thread.
   * @param cursor Pagination cursor.
   *
   * @returns Promise resolved with the requested result.
   */
  private async loadOlderCachedTurns(
    cacheEntry: ThreadTurnCacheEntry,
    cursor: string
  ): Promise<{ turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean } | null> {
    if (this.cacheRepository === null) {
      return null;
    }

    const beforeTurnId = readCacheOlderCursor(cursor);

    if (beforeTurnId.length === 0) {
      return null;
    }

    try {
      const result = await this.cacheRepository.getOlderTurns({
        threadId: cacheEntry.thread.id,
        beforeTurnId,
        limit: THREAD_TURNS_PAGE_SIZE
      });

      if (result.turns.length === 0) {
        cacheEntry.olderCursor = null;
        cacheEntry.hasLoadedAllOlderTurns = true;
        return { turns: [], hasMoreOlderMessages: false };
      }

      this.threadTurnCache.mergeOlderTurns(
        cacheEntry,
        result.turns,
        result.hasMoreOlderTurns ? createCacheOlderCursor(readOldestTurnId(result.turns)) : null
      );

      const turns = mapTurnsToOpenCodexTurns(
        cacheEntry.thread.id,
        result.turns,
        this.settings.language
      );
      const hasMoreOlderMessages = !cacheEntry.hasLoadedAllOlderTurns;

      this.emit({
        type: "thread.turns.prepended",
        threadId: cacheEntry.thread.id,
        turns,
        hasMoreOlderMessages
      });

      return { turns, hasMoreOlderMessages };
    } catch (error) {
      this.options.logger?.(`thread cache older read failed: ${String(error)}`);
      return null;
    }
  }

  /**
   * Writes thread summaries to the cache index.
   *
   * @param threads Thread collection to process.
   *
   * @returns Promise resolved when the operation completes.
   */
  private async writeThreadIndex(threads: OpenCodexThreadWithProjectState[]): Promise<void> {
    if (this.cacheRepository === null || threads.length === 0) {
      return;
    }

    try {
      await this.cacheRepository.upsertThreadIndex(threads.map((thread) => toCachedThreadSummary(thread)));
    } catch (error) {
      this.options.logger?.(`thread cache index write failed: ${String(error)}`);
    }
  }

  /**
   * Writes a full thread snapshot to the cache.
   *
   * @param cacheEntry In-memory cache entry for a thread.
   *
   * @returns Promise resolved when the operation completes.
   */
  private async writeThreadSnapshot(cacheEntry: ThreadTurnCacheEntry): Promise<void> {
    if (this.cacheRepository === null) {
      return;
    }

    try {
      await this.cacheRepository.saveThreadSnapshot(toCachedThreadSnapshot(cacheEntry));
    } catch (error) {
      this.options.logger?.(`thread cache snapshot write failed: ${String(error)}`);
    }
  }

  /**
   * Writes incremental turn changes to the cache.
   *
   * @param cacheEntry In-memory cache entry for a thread.
   * @param turns Turn collection to process.
   *
   * @returns Promise resolved when the operation completes.
   */
  private async writeThreadDelta(cacheEntry: ThreadTurnCacheEntry, turns: unknown[]): Promise<void> {
    if (this.cacheRepository === null || turns.length === 0) {
      return;
    }

    try {
      await this.cacheRepository.saveThreadDelta(toCachedThreadDelta(cacheEntry, turns));
    } catch (error) {
      this.options.logger?.(`thread cache delta write failed: ${String(error)}`);
    }
  }

  /**
   * Writes a custom thread title to the cache.
   *
   * @param threadId Thread identifier.
   * @param title Thread title or display title.
   *
   * @returns Promise resolved when the operation completes.
   */
  private async writeThreadTitle(threadId: string, title: string): Promise<void> {
    if (this.cacheRepository === null) {
      return;
    }

    try {
      await this.cacheRepository.updateThreadTitle(threadId, title);
    } catch (error) {
      this.options.logger?.(`thread cache rename write failed: ${String(error)}`);
    }
  }

  /**
   * Applies a Codex-provided title to the in-memory thread state.
   *
   * @param threadId Thread identifier.
   * @param title Thread title or display title.
   *
   * @returns Nothing.
   */
  private applyCodexThreadTitle(threadId: string, title: string): void {
    const cacheEntry = this.threadTurnCache.updateCodexThreadTitle(threadId, title);

    if (cacheEntry !== null) {
      this.emit({ type: "thread.metadata.updated", thread: cacheEntry.thread });
    }

    void this.writeThreadCodexTitle(threadId, title);
  }

  /**
   * Writes a Codex-provided title to the cache.
   *
   * @param threadId Thread identifier.
   * @param title Thread title or display title.
   *
   * @returns Promise resolved when the operation completes.
   */
  private async writeThreadCodexTitle(threadId: string, title: string): Promise<void> {
    if (this.cacheRepository === null) {
      return;
    }

    try {
      await this.cacheRepository.updateThreadCodexTitle(threadId, title);
    } catch (error) {
      this.options.logger?.(`thread cache codex title write failed: ${String(error)}`);
    }
  }

  /**
   * Logs timing information for thread loading operations.
   *
   * @param message Human-readable message.
   * @param details Structured diagnostic details.
   *
   * @returns Nothing.
   */
  private logThreadTiming(
    message: string,
    details: Record<string, string | number | boolean>
  ): void {
    this.options.logger?.(`${message}: ${JSON.stringify({
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - Number(details.startedAt),
      ...details
    })}`);
  }

}

/**
 * Reads thread pages until all available pages or the configured limit has been reached.
 *
 * @param client Connected Codex app-server client.
 * @param baseParams Base pagination parameters.
 * @param options Optional read hooks.
 *
 * @returns Promise resolved with the requested result.
 */
async function readThreadPages(
  client: CodexAppServerClient,
  baseParams: ThreadListParams
): Promise<OpenCodexThread[]> {
  const threads: OpenCodexThread[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < THREAD_LIST_MAX_PAGES; page += 1) {
    const params = cursor === null ? baseParams : { ...baseParams, cursor };
    const response = await client.listThreads(params);
    threads.push(...readThreads(response));
    cursor = readString(readObject(response).nextCursor) || null;

    if (cursor === null) {
      break;
    }
  }

  return threads;
}

/**
 * Reads thread entries from a typed RPC response payload.
 *
 * @param response Response.
 *
 * @returns Requested values.
 */
function readThreads(response: unknown): OpenCodexThread[] {
  const data = readObject(response).data;

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((thread) => mapThread(thread));
}

/**
 * Reads model identifiers from a typed RPC response payload.
 *
 * @param response Response.
 *
 * @returns Requested values.
 */
function readModels(response: unknown): string[] {
  const data = readObject(response).data;

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((model) => readObject(model))
    .map((model) => readString(model.model) || readString(model.id))
    .filter((model) => model.length > 0);
}

/**
 * Reads reasoning effort.
 *
 * @param value Value to normalize.
 *
 * @returns Computed value.
 */
function readReasoningEffort(value: unknown): "low" | "medium" | "high" | "xhigh" | null {
  if (value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }

  return null;
}

/**
 * Returns the fallback model list used when model discovery is unavailable.
 *
 * @returns Requested values.
 */
function fallbackModels(): string[] {
  return ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"];
}

/**
 * Normalizes backend and transport failures for UI consumption.
 *
 * @param error Error to handle or normalize.
 * @param language Language used for localized labels.
 *
 * @returns Computed value.
 */
function normalizeError(
  error: unknown,
  language: OpenCodexSettings["language"] = "fr"
): { message: string; details?: unknown } {
  const labels = getBackendLabels(language);

  if (error instanceof CodexProcessError) {
    return {
      message: error.message,
      details: labels.codexCommandHelp
    };
  }

  if (error instanceof JsonRpcError) {
    return {
      message: `${labels.codexRejectedRequest}: ${error.message}`,
      details: error.data
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack
    };
  }

  return { message: String(error) };
}

/**
 * Converts error to the target representation.
 *
 * @param error Error to handle or normalize.
 *
 * @returns Computed value.
 */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Returns backend labels.
 *
 * @param language Language used for localized labels.
 *
 * @returns Computed value.
 */
function getBackendLabels(language: OpenCodexSettings["language"]): BackendLabels {
  if (language === "en") {
    return {
      approvalUnavailable: "The approval request is no longer available.",
      codexCommandHelp: "Check that Codex CLI is installed and that codexCommand points to the right executable.",
      codexRejectedRequest: "Codex app-server rejected the request",
      missingLinkHandler: "No external link opener is configured."
    };
  }

  return {
    approvalUnavailable: "La demande d'approbation n'est plus disponible.",
    codexCommandHelp: "Vérifiez que Codex CLI est installé et que codexCommand pointe vers le bon exécutable.",
    codexRejectedRequest: "Codex app-server a refusé la requête",
    missingLinkHandler: "Aucun gestionnaire d'ouverture de lien externe n'est configuré."
  };
}

type BackendLabels = {
  approvalUnavailable: string;
  codexCommandHelp: string;
  codexRejectedRequest: string;
  missingLinkHandler: string;
};

/**
 * Parses a trust warning emitted by Codex stderr output.
 *
 * @param message Human-readable message.
 * @param fallbackProjectPath Fallback project path.
 *
 * @returns Computed value.
 */
function parseProjectTrustWarning(
  message: string,
  fallbackProjectPath: string | null
): { projectPath: string; disabledFolders: string[] } | null {
  if (!message.includes("Project-local config, hooks, and exec policies are disabled")) {
    return null;
  }

  const projectPath = readTrustedProjectPath(message) ?? fallbackProjectPath;

  if (projectPath === null || projectPath.trim().length === 0) {
    return null;
  }

  return {
    projectPath,
    disabledFolders: readDisabledProjectFolders(message)
  };
}

/**
 * Reads trusted project path.
 *
 * @param message Human-readable message.
 *
 * @returns String value, or `null` when unavailable.
 */
function readTrustedProjectPath(message: string): string | null {
  const match = /add\s+(.+?)\s+as a trusted project in\s+.+?config\.toml/s.exec(message);
  return match?.[1]?.trim() ?? null;
}

/**
 * Reads disabled project folders.
 *
 * @param message Human-readable message.
 *
 * @returns Requested values.
 */
function readDisabledProjectFolders(message: string): string[] {
  const folders: string[] = [];
  const folderPattern = /^\s*\d+\.\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = folderPattern.exec(message)) !== null) {
    const folder = match[1]?.trim() ?? "";

    if (folder.length > 0) {
      folders.push(folder);
    }
  }

  return folders;
}

/**
 * Creates a compact signature for a cached thread state.
 *
 * @param cacheEntry In-memory cache entry for a thread.
 *
 * @returns Computed string value.
 */
function createCacheSignature(cacheEntry: ThreadTurnCacheEntry): string {
  return cacheEntry.orderedTurnIds
    .map((turnId) => {
      const turn = readObject(cacheEntry.turnsById.get(turnId));
      const status = readString(turn.status);
      const durationMs = readNullableNumber(turn.durationMs);
      const items = Array.isArray(turn.items) ? turn.items : [];

      return `${turnId}:${status}:${durationMs ?? "none"}:${items.length}`;
    })
    .join("|");
}

/**
 * Converts open codex thread to the target representation.
 *
 * @param thread Thread payload to process.
 *
 * @returns Computed value.
 */
function toOpenCodexThread(thread: CachedThreadSummary): OpenCodexThread {
  const mappedThread: OpenCodexThread = {
    id: thread.id,
    codexTitle: thread.codexTitle,
    customTitle: thread.customTitle,
    title: thread.title,
    preview: thread.preview,
    model: thread.model,
    reasoningEffort: thread.reasoningEffort,
    projectName: thread.projectName,
    projectPath: thread.projectPath,
    sourceId: thread.sourceId,
    branchName: thread.branchName,
    updatedAt: thread.updatedAt
  };

  if (thread.status !== undefined) {
    mappedThread.status = thread.status;
  }

  return mappedThread;
}

/**
 * Converts a cached project to the protocol representation.
 *
 * @param project Project payload to process.
 *
 * @returns Protocol project payload.
 */
function toOpenCodexProject(project: CachedProject): OpenCodexProject {
  return {
    id: project.id,
    sourceId: project.sourceId,
    path: project.path,
    defaultName: project.defaultName,
    displayName: project.displayName,
    isHidden: project.isHidden,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastSeenAt: project.lastSeenAt,
    editedAt: project.editedAt
  };
}

/**
 * Maps a cached source into the UI protocol shape.
 *
 * @param source Cached source.
 * @param fallbackCommand Legacy command setting used by the automatic source.
 * @returns UI source.
 */
function toOpenCodexSource(
  source: CachedSource,
  fallbackCommand: string,
  associatedProjectCount: number
): OpenCodexSource {
  const command = resolveSourceCommand(source, fallbackCommand);

  return {
    id: source.id,
    kind: source.kind,
    name: source.name,
    associatedProjectCount,
    settings: source.settings,
    resolvedCommand: resolveCodexCommandPath(command),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  };
}

/**
 * Resolves the command configured for a source.
 *
 * @param source Source configuration.
 * @param fallbackCommand Legacy command setting.
 * @returns Command to execute.
 */
function resolveSourceCommand(source: CachedSource, fallbackCommand: string): string {
  if (
    source.settings.commandMode === "custom" &&
    source.settings.command !== null &&
    source.settings.command.length > 0
  ) {
    return source.settings.command;
  }

  return fallbackCommand;
}

/**
 * Returns an in-memory default source when SQLite is unavailable.
 *
 * @returns Default source.
 */
function createDefaultCachedSource(): CachedSource {
  const now = new Date().toISOString();

  return {
    id: LEGACY_DEFAULT_SOURCE_ID,
    kind: "local",
    name: "Default",
    settings: {
      commandMode: "auto",
      command: null,
      color: "blue"
    },
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Adds source metadata to a thread mapped from Codex.
 *
 * @param thread Thread metadata.
 * @param sourceId Source identifier.
 * @returns Thread metadata with source id.
 */
function withSourceId<T extends OpenCodexThread>(thread: T, sourceId: string): T & { sourceId: string } {
  return {
    ...thread,
    sourceId
  };
}

/**
 * Converts cached thread summary to the target representation.
 *
 * @param thread Thread payload to process.
 *
 * @returns Computed value.
 */
function toCachedThreadSummary(thread: OpenCodexThreadWithProjectState): CachedThreadSummary {
  const cachedThread: CachedThreadSummary = {
    id: thread.id,
    sourceId: thread.sourceId,
    codexTitle: thread.codexTitle,
    customTitle: thread.customTitle,
    title: thread.title,
    preview: thread.preview,
    model: thread.model,
    reasoningEffort: thread.reasoningEffort,
    projectName: thread.projectName,
    projectPath: thread.projectPath,
    projectHidden: thread.projectHidden,
    branchName: thread.branchName,
    updatedAt: thread.updatedAt
  };

  if (thread.status !== undefined) {
    cachedThread.status = thread.status;
  }

  return cachedThread;
}

/**
 * Converts cached thread snapshot to the target representation.
 *
 * @param cacheEntry In-memory cache entry for a thread.
 *
 * @returns Computed value.
 */
function toCachedThreadSnapshot(cacheEntry: ThreadTurnCacheEntry): CachedThreadSnapshot {
  return {
    thread: toCachedThreadSummary(cacheEntry.thread),
    turns: Array.from(cacheEntry.turnsById.values()),
    syncState: toCachedSyncState(cacheEntry)
  };
}

/**
 * Converts cached thread delta to the target representation.
 *
 * @param cacheEntry In-memory cache entry for a thread.
 * @param turns Turn collection to process.
 *
 * @returns Computed value.
 */
function toCachedThreadDelta(cacheEntry: ThreadTurnCacheEntry, turns: unknown[]): CachedThreadDelta {
  return {
    threadId: cacheEntry.thread.id,
    turns,
    syncState: toCachedSyncState(cacheEntry)
  };
}

/**
 * Checks whether cache older cursor.
 *
 * @param cursor Pagination cursor.
 *
 * @returns `true` when the condition is met.
 */
function isCacheOlderCursor(cursor: string): boolean {
  return cursor.startsWith("cache:");
}

/**
 * Merges fresh thread data with cached metadata when both are available.
 *
 * @param freshThreads Fresh threads.
 * @param cachedThreads Cached threads.
 *
 * @returns Requested values.
 */
function mergeFreshThreadList(
  freshThreads: OpenCodexThread[],
  cachedThreads: OpenCodexThread[]
): OpenCodexThread[] {
  if (cachedThreads.length === 0) {
    return freshThreads;
  }

  const cachedThreadsById = new Map(cachedThreads.map((thread) => [thread.id, thread]));

  return freshThreads.map((thread) => cachedThreadsById.get(thread.id) ?? thread);
}

/**
 * Checks whether missing rollout error.
 *
 * @param error Error to handle or normalize.
 *
 * @returns `true` when the condition is met.
 */
function isMissingRolloutError(error: unknown): boolean {
  return error instanceof JsonRpcError && error.message.includes("no rollout found for thread id");
}

/**
 * Reads cache older cursor.
 *
 * @param cursor Pagination cursor.
 *
 * @returns Computed string value.
 */
function readCacheOlderCursor(cursor: string): string {
  return cursor.startsWith("cache:") ? cursor.slice("cache:".length) : "";
}

/**
 * Creates cache older cursor.
 *
 * @param turnId Turn identifier.
 *
 * @returns String value, or `null` when unavailable.
 */
function createCacheOlderCursor(turnId: string): string | null {
  return turnId.length > 0 ? `cache:${turnId}` : null;
}

/**
 * Reads oldest turn id.
 *
 * @param turns Turn collection to process.
 *
 * @returns Computed string value.
 */
function readOldestTurnId(turns: unknown[]): string {
  const firstTurn = turns[0];

  if (firstTurn === undefined) {
    return "";
  }

  return readString(readObject(firstTurn).id);
}

/**
 * Converts cached sync state to the target representation.
 *
 * @param cacheEntry In-memory cache entry for a thread.
 *
 * @returns Computed value.
 */
function toCachedSyncState(cacheEntry: ThreadTurnCacheEntry): CachedThreadSyncState {
  return {
    threadId: cacheEntry.thread.id,
    newestTurnId: cacheEntry.newestTurnId,
    oldestTurnId: cacheEntry.oldestTurnId,
    olderCursor: cacheEntry.olderCursor,
    hasLoadedLatest: cacheEntry.hasLoadedLatest,
    hasLoadedAllOlderTurns: cacheEntry.hasLoadedAllOlderTurns,
    lastSyncedAt: cacheEntry.lastSyncedAt
  };
}

/**
 * Builds Codex turn input payloads from composer text and image attachments.
 *
 * @param text User text.
 * @param attachments Image attachments.
 *
 * @returns Codex user input values.
 */
function buildTurnInput(text: string, attachments: OpenCodexImageAttachment[]): v2.UserInput[] {
  const input: v2.UserInput[] = [];

  if (text.length > 0) {
    input.push({ type: "text", text, text_elements: [] });
  }

  for (const attachment of attachments) {
    if (attachment.kind !== "image") {
      continue;
    }

    if (attachment.source === "dataUrl") {
      input.push({ type: "image", url: attachment.value });
      continue;
    }

    input.push({ type: "localImage", path: attachment.value });
  }

  return input;
}

/**
 * Creates id.
 *
 * @param prefix String prefix used to build an identifier.
 *
 * @returns Computed string value.
 */
function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Creates a source/thread-scoped key for assistant message phase tracking.
 *
 * @param sourceId Source identifier.
 * @param threadId Thread identifier.
 * @param messageId Message item identifier.
 * @returns Stable map key.
 */
function createAssistantMessagePhaseKey(sourceId: string, threadId: string, messageId: string): string {
  return `${sourceId}:${threadId}:${messageId}`;
}

/**
 * Checks whether a synchronized project should be hidden by default.
 *
 * @param projectPath Project path reported by Codex.
 * @returns `true` when the path is not locally accessible.
 */
function shouldHideProjectPath(projectPath: string | null, source: CachedSource): boolean {
  if (!shouldValidateProjectPathOnHost(source)) {
    return false;
  }

  const normalizedProjectPath = normalizeProjectPath(projectPath);

  if (normalizedProjectPath === null) {
    return false;
  }

  try {
    return !statSync(normalizedProjectPath).isDirectory();
  } catch {
    return true;
  }
}

/**
 * Checks whether project paths from a source can be validated by the app host.
 *
 * Custom commands may target WSL or remote filesystems, so host-side `stat`
 * would hide valid projects that only exist from the source perspective.
 *
 * @param source Source configuration.
 * @returns `true` when the app host should validate project folders directly.
 */
function shouldValidateProjectPathOnHost(source: CachedSource): boolean {
  return source.settings.commandMode === "auto";
}
