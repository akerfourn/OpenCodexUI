import type { CodexAppServerClient, CodexNotification } from "@open-codex-ui/codex-rpc";

import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexComposerReference,
  OpenCodexEvent,
  OpenCodexImageAttachment,
  OpenCodexMessage,
  OpenCodexProject,
  OpenCodexSettings,
  OpenCodexThread,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import {
  mapThread,
  mapTurnsToOpenCodexTurns,
  readObject,
  readString
} from "../mapping.js";
import { ThreadTurnCache, type ThreadTurnCacheEntry } from "../ThreadTurnCache.js";
import type { OpenCodexBackendOptions } from "../types.js";
import {
  THREAD_LIST_PAGE_SIZE,
  THREAD_SOURCE_KINDS,
  THREAD_TURNS_PAGE_SIZE,
  type ThreadListParams
} from "./constants.js";
import { readReasoningEffort, readThreadPages } from "./codexReaders.js";
import { isMissingRolloutError, toError } from "./errors.js";
import {
  recordLiveNotification,
  shouldPersistLiveNotification
} from "./liveTurnNotifications.js";
import {
  createCacheSignature,
  isCacheOlderCursor,
  mergeFreshThreadList,
  withSourceId
} from "./threadCacheMapping.js";
import { ThreadCacheService } from "./ThreadCacheService.js";
import { buildTurnInput, createId } from "./turnInput.js";

export type ThreadConversationServiceOptions = {
  backendOptions: OpenCodexBackendOptions;
  threadTurnCache: ThreadTurnCache;
  threadCacheService: ThreadCacheService;
  getSettings(): OpenCodexSettings;
  emit(event: OpenCodexEvent): void;
  ensureClient(sourceId: string | null): Promise<CodexAppServerClient>;
  resolveSource(sourceId: string | null): Promise<CachedSource>;
  cacheProject(projectPath: string | null, sourceId: string | null): Promise<OpenCodexProject | null>;
  readCachedProjects(): Promise<OpenCodexProject[]>;
  handleClientError(error: Error): void;
};

/**
 * Coordinates Codex thread listing, loading, turns, and cache synchronization.
 */
export class ThreadConversationService {
  private readonly recoveringThreadIds = new Set<string>();

  constructor(private readonly options: ThreadConversationServiceOptions) {}

  /**
   * Lists threads from cache first, then refreshes from Codex when possible.
   *
   * @param scope Thread list scope.
   * @param projectPath Current project path.
   * @param sourceId Source identifier, or `null` for cache-only orphan reads.
   * @param searchTerm Optional search text.
   *
   * @returns Thread metadata collection.
   */
  async listThreads(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId: string | null,
    searchTerm?: string
  ): Promise<OpenCodexThread[]> {
    const currentProjectPath = scope === "currentProject"
      ? this.resolveCurrentProjectPath(projectPath)
      : null;

    if (sourceId !== null) {
      await this.options.threadCacheService.deleteEmptyUnsyncedThreads(
        currentProjectPath,
        sourceId
      );
    }

    const cachedThreads = await this.options.threadCacheService.readThreads(
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

    const resolvedSource = await this.options.resolveSource(sourceId);
    const client = await this.options.ensureClient(resolvedSource.id);
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
    await this.options.threadCacheService.writeIndex(threads);

    const mergedThreads = await this.options.threadCacheService.readThreads(
      scope,
      currentProjectPath,
      resolvedSource.id,
      searchTerm
    );
    const updatedThreads = mergeFreshThreadList(threads, mergedThreads);
    this.emitThreadsUpdated(updatedThreads, currentProjectPath);
    this.options.emit({ type: "projects.updated", projects: await this.options.readCachedProjects() });

    return updatedThreads;
  }

  /**
   * Opens a thread using cache and background synchronization when possible.
   *
   * @param threadId Thread identifier.
   *
   * @returns Opened thread and UI turns.
   */
  async openThread(threadId: string): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    const openStartedAt = Date.now();
    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);

