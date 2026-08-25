import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";

import type {
  OpenCodexThread,
  OpenCodexTurnExecutionMetadata
} from "@open-codex-ui/opencodex-protocol";

import { mapThread, readObject, readString } from "../../mapping.js";
import type { ThreadTurnCache, ThreadTurnCacheEntry } from "../../ThreadTurnCache.js";
import { isUnmaterializedThreadError } from "../shared/errors.js";
import {
  createCacheSignature,
  readMergedTurns
} from "./threadCacheMapping.js";
import {
  isUnmaterializedThreadSnapshot,
  overrideSnapshotSource
} from "./threadSnapshotMapping.js";
import type { CollaborationService } from "../collaboration/CollaborationService.js";
import type { ThreadCacheService } from "./ThreadCacheService.js";
import type { ThreadSourceResolver } from "./ThreadSourceResolver.js";
import type { ThreadTurnPageLoader } from "./ThreadTurnPageLoader.js";
import type {
  ClientPort,
  RuntimeEventPort
} from "../runtime/runtimePorts.js";

/** Details passed to the backend thread timing logger. */
export type ThreadTurnSyncTimingDetails = Record<string, string | number | boolean>;

/** Dependencies required to synchronize source-owned thread turns. */
export type ThreadTurnSyncServiceOptions = {
  /** Shared in-memory thread and turn state. */
  threadTurnCache: Pick<
    ThreadTurnCache,
    "get" | "getOrCreate" | "mergeLatestTurns" | "replaceFromSnapshot"
  >;
  /** SQLite-backed thread snapshots and turn deltas. */
  threadCacheService: Pick<
    ThreadCacheService,
    "readSnapshot" | "readTurns" | "writeIndex" | "writeDelta"
  > & Partial<Pick<ThreadCacheService, "writeTurnExecutionMetadata">>;
  /** Emits synchronization lifecycle and content events. */
  events: Pick<RuntimeEventPort, "emit">;
  /** Resolves source-scoped Codex clients. */
  clients: Pick<ClientPort, "ensureClient">;
  /** Resolves and repairs source ownership for cached threads. */
  sourceResolver: Pick<
    ThreadSourceResolver,
    "resolveThreadSourceId" | "repairThreadSourceId"
  >;
  /** Loads the latest turn page and its full item payloads. */
  pageLoader: Pick<ThreadTurnPageLoader, "readLatest">;
  /** Reconciles collaboration data after source-backed turns are loaded. */
  collaborationService: Pick<CollaborationService, "reconcileTurns"> &
    Partial<Pick<CollaborationService, "resolveSpawnExecutionMetadata">>;
  /** Writes timing diagnostics using the owning backend logger. */
  logThreadTiming(message: string, details: ThreadTurnSyncTimingDetails): void;
};

/** Coordinates source-aware latest-turn loading and synchronization. */
export class ThreadTurnSyncService {
  /** Ports used to load, merge, persist, and publish thread turn synchronization. */
  private readonly options: ThreadTurnSyncServiceOptions;

  /** Creates a thread turn synchronization service. */
  constructor(options: ThreadTurnSyncServiceOptions) {
    this.options = options;
  }

  /**
   * Synchronizes a completed turn after Codex has persisted its items.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source reported by the completion event, or `null`.
   * @returns Promise resolved when synchronization completes.
   */
  async syncCompleted(
    threadId: string,
    sourceIdOverride: string | null = null
  ): Promise<void> {
    await delay(500);
    const sourceId = sourceIdOverride
      ?? await this.options.sourceResolver.resolveThreadSourceId(threadId);

    if (sourceId === null) {
      return;
    }

    const cacheEntry = this.options.threadTurnCache.get(threadId);

    if (cacheEntry !== null) {
      if (cacheEntry.thread.sourceId !== sourceId) {
        await this.options.sourceResolver.repairThreadSourceId(threadId, sourceId);
      }

      const client = await this.options.clients.ensureClient(sourceId);
      await this.syncLatest(client, cacheEntry);
      return;
    }

    await this.syncCached(threadId, sourceId);
  }

