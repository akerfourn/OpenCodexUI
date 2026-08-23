/**
 * Converts between in-memory thread state, cache records, and protocol values.
 */
import type {
  CachedThreadDelta,
  CachedThreadSnapshot,
  CachedThreadSummary,
  CachedThreadSyncState
} from "@open-codex-ui/opencodex-cache";
import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import { readObject, readNullableNumber, readString } from "../mapping.js";
import type { ThreadTurnCacheEntry } from "../ThreadTurnCache.js";
import type { OpenCodexThreadWithProjectState } from "./threadTypes.js";

/**
 * Creates a stable signature for all cached turns in a thread cache entry.
 *
 * @param cacheEntry In-memory thread cache entry.
 * @returns Signature used to skip redundant UI refreshes.
 */
export function createCacheSignature(cacheEntry: ThreadTurnCacheEntry): string {
  return cacheEntry.orderedTurnIds
    .map((turnId) => {
      return createTurnSignature(turnId, cacheEntry.turnsById.get(turnId));
    })
    .join("|");
}

/**
 * Reads recently loaded turns from the cache after they have been merged.
 *
 * @param cacheEntry In-memory cache entry.
 * @param rawTurns Recently loaded raw turns.
 * @returns Merged turn payloads ready to persist.
 */
export function readMergedTurns(cacheEntry: ThreadTurnCacheEntry, rawTurns: unknown[]): unknown[] {
  return rawTurns
    .map((turn) => readString(readObject(turn).id))
    .filter((turnId) => turnId.length > 0)
    .map((turnId) => cacheEntry.turnsById.get(turnId))
    .filter((turn): turn is unknown => turn !== undefined);
}

/**
 * Creates a compact signature for one cached raw turn.
 *
 * @param turnId Turn identifier.
 * @param turnValue Raw turn payload.
 *
 * @returns Signature used to detect UI-relevant sync changes.
 */
function createTurnSignature(turnId: string, turnValue: unknown): string {
  const turn = readObject(turnValue);
  const status = readString(turn.status);
  const durationMs = readNullableNumber(turn.durationMs);
  const items = Array.isArray(turn.items) ? turn.items : [];
  const contentHash = hashString(JSON.stringify(items));

  return `${turnId}:${status}:${durationMs ?? "none"}:${items.length}:${contentHash}`;
}

/**
 * Computes a deterministic hash for raw turn item content.
 *
 * @param value Serialized value to hash.
 *
 * @returns Numeric hash.
 */
function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }

  return hash;
}

/**
 * Maps a cached thread summary to the protocol thread DTO.
 *
 * @param thread Cached thread summary from SQLite or memory.
 * @returns Protocol thread DTO.
 */
export function toOpenCodexThread(thread: CachedThreadSummary): OpenCodexThread {
  const mappedThread: OpenCodexThread = {
    id: thread.id,
    sessionId: thread.sessionId,
    parentThreadId: thread.parentThreadId,
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
    updatedAt: thread.updatedAt,
    isArchived: thread.isArchived === true,
    threadSource: thread.threadSource,
    agentNickname: thread.agentNickname,
    agentRole: thread.agentRole,
    subAgentSource: thread.subAgentSource,
    canAcceptDirectInput: null
  };

  if (thread.status !== undefined) {
    mappedThread.status = thread.status;
  }

  return mappedThread;
}

/**
 * Adds an explicit source id to a protocol thread.
 *
 * @param thread Thread DTO.
 * @param sourceId Source id to attach.
 * @returns Thread DTO with a non-null source id.
 */
export function withSourceId<T extends OpenCodexThread>(thread: T, sourceId: string): T & { sourceId: string } {
  return {
    ...thread,
    sourceId
  };
}

/**
 * Maps a protocol thread with project state to a cache summary.
 *
 * @param thread Thread DTO enriched with project visibility state.
 * @returns Cached thread summary.
 */