    if (cachedSnapshot !== null && cachedSnapshot.syncState.hasLoadedLatest) {
      const cacheEntry = this.options.threadTurnCache.replaceFromSnapshot(cachedSnapshot);
      const turns = this.options.threadCacheService.readTurns(cacheEntry);
      this.logThreadTiming("sqlite load finished", {
        threadId,
        startedAt: openStartedAt,
        turnCount: turns.length,
        cacheHit: true
      });

      this.emitThreadOpened(cacheEntry, turns);

      if (cachedSnapshot.thread.sourceId !== null) {
        void this.syncCachedThread(threadId).catch((error: unknown) => {
          this.handleThreadOpenError(threadId, toError(error));
        });
      }

      return { thread: cacheEntry.thread, turns };
    }

    if (cachedSnapshot !== null && cachedSnapshot.thread.sourceId === null) {
      const cacheEntry = this.options.threadTurnCache.replaceFromSnapshot(cachedSnapshot);
      const turns = this.options.threadCacheService.readTurns(cacheEntry);
      this.emitThreadOpened(cacheEntry, turns);
      return { thread: cacheEntry.thread, turns };
    }

    const client = await this.options.ensureClient(cachedSnapshot?.thread.sourceId ?? null);
    this.logThreadTiming("sqlite load finished", {
      threadId,
      startedAt: openStartedAt,
      turnCount: 0,
      cacheHit: false
    });

    const codexStartedAt = Date.now();
    let thread: OpenCodexThread;

    try {
      thread = await this.readThreadMetadata(
        client,
        threadId,
        cachedSnapshot?.thread.sourceId ?? null,
        cachedSnapshot?.thread.model ?? null,
        cachedSnapshot?.thread.reasoningEffort ?? null
      );
    } catch (error) {
      await this.handleMissingRollout(threadId, error);
      throw error;
    }

    const cacheEntry = this.options.threadTurnCache.getOrCreate(thread);
    const hadLoadedLatest = cacheEntry.hasLoadedLatest;
    const latestTurns = await this.loadLatestTurns(client, cacheEntry);