  /**
   * Loads and merges the latest raw turns for an in-memory thread entry.
   *
   * @param client Codex app-server client.
   * @param cacheEntry In-memory thread cache entry.
   * @returns Merged raw turns ready for cache persistence.
   */
  async loadLatest(
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
    const latestTurns = await this.options.pageLoader.readLatest(client, cacheEntry.thread.id);

    this.options.threadTurnCache.mergeLatestTurns(nextEntry, latestTurns.turns, latestTurns.olderCursor);
    const mergedTurns = readMergedTurns(nextEntry, latestTurns.turns);

    await this.reconcileTurns(nextEntry.thread, mergedTurns);
    return mergedTurns;
  }

  /**
   * Synchronizes latest turns and emits deltas when content changed.
   *
   * @param client Codex app-server client.
   * @param cacheEntry In-memory thread cache entry.
   * @param existingStartedAt Optional timing start timestamp.
   * @returns `true` when synchronized turns changed the cached thread content.
   */
  private async syncLatest(
    client: CodexAppServerClient,
    cacheEntry: ThreadTurnCacheEntry,
    existingStartedAt: number | null = null
  ): Promise<boolean> {
    const syncStartedAt = existingStartedAt ?? Date.now();

    if (existingStartedAt === null) {
      this.options.events.emit({
        type: "thread.sync.started",
        sourceId: cacheEntry.thread.sourceId,
        threadId: cacheEntry.thread.id
      });
    }

    try {
      const previousThread = cacheEntry.thread;
      const previousSignature = createCacheSignature(cacheEntry);
      let latestTurns: unknown[];

      try {
        latestTurns = await this.loadLatest(client, cacheEntry);
      } catch (error) {
        if (isUnmaterializedThreadError(error)) {
          return false;
        }

        throw error;
      }

      const nextSignature = createCacheSignature(cacheEntry);

      if (previousSignature === nextSignature) {
        cacheEntry.thread = previousThread;
        return false;
      }

      await this.options.threadCacheService.writeIndex([cacheEntry.thread]);
      await this.options.threadCacheService.writeDelta(cacheEntry, latestTurns);
      this.options.events.emit({
        type: "thread.turns.synced",
        sourceId: cacheEntry.thread.sourceId,
        threadId: cacheEntry.thread.id,
        turns: this.options.threadCacheService.readTurns(cacheEntry),
        hasMoreOlderMessages: !cacheEntry.hasLoadedAllOlderTurns
      });
      return true;
    } finally {
      this.options.logThreadTiming("codex load finished", {
        threadId: cacheEntry.thread.id,
        startedAt: syncStartedAt,
        turnCount: cacheEntry.orderedTurnIds.length,
        mode: "background-sync"
      });
      this.options.events.emit({
        type: "thread.sync.completed",
        sourceId: cacheEntry.thread.sourceId,
        threadId: cacheEntry.thread.id
      });
    }
  }

