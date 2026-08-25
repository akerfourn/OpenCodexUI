import type {
  OpenCodexThread,
  OpenCodexThreadRuntimeStatus,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import {
  mapTurnsToOpenCodexTurns,
  readObject,
  readString
} from "../../mapping.js";
import type { ThreadTurnCache, ThreadTurnCacheEntry } from "../../ThreadTurnCache.js";
import {
  isMissingRolloutError,
  isUnmaterializedThreadError,
  toError
} from "../shared/errors.js";
import {
  isCacheOlderCursor,
  readMergedTurns
} from "./threadCacheMapping.js";
import type { ThreadCacheService } from "./ThreadCacheService.js";
import type { ThreadCatalogService } from "./ThreadCatalogService.js";
import {
  attachSourceIdToSnapshot,
  isUnmaterializedThreadSnapshot,
  shouldPersistSourceAssociation
} from "./threadSnapshotMapping.js";
import { readThreadActiveFlags, readThreadRuntimeStatus } from "./threadRuntimeStatus.js";
import type { ThreadSourceResolver } from "./ThreadSourceResolver.js";
import type { ThreadTurnPageLoader } from "./ThreadTurnPageLoader.js";
import type { ThreadTurnSyncService } from "./ThreadTurnSyncService.js";
import type {
  ClientPort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "../runtime/runtimePorts.js";

/** Details passed to the shared backend thread timing logger. */
export type ThreadReadTimingDetails = Record<string, string | number | boolean>;

/** Dependencies required for source-aware thread reads and recovery. */
export type ThreadReadServiceOptions = {
  /** In-memory thread and turn state used by read operations. */
  threadTurnCache: Pick<
    ThreadTurnCache,
    "get" | "getOrCreate" | "replaceFromSnapshot" | "mergeOlderTurns" | "toTurns"
  >;
  /** SQLite snapshot and turn persistence used by read operations. */
  threadCacheService: Pick<
    ThreadCacheService,
    "readSnapshot" | "readTurns" | "loadOlderTurns" | "writeIndex" | "writeDelta"
  >;
  /** Reads the language used when mapping older turns to UI turns. */
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  /** Emits opened and pagination lifecycle events. */
  events: Pick<RuntimeEventPort, "emit">;
  /** Resolves source-scoped Codex clients. */
  clients: Pick<ClientPort, "ensureClient">;
  /** Loads older Codex turn pages. */
  pageLoader: Pick<ThreadTurnPageLoader, "readOlder">;
  /** Loads metadata/latest turns and reconciles source-backed turns. */
  threadTurnSyncService: Pick<
    ThreadTurnSyncService,
    "reconcileTurns" | "readMetadata" | "loadLatest" | "syncCached"
  >;
  /** Resolves the source used by a recovery operation. */
  threadSourceResolver: Pick<ThreadSourceResolver, "resolveThreadSourceId">;
  /** Removes stale cached threads when Codex reports a missing rollout. */
  threadCatalogService: Pick<ThreadCatalogService, "removeCachedThread">;
  /** Writes shared timing diagnostics. */
  logThreadTiming(message: string, details: ThreadReadTimingDetails): void;
  /** Reports asynchronous client failures to the runtime. */
  handleClientError(error: Error): void;
};

/** Owns cache-first thread reads, opening, pagination, and recovery. */
export class ThreadReadService {
  /** Tracks threads currently undergoing recovery to avoid duplicate work. */
  private readonly recoveringThreadIds = new Set<string>();

  /** Runtime ports used by thread reads, opening, pagination, and recovery. */
  private readonly options: ThreadReadServiceOptions;

  /** Creates a thread read service from narrow runtime ports. */
  constructor(options: ThreadReadServiceOptions) {
    this.options = options;
  }

  /**
   * Reads the current app-server runtime status without loading turns.
   *
   * @param threadId Thread identifier.
   * @returns Runtime status reported by Codex app-server.
   */
  async readThreadRuntimeStatus(threadId: string): Promise<OpenCodexThreadRuntimeStatus> {
    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    const sourceId = cachedSnapshot?.thread.sourceId ?? null;
    const client = await this.options.clients.ensureClient(sourceId);
    const response = await client.readThread(threadId, false);
    const responseObject = readObject(response);
    const thread = readObject(responseObject.thread);
    const status = readThreadRuntimeStatus(thread.status);

    return {
      threadId,
      status,
      isActive: status === "unknown" ? null : status === "active",
      activeFlags: readThreadActiveFlags(thread.status)
    };
  }

  /**
   * Opens a thread from cache and starts background synchronization when possible.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source identifier known by the caller, or `null`.
   * @returns Opened thread and UI turns.
   */
  async openThread(
    threadId: string,
    sourceIdOverride: string | null = null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    const openStartedAt = Date.now();
    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    const effectiveSnapshot = attachSourceIdToSnapshot(cachedSnapshot, sourceIdOverride);

    if (effectiveSnapshot !== null && effectiveSnapshot.turns.length > 0) {
      const cacheEntry = this.options.threadTurnCache.replaceFromSnapshot(effectiveSnapshot);

      await this.options.threadTurnSyncService.reconcileTurns(
        cacheEntry.thread,
        effectiveSnapshot.turns
      );

      if (shouldPersistSourceAssociation(cachedSnapshot, effectiveSnapshot)) {
        await this.options.threadCacheService.writeIndex([cacheEntry.thread]);
      }

      const turns = this.options.threadCacheService.readTurns(cacheEntry);
      this.options.logThreadTiming("sqlite load finished", {
        threadId,
        startedAt: openStartedAt,
        turnCount: turns.length,
        cacheHit: true,
        hasLoadedLatest: effectiveSnapshot.syncState.hasLoadedLatest
      });

      this.emitThreadOpened(cacheEntry, turns);

      if (cacheEntry.thread.sourceId !== null) {
        void this.options.threadTurnSyncService.syncCached(threadId).catch((error: unknown) => {
          this.handleThreadOpenError(threadId, toError(error));
        });
      }

      return { thread: cacheEntry.thread, turns };
    }

    if (effectiveSnapshot !== null && effectiveSnapshot.thread.sourceId === null) {
      const cacheEntry = this.options.threadTurnCache.replaceFromSnapshot(effectiveSnapshot);
      const turns = this.options.threadCacheService.readTurns(cacheEntry);
      this.emitThreadOpened(cacheEntry, turns);
      return { thread: cacheEntry.thread, turns };
    }

    if (effectiveSnapshot !== null && isUnmaterializedThreadSnapshot(effectiveSnapshot)) {
      const cacheEntry = this.options.threadTurnCache.replaceFromSnapshot(effectiveSnapshot);

      if (shouldPersistSourceAssociation(cachedSnapshot, effectiveSnapshot)) {
        await this.options.threadCacheService.writeIndex([cacheEntry.thread]);
      }

      const turns = this.options.threadCacheService.readTurns(cacheEntry);
      this.options.logThreadTiming("sqlite load finished", {
        threadId,
        startedAt: openStartedAt,
        turnCount: turns.length,
        cacheHit: true,
        materialized: false
      });

      this.emitThreadOpened(cacheEntry, turns);
      return { thread: cacheEntry.thread, turns };
    }

    const sourceId = effectiveSnapshot?.thread.sourceId ?? sourceIdOverride;
    const client = await this.options.clients.ensureClient(sourceId);
    this.options.logThreadTiming("sqlite load finished", {
      threadId,
      startedAt: openStartedAt,
      turnCount: 0,
      cacheHit: false
    });

    const codexStartedAt = Date.now();
    let thread: OpenCodexThread;

    try {
      thread = await this.options.threadTurnSyncService.readMetadata(
        client,
        threadId,
        sourceId,
        effectiveSnapshot?.thread.model ?? null,
        effectiveSnapshot?.thread.reasoningEffort ?? null
      );
    } catch (error) {
      await this.handleMissingRollout(threadId, error);
      throw error;
    }

    const cacheEntry = this.options.threadTurnCache.getOrCreate(thread);
    const hadLoadedLatest = cacheEntry.hasLoadedLatest;
    let latestTurns: unknown[];

    try {
      latestTurns = await this.options.threadTurnSyncService.loadLatest(client, cacheEntry);
    } catch (error) {
      if (!isUnmaterializedThreadError(error)) {
        throw error;
      }

      const turns = this.options.threadCacheService.readTurns(cacheEntry);

      if (cacheEntry.thread.sourceId !== null) {
        await this.options.threadCacheService.writeIndex([cacheEntry.thread]);
      }
      this.options.logThreadTiming("codex load finished", {
        threadId,
        startedAt: codexStartedAt,
        turnCount: turns.length,
        mode: "unmaterialized-thread"
      });
      this.emitThreadOpened(cacheEntry, turns);
      return { thread: cacheEntry.thread, turns };
    }

    if (cacheEntry.thread.sourceId !== null) {
      await this.options.threadCacheService.writeIndex([cacheEntry.thread]);
      await this.options.threadCacheService.writeDelta(cacheEntry, latestTurns);
    }
    const turns = this.options.threadCacheService.readTurns(cacheEntry);
    this.options.logThreadTiming("codex load finished", {
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

    const client = await this.options.clients.ensureClient(cacheEntry.thread.sourceId);
    const olderPage = await this.options.pageLoader.readOlder(
      client,
      threadId,
      cacheEntry.olderCursor
    );
    const olderTurns = olderPage.turns;
    const olderCursor = olderPage.olderCursor;
    const previousTurnIds = new Set(cacheEntry.orderedTurnIds);

    this.options.threadTurnCache.mergeOlderTurns(cacheEntry, olderTurns, olderCursor);
    await this.options.threadTurnSyncService.reconcileTurns(cacheEntry.thread, olderTurns);
    await this.options.threadCacheService.writeDelta(
      cacheEntry,
      readMergedTurns(cacheEntry, olderTurns)
    );

    const addedTurns = this.options.threadTurnCache
      .toTurns(cacheEntry)
      .filter((turn) => !previousTurnIds.has(readString(readObject(turn).id)));
    const turns = mapTurnsToOpenCodexTurns(
      threadId,
      addedTurns,
      this.options.settings.getSettings().language
    );
    const hasMoreOlderMessages = !cacheEntry.hasLoadedAllOlderTurns;

    if (turns.length > 0) {
      this.options.events.emit({
        type: "thread.turns.prepended",
        sourceId: cacheEntry.thread.sourceId,
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
   * @returns Success result.
   */
  async recoverThread(threadId: string): Promise<{ ok: true }> {
    if (this.recoveringThreadIds.has(threadId)) {
      return { ok: true };
    }

    const sourceId = await this.options.threadSourceResolver.resolveThreadSourceId(threadId);
    this.recoveringThreadIds.add(threadId);
    this.options.events.emit({ type: "thread.recovery.started", sourceId, threadId });

    try {
      const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);

      if (cachedSnapshot !== null && cachedSnapshot.syncState.hasLoadedLatest) {
        const cacheEntry = this.options.threadTurnCache.replaceFromSnapshot(cachedSnapshot);
        this.emitThreadOpened(cacheEntry, this.options.threadCacheService.readTurns(cacheEntry));
        await this.options.threadTurnSyncService.syncCached(threadId);
      } else {
        await this.openThread(threadId);
      }

      this.options.events.emit({ type: "thread.recovery.completed", sourceId, threadId });
      return { ok: true };
    } finally {
      this.recoveringThreadIds.delete(threadId);
    }
  }

  /**
   * Reads a thread for secondary readonly display without emitting selection events.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source selected by the UI hierarchy.
   * @returns Thread and loaded turns.
   */
  async readThreadReadonly(
    threadId: string,
    sourceIdOverride: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    const unscopedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    const hasMismatchedSource = sourceIdOverride !== null
      && unscopedSnapshot !== null
      && unscopedSnapshot.thread.sourceId !== null
      && unscopedSnapshot.thread.sourceId !== sourceIdOverride;
    const cachedSnapshot = hasMismatchedSource
      ? null
      : attachSourceIdToSnapshot(unscopedSnapshot, sourceIdOverride);

    if (cachedSnapshot !== null && cachedSnapshot.turns.length > 0) {
      const cacheEntry = this.options.threadTurnCache.replaceFromSnapshot(cachedSnapshot);
      await this.options.threadTurnSyncService.reconcileTurns(cacheEntry.thread, cachedSnapshot.turns);
      return {
        thread: cacheEntry.thread,
        turns: this.options.threadCacheService.readTurns(cacheEntry)
      };
    }

    if (cachedSnapshot !== null && cachedSnapshot.thread.sourceId === null) {
      const cacheEntry = this.options.threadTurnCache.replaceFromSnapshot(cachedSnapshot);
      return {
        thread: cacheEntry.thread,
        turns: this.options.threadCacheService.readTurns(cacheEntry)
      };
    }

    const sourceId = cachedSnapshot?.thread.sourceId ?? sourceIdOverride;

    if (sourceId === null) {
      throw new Error("Cannot read a sub-agent thread without a Codex source.");
    }

    const client = await this.options.clients.ensureClient(sourceId);
    const thread = await this.options.threadTurnSyncService.readMetadata(
      client,
      threadId,
      sourceId,
      cachedSnapshot?.thread.model ?? null,
      cachedSnapshot?.thread.reasoningEffort ?? null
    );
    const cacheEntry = this.options.threadTurnCache.getOrCreate(thread);
    const latestTurns = await this.options.threadTurnSyncService.loadLatest(client, cacheEntry);

    await this.options.threadCacheService.writeIndex([cacheEntry.thread]);
    await this.options.threadCacheService.writeDelta(cacheEntry, latestTurns);

    return {
      thread: cacheEntry.thread,
      turns: this.options.threadCacheService.readTurns(cacheEntry)
    };
  }

  /** Emits the canonical opened event for a loaded cache entry. */
  private emitThreadOpened(cacheEntry: ThreadTurnCacheEntry, turns: OpenCodexTurn[]): void {
    this.options.events.emit({
      type: "thread.opened",
      thread: cacheEntry.thread,
      turns,
      hasMoreOlderMessages: !cacheEntry.hasLoadedAllOlderTurns,
      tokenUsage: cacheEntry.tokenUsage
    });
  }

  /** Handles errors raised by background synchronization after opening. */
  private handleThreadOpenError(threadId: string, error: Error): void {
    if (isMissingRolloutError(error)) {
      void this.options.threadCatalogService.removeCachedThread(threadId);
    }

    this.options.handleClientError(error);
  }

  /** Removes a missing rollout cache entry before propagating its original error. */
  private async handleMissingRollout(threadId: string, error: unknown): Promise<void> {
    if (!isMissingRolloutError(error)) {
      return;
    }

    await this.options.threadCatalogService.removeCachedThread(threadId);
  }
}