    await this.options.threadCacheService.writeIndex([cacheEntry.thread]);
    await this.options.threadCacheService.writeDelta(cacheEntry, latestTurns);
    const turns = this.options.threadCacheService.readTurns(cacheEntry);
    this.logThreadTiming("codex load finished", {
      threadId,
      startedAt: codexStartedAt,
      turnCount: turns.length,
      mode: hadLoadedLatest ? "resume-refresh" : "initial-turns"
    });
    this.emitThreadOpened(cacheEntry, turns);
    return { thread, turns };
  }

  /**
   * Loads older thread messages from cache or Codex.
   *
   * @param threadId Thread identifier.
   *
   * @returns Older turn collection and pagination state.
   */
  async loadOlderThreadMessages(
    threadId: string
  ): Promise<{ turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean }> {
    const cacheEntry = this.options.threadTurnCache.get(threadId);

    if (cacheEntry === null || cacheEntry.hasLoadedAllOlderTurns || cacheEntry.olderCursor === null) {
      return { turns: [], hasMoreOlderMessages: false };
    }

    if (isCacheOlderCursor(cacheEntry.olderCursor)) {
      const cachedResult = await this.options.threadCacheService.loadOlderTurns(
        cacheEntry,
        cacheEntry.olderCursor
      );

      if (cachedResult !== null) {
        return cachedResult;
      }
    }

    if (cacheEntry.thread.sourceId === null) {
      return { turns: [], hasMoreOlderMessages: false };
    }

    const client = await this.options.ensureClient(cacheEntry.thread.sourceId);
    const response = await client.listThreadTurns({
      threadId,
      cursor: cacheEntry.olderCursor,
      limit: THREAD_TURNS_PAGE_SIZE,
      sortDirection: "desc",
      itemsView: "full"
    });
    const responseObject = readObject(response);
    const rawTurns = Array.isArray(responseObject.data) ? responseObject.data : [];
    const olderCursor = readString(responseObject.nextCursor) || null;
    const previousTurnIds = new Set(cacheEntry.orderedTurnIds);
    const olderTurns = await this.resolveFullTurnItems(client, threadId, rawTurns);

    this.options.threadTurnCache.mergeOlderTurns(cacheEntry, olderTurns, olderCursor);
    await this.options.threadCacheService.writeDelta(
      cacheEntry,
      this.readMergedTurns(cacheEntry, olderTurns)
    );

    const addedTurns = this.options.threadTurnCache
      .toTurns(cacheEntry)
      .filter((turn) => !previousTurnIds.has(readString(readObject(turn).id)));
    const turns = mapTurnsToOpenCodexTurns(
      threadId,
      addedTurns,
      this.options.getSettings().language
    );
    const hasMoreOlderMessages = !cacheEntry.hasLoadedAllOlderTurns;

    if (turns.length > 0) {
      this.options.emit({
        type: "thread.turns.prepended",
        threadId,
        turns,
        hasMoreOlderMessages
      });
    }

    return { turns, hasMoreOlderMessages };
  }

  /**
   * Recovers a thread after a recoverable Codex process failure.
   *
   * @param threadId Thread identifier.
   *
   * @returns Success result.
   */
  async recoverThread(threadId: string): Promise<{ ok: true }> {
    if (this.recoveringThreadIds.has(threadId)) {
      return { ok: true };
    }

    this.recoveringThreadIds.add(threadId);
    this.options.emit({ type: "thread.recovery.started", threadId });

    try {
      const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);

      if (cachedSnapshot !== null && cachedSnapshot.syncState.hasLoadedLatest) {
        const cacheEntry = this.options.threadTurnCache.replaceFromSnapshot(cachedSnapshot);
        this.emitThreadOpened(cacheEntry, this.options.threadCacheService.readTurns(cacheEntry));
        await this.syncCachedThread(threadId);
      } else {
        await this.openThread(threadId);
      }

      this.options.emit({ type: "thread.recovery.completed", threadId });
      return { ok: true };
    } finally {
      this.recoveringThreadIds.delete(threadId);
    }
  }

  /**
   * Creates a new thread in a project.
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
    if (sourceId === null) {
      throw new Error("Cannot create a thread for a project without a Codex source.");
    }

    const resolvedSource = await this.options.resolveSource(sourceId);
    const client = await this.options.ensureClient(resolvedSource.id);
    const currentProjectPath = this.resolveCurrentProjectPath(projectPath);
    await this.options.cacheProject(currentProjectPath, resolvedSource.id);
    const response = await client.startThread({
      cwd: currentProjectPath,
      model: this.options.getSettings().defaultModel
    });
    const responseObject = readObject(response);
    const thread = withSourceId(mapThread(
      responseObject.thread,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    ), resolvedSource.id);
    const turns: OpenCodexTurn[] = [];

    this.options.threadTurnCache.getOrCreate(thread);
    this.options.emit({ type: "thread.created", thread, turns });
    await this.options.threadCacheService.writeIndex([thread]);
    return { thread, turns };
  }

  /**
   * Starts a user turn, creating a thread first when needed.
   *
   * @param threadId Thread identifier, or `null` to create a thread.
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
    reasoningEffort: "low" | "medium" | "high" | "xhigh" | null,
    shouldResumeExistingThread = true
  ): Promise<{ threadId: string; turnId: string }> {
    const trimmedText = text.trim();
    const input = buildTurnInput(trimmedText, attachments, references);

    if (input.length === 0) {
      return { threadId: threadId ?? "", turnId: "" };
    }

    const targetSourceId = threadId === null
      ? sourceId
      : await this.resolveThreadSourceId(threadId);

    if (targetSourceId === null) {
      throw new Error("Cannot start a turn for a project without a Codex source.");
    }

    const resolvedSource = await this.options.resolveSource(targetSourceId);
    const client = await this.options.ensureClient(resolvedSource.id);
    const targetThreadId = threadId ?? (
      await this.createThreadAndReturnId(client, projectPath, resolvedSource.id)
    );

    if (
      threadId !== null &&
      shouldResumeExistingThread &&
      this.shouldResumeThreadBeforeTurn(targetThreadId)
    ) {
      await this.resumeThreadForTurn(client, targetThreadId, projectPath, model);
    }

    const message: OpenCodexMessage = {
      id: createId("user"),
      threadId: targetThreadId,
      role: "user",
      content: trimmedText,
      status: "completed",
      createdAt: new Date().toISOString(),
      attachments
    };

    this.options.emit({ type: "message.started", threadId: targetThreadId, message });

    const turnResponse = await client.startTurn({
      threadId: targetThreadId,
      input,
      model,
      effort: reasoningEffort ?? this.options.getSettings().defaultReasoningEffort
    });
    const turn = readObject(readObject(turnResponse).turn);
    const turnId = readString(turn.id);

    if (turnId.length > 0) {
      this.options.emit({ type: "turn.started", threadId: targetThreadId, turnId });
    }

    return { threadId: targetThreadId, turnId };
  }

  /**
   * Sends steering input to an active Codex turn.
   *
   * @param threadId Thread identifier.
   * @param turnId Active turn identifier expected by Codex.
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
    const trimmedText = text.trim();
    const input = buildTurnInput(trimmedText, attachments, references);

    if (input.length === 0) {
      return { threadId, turnId };
    }

    const sourceId = await this.resolveThreadSourceId(threadId);

    if (sourceId === null) {
      throw new Error("Cannot steer a turn for a project without a Codex source.");
    }

    const client = await this.options.ensureClient(sourceId);
    const response = await client.steerTurn({
      threadId,
      input,
      expectedTurnId: turnId
    });
    const responseTurnId = readString(readObject(response).turnId);
    const effectiveTurnId = responseTurnId.length > 0 ? responseTurnId : turnId;
    await this.persistSteerUserInput(threadId, effectiveTurnId, input);

    return {
      threadId,
      turnId: effectiveTurnId
    };
  }

  private async persistSteerUserInput(
    threadId: string,
    turnId: string,
    input: unknown[]
  ): Promise<void> {
    const result = this.options.threadTurnCache.recordLiveItem(threadId, turnId, {
      type: "userMessage",
      id: createId("steer"),
      content: input
    });

    if (result === null) {
      return;
    }

    await this.options.threadCacheService.writeDelta(result.entry, [result.turn]);
  }

  /**
   * Edits the last user turn by rolling it back.
   *
   * @param threadId Thread identifier.
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @param _text Edited user text.
   * @param _attachments Image attachments.
   * @param model Optional model override.
   * @param reasoningEffort Optional reasoning effort override.
   *
   * @returns Thread and turn identifiers.
   */
  async editLastTurn(
    threadId: string,
    projectPath: string | null,
    sourceId: string | null,
    _text: string,
    _attachments: OpenCodexImageAttachment[],
    _references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: "low" | "medium" | "high" | "xhigh" | null
  ): Promise<{ threadId: string }> {
    const targetSourceId = await this.resolveThreadSourceId(threadId) ?? sourceId;

    if (targetSourceId === null) {
      throw new Error("Cannot edit a turn for a project without a Codex source.");
    }

    const client = await this.options.ensureClient(targetSourceId);

    if (this.shouldResumeThreadBeforeTurn(threadId)) {
      await this.resumeThreadForTurn(client, threadId, projectPath, model);
    }

    const rollbackResponse = await client.rollbackThread({
      threadId,
      numTurns: 1
    });
    const rollbackThread = readObject(readObject(rollbackResponse).thread);
    const rollbackThreadId = readString(rollbackThread.id) || threadId;
    const thread = withSourceId(mapThread(
      rollbackThread,
      model,
      reasoningEffort
    ), targetSourceId);
    const rawTurns = Array.isArray(rollbackThread.turns) ? rollbackThread.turns : [];
    const cacheEntry = this.options.threadTurnCache.replaceThreadTurns(thread, rawTurns);

    this.emitThreadOpened(
      cacheEntry,
      this.options.threadCacheService.readTurns(cacheEntry)
    );
    await this.options.threadCacheService.writeSnapshot(cacheEntry);

    return { threadId: rollbackThreadId };
  }

  private shouldResumeThreadBeforeTurn(threadId: string): boolean {
    const cacheEntry = this.options.threadTurnCache.get(threadId);

    if (cacheEntry === null) {
      return true;
    }

    return cacheEntry.turnsById.size > 0;
  }

  /**
   * Ensures a historical thread is active in the app-server before starting a turn.
   *
   * @param client Codex app-server client.
   * @param threadId Existing thread identifier.
   * @param projectPath Project path candidate.
   * @param model Optional model override.
   *
   * @returns Promise resolved once Codex has resumed the thread.
   */
  private async resumeThreadForTurn(
    client: CodexAppServerClient,
    threadId: string,
    projectPath: string | null,
    model: string | null
  ): Promise<void> {
    await client.resumeThread(threadId, {
      cwd: this.resolveCurrentProjectPath(projectPath),
      excludeTurns: true,
      model
    });
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
    const sourceId = await this.resolveThreadSourceId(threadId);

    if (sourceId === null) {
      throw new Error("Cannot interrupt a thread without a Codex source.");
    }

    const client = await this.options.ensureClient(sourceId);
    await client.interruptTurn(threadId, turnId);
  }

  /**
   * Starts an inline review of the thread's uncommitted changes.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved when Codex accepts the review request.
   */
  async startReview(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    const sourceId = await this.resolveThreadSourceId(threadId);

    if (sourceId === null) {
      throw new Error("Cannot start a review for a thread without a Codex source.");
    }

    const client = await this.options.ensureClient(sourceId);
    await this.resumeThreadForTurn(client, threadId, projectPath, null);
    const response = await client.startReview(threadId);
    const turn = readObject(readObject(response).turn);
    const turnId = readString(turn.id);

    if (turnId.length > 0) {
      this.options.emit({ type: "turn.started", threadId, turnId });
    }

    return { ok: true };
  }

  /**
   * Starts context compaction for a thread.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved when Codex accepts the compaction request.
   */
  async compactThread(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    const sourceId = await this.resolveThreadSourceId(threadId);

    if (sourceId === null) {
      throw new Error("Cannot compact a thread without a Codex source.");
    }

    const client = await this.options.ensureClient(sourceId);
    await this.resumeThreadForTurn(client, threadId, projectPath, null);
    await client.compactThread(threadId);

    return { ok: true };
  }

  /**
   * Synchronizes a thread shortly after a turn completes.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved when synchronization completes.
   */
  async syncCompletedTurn(threadId: string): Promise<void> {
    await delay(500);
    const sourceId = await this.resolveThreadSourceId(threadId);

    if (sourceId === null) {
      return;
    }

    const cacheEntry = this.options.threadTurnCache.get(threadId);

    if (cacheEntry !== null) {
      const client = await this.options.ensureClient(sourceId);
      await this.syncLatestTurns(client, cacheEntry);
      return;
    }

    await this.syncCachedThread(threadId);
  }

  /**
   * Records rich live turn details exposed by Codex notifications.
   *
   * @param notification Codex notification.
   * @returns Nothing.
   */
  recordNotification(notification: CodexNotification): void {
    const result = recordLiveNotification(this.options.threadTurnCache, notification);

    if (result === null || !shouldPersistLiveNotification(notification.method)) {
      return;
    }

    void this.options.threadCacheService.writeDelta(result.entry, [result.turn]);
  }

  /**
   * Renames a thread in Codex and cache.
   *
   * @param threadId Thread identifier.
   * @param name New title.
   *
   * @returns Promise resolved when rename completes.
   */
  async renameThread(threadId: string, name: string): Promise<void> {
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      return;
    }

    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    if (cachedSnapshot === null || cachedSnapshot.thread.sourceId === null) {
      throw new Error("Cannot rename a thread without a Codex source.");
    }

    const client = await this.options.ensureClient(cachedSnapshot.thread.sourceId);
    await client.renameThread(threadId, trimmedName);
    await this.options.threadCacheService.writeTitle(threadId, trimmedName);
    this.options.threadTurnCache.renameThread(threadId, trimmedName);
    this.options.emit({ type: "thread.renamed", threadId, name: trimmedName });
  }

  /**
   * Loads latest raw turns from Codex into memory.
   *
   * @param client Codex client.
   * @param cacheEntry In-memory thread cache entry.
   *
   * @returns Promise resolved when latest turns are merged.
   */
  private async loadLatestTurns(
    client: CodexAppServerClient,
    cacheEntry: ThreadTurnCacheEntry
  ): Promise<unknown[]> {
    const response = await client.readThread(cacheEntry.thread.id, false);
    const responseObject = readObject(response);

    const thread = {
      ...mapThread(
        responseObject.thread,
        cacheEntry.thread.model,
        cacheEntry.thread.reasoningEffort
      ),
      sourceId: cacheEntry.thread.sourceId
    };
    const nextEntry = this.options.threadTurnCache.getOrCreate(thread);
    const latestTurns = await this.readLatestTurnPage(client, cacheEntry.thread.id);

    this.options.threadTurnCache.mergeLatestTurns(nextEntry, latestTurns.turns, latestTurns.olderCursor);
    return this.readMergedTurns(nextEntry, latestTurns.turns);
  }

  /**
   * Synchronizes latest turns and emits deltas when content changed.
   *
   * @param client Codex client.
   * @param cacheEntry In-memory thread cache entry.
   * @param existingStartedAt Optional timing start timestamp.
   *
   * @returns Promise resolved when synchronization completes.
   */
  private async syncLatestTurns(
    client: CodexAppServerClient,
    cacheEntry: ThreadTurnCacheEntry,
    existingStartedAt: number | null = null
  ): Promise<void> {
    const syncStartedAt = existingStartedAt ?? Date.now();

    if (existingStartedAt === null) {
      this.options.emit({ type: "thread.sync.started", threadId: cacheEntry.thread.id });
    }

    try {
      const previousSignature = createCacheSignature(cacheEntry);
      const latestTurns = await this.loadLatestTurns(client, cacheEntry);
      await this.options.threadCacheService.writeIndex([cacheEntry.thread]);
      await this.options.threadCacheService.writeDelta(cacheEntry, latestTurns);
      const nextSignature = createCacheSignature(cacheEntry);

      if (previousSignature !== nextSignature) {
        this.options.emit({
          type: "thread.turns.synced",
          threadId: cacheEntry.thread.id,
          turns: this.options.threadCacheService.readTurns(cacheEntry),
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
      this.options.emit({ type: "thread.sync.completed", threadId: cacheEntry.thread.id });
    }
  }

  /**
   * Synchronizes a cached thread from Codex without loading its full history.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved when synchronization completes.
   */
  private async syncCachedThread(threadId: string): Promise<void> {
    const syncStartedAt = Date.now();
    this.options.emit({ type: "thread.sync.started", threadId });

    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    if (cachedSnapshot === null || cachedSnapshot.thread.sourceId === null) {
      throw new Error("Cannot synchronize a thread without a Codex source.");
    }

    const sourceId = cachedSnapshot.thread.sourceId;
    const cachedThread = cachedSnapshot.thread;
    const client = await this.options.ensureClient(sourceId);
    const thread = await this.readThreadMetadata(
      client,
      threadId,
      sourceId,
      cachedThread.model,
      cachedThread.reasoningEffort
    );
    const cacheEntry = this.options.threadTurnCache.getOrCreate(thread);

    await this.options.threadCacheService.writeIndex([thread]);
    this.options.emit({ type: "thread.metadata.updated", thread: cacheEntry.thread });
    await this.syncLatestTurns(client, cacheEntry, syncStartedAt);
  }

  /**
   * Reads thread metadata without forcing Codex to return full turn history.
   *
   * @param client Codex app-server client.
   * @param threadId Thread identifier.
   * @param sourceId Source identifier.
   * @param model Fallback model from the cached thread index.
   * @param reasoningEffort Fallback reasoning effort from the cached thread index.
   *
   * @returns OpenCodex thread metadata.
   */
  private async readThreadMetadata(
    client: CodexAppServerClient,
    threadId: string,
    sourceId: string | null,
    model: OpenCodexThread["model"] = null,
    reasoningEffort: OpenCodexThread["reasoningEffort"] = null
  ): Promise<OpenCodexThread> {
    const response = await client.readThread(threadId, false);
    const responseObject = readObject(response);

    return {
      ...mapThread(responseObject.thread, model, reasoningEffort),
      sourceId
    };
  }

  /**
   * Reads the latest page of turns through the official RPC pagination API.
   *
   * @param client Codex app-server client.
   * @param threadId Thread identifier.
   *
   * @returns Latest full turn payloads and the older-turn cursor.
   */
  private async readLatestTurnPage(
    client: CodexAppServerClient,
    threadId: string
  ): Promise<{ turns: unknown[]; olderCursor: string | null }> {
    const response = await client.listThreadTurns({
      threadId,
      limit: THREAD_TURNS_PAGE_SIZE,
      sortDirection: "desc",
      itemsView: "full"
    });
    const responseObject = readObject(response);
    const pageTurns = Array.isArray(responseObject.data) ? responseObject.data : [];
    const fullTurns = await this.resolveFullTurnItems(client, threadId, pageTurns);

    return {
      turns: fullTurns,
      olderCursor: readString(responseObject.nextCursor) || null
    };
  }

  /**
   * Ensures each returned turn carries its full item list.
   *
   * @param client Codex app-server client.
   * @param threadId Thread identifier.
   * @param turns Raw turn payloads to complete.
   *
   * @returns Turn payloads with full items when Codex exposes them.
   */
  private async resolveFullTurnItems(
    client: CodexAppServerClient,
    threadId: string,
    turns: unknown[]
  ): Promise<unknown[]> {
    const resolvedTurns: unknown[] = [];

    for (const turnValue of turns) {
      try {
        resolvedTurns.push(await this.resolveFullTurnItemList(client, threadId, turnValue));
      } catch {
        resolvedTurns.push(turnValue);
      }
    }

    return resolvedTurns;
  }

  /**
   * Loads a turn item page sequence when the turn payload is not already complete.
   *
   * @param client Codex app-server client.
   * @param threadId Thread identifier.
   * @param turnValue Raw turn payload.
   *
   * @returns Original or completed turn payload.
   */
  private async resolveFullTurnItemList(
    client: CodexAppServerClient,
    threadId: string,
    turnValue: unknown
  ): Promise<unknown> {
    const turn = readObject(turnValue);
    const turnId = readString(turn.id);

    if (turnId.length === 0 || readString(turn.itemsView) === "full") {
      return turnValue;
    }

    const items: unknown[] = [];
    let cursor: string | null = null;

    do {
      const response = await client.listThreadTurnItems({
        threadId,
        turnId,
        cursor,
        limit: 200,
        sortDirection: "asc"
      });
      const responseObject = readObject(response);
      const pageItems = Array.isArray(responseObject.data) ? responseObject.data : [];

      items.push(...pageItems);
      cursor = readString(responseObject.nextCursor) || null;
    } while (cursor !== null);

    return {
      ...turn,
      items,
      itemsView: "full"
    };
  }

  /**
   * Reads the cache-merged version of recently loaded raw turns.
   *
   * @param cacheEntry In-memory cache entry.
   * @param rawTurns Recently loaded raw turns.
   *
   * @returns Merged turn payloads ready to persist.
   */
  private readMergedTurns(cacheEntry: ThreadTurnCacheEntry, rawTurns: unknown[]): unknown[] {
    return rawTurns
      .map((turn) => readString(readObject(turn).id))
      .filter((turnId) => turnId.length > 0)
      .map((turnId) => cacheEntry.turnsById.get(turnId))
      .filter((turn): turn is unknown => turn !== undefined);
  }

  /**
   * Handles asynchronous open-thread failures.
   *
   * @param threadId Thread identifier.
   * @param error Error thrown during open or sync.
   *
   * @returns Nothing.
   */
  private handleThreadOpenError(threadId: string, error: Error): void {
    if (isMissingRolloutError(error)) {
      void this.forgetCachedThread(threadId);
    }

    this.options.handleClientError(error);
  }

  /**
   * Deletes missing rollout cache entries when Codex reports them.
   *
   * @param threadId Thread identifier.
   * @param error Unknown thrown value.
   *
   * @returns Promise resolved when cleanup completes.
   */
  private async handleMissingRollout(threadId: string, error: unknown): Promise<void> {
    if (!isMissingRolloutError(error)) {
      return;
    }

    await this.forgetCachedThread(threadId);
  }

  /**
   * Deletes a cached thread and refreshes the owning project list.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved when cache cleanup completes.
   */
  private async forgetCachedThread(threadId: string): Promise<void> {
    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    const projectPath = this.resolveCurrentProjectPath(cachedSnapshot?.thread.projectPath ?? null);

    await this.options.threadCacheService.deleteThread(threadId);

    const cachedThreads = await this.options.threadCacheService.readThreads(
      "currentProject",
      projectPath,
      cachedSnapshot?.thread.sourceId ?? null
    );
    this.emitThreadsUpdated(cachedThreads, projectPath);
  }

  /**
   * Emits a thread-opened event.
   *
   * @param cacheEntry In-memory thread cache entry.
   * @param turns UI turns to emit.
   *
   * @returns Nothing.
   */
  private emitThreadOpened(cacheEntry: ThreadTurnCacheEntry, turns: OpenCodexTurn[]): void {
    this.options.emit({
      type: "thread.opened",
      thread: cacheEntry.thread,
      turns,
      hasMoreOlderMessages: !cacheEntry.hasLoadedAllOlderTurns
    });
  }

  /**
   * Creates a thread and returns its identifier.
   *
   * @param client Codex client.
   * @param projectPath Project path.
   * @param sourceId Source identifier.
   *
   * @returns Created thread identifier.
   */
  private async createThreadAndReturnId(
    client: CodexAppServerClient,
    projectPath: string | null,
    sourceId: string
  ): Promise<string> {
    const currentProjectPath = this.resolveCurrentProjectPath(projectPath);
    await this.options.cacheProject(currentProjectPath, sourceId);
    const response = await client.startThread({
      cwd: currentProjectPath,
      model: this.options.getSettings().defaultModel
    });
    const responseObject = readObject(response);
    const thread = withSourceId(mapThread(
      responseObject.thread,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    ), sourceId);

    this.options.threadTurnCache.getOrCreate(thread);
    await this.options.threadCacheService.writeIndex([thread]);
    this.options.emit({ type: "thread.created", thread, turns: [] });
    return thread.id;
  }

  /**
   * Resolves the source that owns a thread.
   *
   * @param threadId Thread identifier.
   *
   * @returns Source identifier, or `null`.
   */
  private async resolveThreadSourceId(threadId: string): Promise<string | null> {
    const cacheEntry = this.options.threadTurnCache.get(threadId);

    if (cacheEntry?.thread.sourceId !== null && cacheEntry?.thread.sourceId !== undefined) {
      return cacheEntry.thread.sourceId;
    }

    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    return cachedSnapshot?.thread.sourceId ?? null;
  }

  /**
   * Resolves a project path with backend fallback.
   *
   * @param projectPath Project path candidate.
   *
   * @returns Normalized project path, or `null`.
   */
  private resolveCurrentProjectPath(projectPath: string | null): string | null {
    return normalizeProjectPath(projectPath) ?? normalizeProjectPath(this.options.backendOptions.projectPath);
  }

  /**
   * Emits refreshed thread metadata.
   *
   * @param threads Thread metadata collection.
   * @param projectPath Project filter path, or `null`.
   *
   * @returns Nothing.
   */
  private emitThreadsUpdated(threads: OpenCodexThread[], projectPath: string | null): void {
    this.options.emit({
      type: "threads.updated",
      threads,
      currentProjectFilterAvailable: projectPath !== null,
      projectPath
    });
  }

  /**
   * Writes thread timing diagnostics through the backend logger.
   *
   * @param message Timing label.
   * @param details Timing details including `startedAt`.
   *
   * @returns Nothing.
   */
  private logThreadTiming(
    message: string,
    details: Record<string, string | number | boolean>
  ): void {
    this.options.backendOptions.logger?.(`${message}: ${JSON.stringify({
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - Number(details.startedAt),
      ...details
    })}`);
  }
}

/**
 * Waits for a short duration.
 *
 * @param durationMs Duration in milliseconds.
 *
 * @returns Promise resolved after the delay.
 */
function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