export function toCachedThreadSummary(thread: OpenCodexThreadWithProjectState): CachedThreadSummary {
  const cachedThread: CachedThreadSummary = {
    id: thread.id,
    sessionId: thread.sessionId,
    parentThreadId: thread.parentThreadId,
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
    updatedAt: thread.updatedAt,
    isArchived: thread.isArchived,
    threadSource: thread.threadSource,
    agentNickname: thread.agentNickname,
    agentRole: thread.agentRole,
    subAgentSource: thread.subAgentSource,
    canAcceptDirectInput: thread.canAcceptDirectInput
  };

  if (thread.status !== undefined) {
    cachedThread.status = thread.status;
  }

  return cachedThread;
}

/**
 * Serializes an in-memory cache entry to a SQLite thread snapshot.
 *
 * @param cacheEntry In-memory thread cache entry.
 * @returns Persistable thread snapshot.
 */
export function toCachedThreadSnapshot(cacheEntry: ThreadTurnCacheEntry): CachedThreadSnapshot {
  return {
    thread: toCachedThreadSummary(cacheEntry.thread),
    turns: Array.from(cacheEntry.turnsById.values()),
    syncState: toCachedSyncState(cacheEntry),
    tokenUsage: cacheEntry.tokenUsage
  };
}

/**
 * Serializes a set of changed turns to a SQLite delta.
 *
 * @param cacheEntry In-memory thread cache entry.
 * @param turns Changed raw turns to persist.
 * @returns Persistable thread delta.
 */
export function toCachedThreadDelta(cacheEntry: ThreadTurnCacheEntry, turns: unknown[]): CachedThreadDelta {
  return {
    threadId: cacheEntry.thread.id,
    turns,
    syncState: toCachedSyncState(cacheEntry)
  };
}

/**
 * Merges fresh Codex threads with cached summaries to preserve local metadata.
 *
 * @param freshThreads Threads returned by Codex.
 * @param cachedThreads Cached threads already known locally.
 * @returns Fresh list with cached fields where available.
 */
export function mergeFreshThreadList(
  freshThreads: OpenCodexThread[],
  cachedThreads: OpenCodexThread[]
): OpenCodexThread[] {
  if (cachedThreads.length === 0) {
    return freshThreads;
  }

  const cachedThreadsById = new Map(cachedThreads.map((thread) => [thread.id, thread]));

  return freshThreads.map((thread) => {
    const cachedThread = cachedThreadsById.get(thread.id);

    if (cachedThread === undefined) {
      return thread;
    }

    return {
      ...cachedThread,
      parentThreadId: thread.parentThreadId ?? cachedThread.parentThreadId,
      agentNickname: thread.agentNickname ?? cachedThread.agentNickname,
      agentRole: thread.agentRole ?? cachedThread.agentRole,
      subAgentSource: thread.subAgentSource ?? cachedThread.subAgentSource,
      canAcceptDirectInput: thread.canAcceptDirectInput
    };
  });
}

/**
 * Reads the oldest turn id from a raw turn array.
 *
 * @param turns Raw turn payloads ordered newest-to-oldest or oldest-to-newest by caller.
 * @returns Oldest turn id, or an empty string when no turn exists.
 */
export function readOldestTurnId(turns: unknown[]): string {
  const firstTurn = turns[0];

  if (firstTurn === undefined) {
    return "";
  }

  return readString(readObject(firstTurn).id);
}

/**
 * Maps one in-memory cache entry to its sync metadata.
 *
 * @param cacheEntry In-memory thread cache entry.
 * @returns Cached sync state.
 */
export function toCachedSyncState(cacheEntry: ThreadTurnCacheEntry): CachedThreadSyncState {
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
 * Checks whether a cursor targets the local cache instead of Codex.
 *
 * @param cursor Cursor string.
 * @returns Whether the cursor is a cache cursor.
 */
export function isCacheOlderCursor(cursor: string): boolean {
  return cursor.startsWith("cache:");
}

/**
 * Extracts a turn id from a cache cursor.
 *
 * @param cursor Cursor string.
 * @returns Cached turn id, or an empty string.
 */
export function readCacheOlderCursor(cursor: string): string {
  return cursor.startsWith("cache:") ? cursor.slice("cache:".length) : "";
}

/**
 * Creates a cache cursor from a turn id.
 *
 * @param turnId Turn id used as pagination boundary.
 * @returns Cache cursor, or `null` when no boundary exists.
 */
export function createCacheOlderCursor(turnId: string): string | null {
  return turnId.length > 0 ? `cache:${turnId}` : null;
}
