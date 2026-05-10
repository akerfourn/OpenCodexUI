import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type {
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

export class ThreadConversationService {
  private readonly recoveringThreadIds = new Set<string>();

  constructor(private readonly options: ThreadConversationServiceOptions) {}

  async listThreads(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId: string | null,
    searchTerm?: string
  ): Promise<OpenCodexThread[]> {
    const currentProjectPath = scope === "currentProject"
      ? this.resolveCurrentProjectPath(projectPath)
      : null;
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
        void this.resumeAndSyncCachedThread(threadId).catch((error: unknown) => {
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
    let response: unknown;

    try {
      response = await client.resumeThread(threadId, { excludeTurns: true });
    } catch (error) {
      await this.handleMissingRollout(threadId, error);
      throw error;
    }

    const responseObject = readObject(response);
    const thread = mapThread(
      responseObject.thread,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    );
    const cacheEntry = this.options.threadTurnCache.getOrCreate(thread);

    if (cacheEntry.hasLoadedLatest) {
      const turns = this.options.threadCacheService.readTurns(cacheEntry);
      this.logThreadTiming("codex load finished", {
        threadId,
        startedAt: codexStartedAt,
        turnCount: turns.length,
        mode: "resume-only"
      });
      this.emitThreadOpened(cacheEntry, turns);
      void this.syncLatestTurns(client, cacheEntry).catch((error: unknown) => {
        this.options.handleClientError(toError(error));
      });
      return { thread, turns };
    }

    await this.loadLatestTurns(client, cacheEntry);
    await this.options.threadCacheService.writeSnapshot(cacheEntry);
    const turns = this.options.threadCacheService.readTurns(cacheEntry);
    this.logThreadTiming("codex load finished", {
      threadId,
      startedAt: codexStartedAt,
      turnCount: turns.length,
      mode: "initial-turns"
    });
    this.emitThreadOpened(cacheEntry, turns);
    return { thread, turns };
  }

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
      sortDirection: "desc"
    });
    const responseObject = readObject(response);
    const rawTurns = Array.isArray(responseObject.data) ? responseObject.data : [];
    const olderCursor = readString(responseObject.nextCursor) || null;
    const previousTurnIds = new Set(cacheEntry.orderedTurnIds);

    this.options.threadTurnCache.mergeOlderTurns(cacheEntry, rawTurns, olderCursor);
    await this.options.threadCacheService.writeDelta(cacheEntry, rawTurns);

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
        await this.resumeAndSyncCachedThread(threadId);
      } else {
        await this.openThread(threadId);
      }

      this.options.emit({ type: "thread.recovery.completed", threadId });
      return { ok: true };
    } finally {
      this.recoveringThreadIds.delete(threadId);
    }
  }

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

    this.options.emit({ type: "thread.created", thread, turns });
    await this.options.threadCacheService.writeIndex([thread]);
    return { thread, turns };
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
    const trimmedText = text.trim();
    const input = buildTurnInput(trimmedText, attachments);

    if (input.length === 0) {
      return { threadId: threadId ?? "", turnId: "" };
    }

    if (sourceId === null) {
      throw new Error("Cannot start a turn for a project without a Codex source.");
    }

    const resolvedSource = await this.options.resolveSource(sourceId);
    const client = await this.options.ensureClient(resolvedSource.id);
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

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    const sourceId = await this.resolveThreadSourceId(threadId);

    if (sourceId === null) {
      throw new Error("Cannot interrupt a thread without a Codex source.");
    }

    const client = await this.options.ensureClient(sourceId);
    await client.interruptTurn(threadId, turnId);
  }

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

    this.options.threadTurnCache.mergeLatestTurns(cacheEntry, turns, olderCursor);
  }

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
      await this.loadLatestTurns(client, cacheEntry);
      await this.options.threadCacheService.writeSnapshot(cacheEntry);
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

  private async resumeAndSyncCachedThread(threadId: string): Promise<void> {
    const syncStartedAt = Date.now();
    this.options.emit({ type: "thread.sync.started", threadId });

    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    const sourceId = cachedSnapshot?.thread.sourceId ?? null;
    if (sourceId === null) {
      throw new Error("Cannot synchronize a thread without a Codex source.");
    }

    const client = await this.options.ensureClient(sourceId);
    const response = await client.resumeThread(threadId, { excludeTurns: true });
    const responseObject = readObject(response);
    const thread = withSourceId(mapThread(
      responseObject.thread,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    ), sourceId);
    const cacheEntry = this.options.threadTurnCache.getOrCreate(thread);

    await this.options.threadCacheService.writeIndex([thread]);
    this.options.emit({ type: "thread.metadata.updated", thread: cacheEntry.thread });
    await this.syncLatestTurns(client, cacheEntry, syncStartedAt);
  }

  private handleThreadOpenError(threadId: string, error: Error): void {
    if (isMissingRolloutError(error)) {
      void this.forgetCachedThread(threadId);
    }

    this.options.handleClientError(error);
  }

  private async handleMissingRollout(threadId: string, error: unknown): Promise<void> {
    if (!isMissingRolloutError(error)) {
      return;
    }

    await this.forgetCachedThread(threadId);
  }

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

  private emitThreadOpened(cacheEntry: ThreadTurnCacheEntry, turns: OpenCodexTurn[]): void {
    this.options.emit({
      type: "thread.opened",
      thread: cacheEntry.thread,
      turns,
      hasMoreOlderMessages: !cacheEntry.hasLoadedAllOlderTurns
    });
  }

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
    await this.options.threadCacheService.writeIndex([thread]);
    this.options.emit({ type: "thread.created", thread, turns: [] });
    return thread.id;
  }

  private async resolveThreadSourceId(threadId: string): Promise<string | null> {
    const cacheEntry = this.options.threadTurnCache.get(threadId);

    if (cacheEntry?.thread.sourceId !== null && cacheEntry?.thread.sourceId !== undefined) {
      return cacheEntry.thread.sourceId;
    }

    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    return cachedSnapshot?.thread.sourceId ?? null;
  }

  private resolveCurrentProjectPath(projectPath: string | null): string | null {
    return normalizeProjectPath(projectPath) ?? normalizeProjectPath(this.options.backendOptions.projectPath);
  }

  private emitThreadsUpdated(threads: OpenCodexThread[], projectPath: string | null): void {
    this.options.emit({
      type: "threads.updated",
      threads,
      currentProjectFilterAvailable: projectPath !== null,
      projectPath
    });
  }

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