  /**
   * Synchronizes a cached thread from Codex without loading its full history.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Explicit source known by the caller, or `null`.
   * @returns Promise resolved when synchronization completes.
   */
  async syncCached(
    threadId: string,
    sourceIdOverride: string | null = null
  ): Promise<void> {
    const syncStartedAt = Date.now();

    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    const sourceId = sourceIdOverride ?? cachedSnapshot?.thread.sourceId ?? null;

    if (sourceId === null) {
      throw new Error("Cannot synchronize a thread without a Codex source.");
    }

    if (cachedSnapshot === null) {
      const client = await this.options.clients.ensureClient(sourceId);
      const thread = await this.readMetadata(client, threadId, sourceId);
      const cacheEntry = this.options.threadTurnCache.getOrCreate(thread);

      await this.options.threadCacheService.writeIndex([cacheEntry.thread]);
      this.options.events.emit({ type: "thread.sync.started", sourceId, threadId });
      const didSyncTurns = await this.syncLatest(client, cacheEntry, syncStartedAt);

      if (didSyncTurns) {
        this.options.events.emit({ type: "thread.metadata.updated", thread: cacheEntry.thread });
      }
      return;
    }

    const effectiveSnapshot = overrideSnapshotSource(cachedSnapshot, sourceId);

    if (effectiveSnapshot.thread.sourceId !== cachedSnapshot.thread.sourceId) {
      await this.options.threadCacheService.writeIndex([effectiveSnapshot.thread]);
    }

    this.options.events.emit({ type: "thread.sync.started", sourceId, threadId });

    if (sourceIdOverride === null && isUnmaterializedThreadSnapshot(effectiveSnapshot)) {
      this.options.logThreadTiming("codex load finished", {
        threadId,
        startedAt: syncStartedAt,
        turnCount: 0,
        mode: "unmaterialized-thread"
      });
      this.options.events.emit({ type: "thread.sync.completed", sourceId, threadId });
      return;
    }

    const client = await this.options.clients.ensureClient(sourceId);
    const cacheEntry = this.options.threadTurnCache.get(threadId)
      ?? this.options.threadTurnCache.replaceFromSnapshot(effectiveSnapshot);

    if (cacheEntry.thread.sourceId !== sourceId) {
      await this.options.sourceResolver.repairThreadSourceId(threadId, sourceId);
    }

    const didSyncTurns = await this.syncLatest(client, cacheEntry, syncStartedAt);

    if (didSyncTurns) {
      this.options.events.emit({ type: "thread.metadata.updated", thread: cacheEntry.thread });
    }
  }

  /**
   * Reads thread metadata without forcing Codex to return full turn history.
   *
   * @param client Codex app-server client.
   * @param threadId Thread identifier.
   * @param sourceId Source identifier.
   * @param model Fallback model from the cached thread index.
   * @param reasoningEffort Fallback reasoning effort from the cached thread index.
   * @returns OpenCodex thread metadata.
   */
  async readMetadata(
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
   * Reconciles collaboration data when source-backed turns are loaded.
   *
   * @param thread Thread owning the turns.
   * @param turns Raw turn payloads.
   * @returns Promise resolved after reconciliation.
   */
  async reconcileTurns(
    thread: OpenCodexThread,
    turns: readonly unknown[]
  ): Promise<void> {
    if (thread.sourceId === null) {
      return;
    }

    await this.options.collaborationService.reconcileTurns(thread.sourceId, thread.id, turns);
    await this.enrichSpawnExecutionMetadata(thread, turns);
  }

  /**
   * Applies persisted spawn settings to historical child turns when available.
   *
   * @param thread Child thread owning the loaded turns.
   * @param turns Raw turns being synchronized.
   */
  private async enrichSpawnExecutionMetadata(
    thread: OpenCodexThread,
    turns: readonly unknown[]
  ): Promise<void> {
    if (
      this.options.collaborationService.resolveSpawnExecutionMetadata === undefined ||
      this.options.threadCacheService.writeTurnExecutionMetadata === undefined ||
      thread.sourceId === null ||
      thread.parentThreadId === null
    ) {
      return;
    }

    const spawnMetadata = await this.options.collaborationService.resolveSpawnExecutionMetadata(
      thread.sourceId,
      thread.id,
      thread.parentThreadId,
      thread.subAgentSource?.agentPath ?? null
    );

    if (spawnMetadata === null) {
      return;
    }

    for (const turnValue of turns) {
      const turnId = readString(readObject(turnValue).id);

      if (turnId.length === 0) {
        continue;
      }

      const metadata: OpenCodexTurnExecutionMetadata = {
        requestedModel: spawnMetadata.model,
        effectiveModel: spawnMetadata.model,
        requestedReasoningEffort: spawnMetadata.reasoningEffort,
        effectiveReasoningEffort: spawnMetadata.reasoningEffort,
        serviceTier: null
      };
      await this.options.threadCacheService.writeTurnExecutionMetadata(
        thread.sourceId,
        thread.id,
        turnId,
        metadata
      );
    }
  }
}

/**
 * Waits for a short duration before a completed-turn synchronization.
 *
 * @param durationMs Delay duration in milliseconds.
 * @returns Promise resolved after the delay.
 */
function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
