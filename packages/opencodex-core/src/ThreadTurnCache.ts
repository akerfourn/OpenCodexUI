import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import { readNullableNumber, readObject, readString } from "./mapping.js";

export type ThreadTurnCacheEntry = {
  thread: OpenCodexThread;
  turnsById: Map<string, unknown>;
  orderedTurnIds: string[];
  newestTurnId: string | null;
  oldestTurnId: string | null;
  olderCursor: string | null;
  hasLoadedLatest: boolean;
  hasLoadedAllOlderTurns: boolean;
  lastSyncedAt: string | null;
};

export class ThreadTurnCache {
  private readonly entries = new Map<string, ThreadTurnCacheEntry>();

  get(threadId: string): ThreadTurnCacheEntry | null {
    return this.entries.get(threadId) ?? null;
  }

  getOrCreate(thread: OpenCodexThread): ThreadTurnCacheEntry {
    const existing = this.entries.get(thread.id);

    if (existing !== undefined) {
      existing.thread = thread;
      return existing;
    }

    const created: ThreadTurnCacheEntry = {
      thread,
      turnsById: new Map(),
      orderedTurnIds: [],
      newestTurnId: null,
      oldestTurnId: null,
      olderCursor: null,
      hasLoadedLatest: false,
      hasLoadedAllOlderTurns: false,
      lastSyncedAt: null
    };

    this.entries.set(thread.id, created);
    return created;
  }

  mergeLatestTurns(
    entry: ThreadTurnCacheEntry,
    turns: unknown[],
    olderCursor: string | null
  ): void {
    const isFirstLatestLoad = !entry.hasLoadedLatest;

    mergeTurns(entry, turns);

    if (isFirstLatestLoad) {
      entry.olderCursor = olderCursor;
      entry.hasLoadedAllOlderTurns = olderCursor === null;
    }

    entry.hasLoadedLatest = true;
    entry.lastSyncedAt = new Date().toISOString();
  }

  mergeOlderTurns(
    entry: ThreadTurnCacheEntry,
    turns: unknown[],
    olderCursor: string | null
  ): void {
    mergeTurns(entry, turns);
    entry.olderCursor = olderCursor;
    entry.hasLoadedAllOlderTurns = olderCursor === null;
    entry.lastSyncedAt = new Date().toISOString();
  }

  toTurns(entry: ThreadTurnCacheEntry): unknown[] {
    return entry.orderedTurnIds
      .map((turnId) => entry.turnsById.get(turnId))
      .filter((turn): turn is unknown => turn !== undefined);
  }
}

function mergeTurns(entry: ThreadTurnCacheEntry, turns: unknown[]): void {
  for (const turn of turns) {
    const turnId = readString(readObject(turn).id);

    if (turnId.length === 0) {
      continue;
    }

    entry.turnsById.set(turnId, turn);
  }

  entry.orderedTurnIds = Array.from(entry.turnsById.entries())
    .sort((left, right) => compareTurns(left[1], right[1], left[0], right[0]))
    .map(([turnId]) => turnId);
  entry.oldestTurnId = entry.orderedTurnIds[0] ?? null;
  entry.newestTurnId = entry.orderedTurnIds.at(-1) ?? null;
}

function compareTurns(left: unknown, right: unknown, leftId: string, rightId: string): number {
  const leftTime = readTurnTime(left);
  const rightTime = readTurnTime(right);

  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return leftId.localeCompare(rightId);
}

function readTurnTime(turn: unknown): number | null {
  const value = readObject(turn);
  return readNullableNumber(value.startedAt) ?? readNullableNumber(value.completedAt);
}
