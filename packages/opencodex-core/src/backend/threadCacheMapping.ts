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

export function createCacheSignature(cacheEntry: ThreadTurnCacheEntry): string {
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

export function toOpenCodexThread(thread: CachedThreadSummary): OpenCodexThread {
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

export function withSourceId<T extends OpenCodexThread>(thread: T, sourceId: string): T & { sourceId: string } {
  return {
    ...thread,
    sourceId
  };
}

export function toCachedThreadSummary(thread: OpenCodexThreadWithProjectState): CachedThreadSummary {
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

export function toCachedThreadSnapshot(cacheEntry: ThreadTurnCacheEntry): CachedThreadSnapshot {
  return {
    thread: toCachedThreadSummary(cacheEntry.thread),
    turns: Array.from(cacheEntry.turnsById.values()),
    syncState: toCachedSyncState(cacheEntry)
  };
}

export function toCachedThreadDelta(cacheEntry: ThreadTurnCacheEntry, turns: unknown[]): CachedThreadDelta {
  return {
    threadId: cacheEntry.thread.id,
    turns,
    syncState: toCachedSyncState(cacheEntry)
  };
}

export function mergeFreshThreadList(
  freshThreads: OpenCodexThread[],
  cachedThreads: OpenCodexThread[]
): OpenCodexThread[] {
  if (cachedThreads.length === 0) {
    return freshThreads;
  }

  const cachedThreadsById = new Map(cachedThreads.map((thread) => [thread.id, thread]));

  return freshThreads.map((thread) => cachedThreadsById.get(thread.id) ?? thread);
}

export function readOldestTurnId(turns: unknown[]): string {
  const firstTurn = turns[0];

  if (firstTurn === undefined) {
    return "";
  }

  return readString(readObject(firstTurn).id);
}

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

export function isCacheOlderCursor(cursor: string): boolean {
  return cursor.startsWith("cache:");
}

export function readCacheOlderCursor(cursor: string): string {
  return cursor.startsWith("cache:") ? cursor.slice("cache:".length) : "";
}

export function createCacheOlderCursor(turnId: string): string | null {
  return turnId.length > 0 ? `cache:${turnId}` : null;
}
