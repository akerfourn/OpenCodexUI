/**
 * Stores thread metadata and merged turn payloads for the active UI session.
 */
import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";
import type { CachedThreadSnapshot, CachedThreadSyncState } from "@open-codex-ui/opencodex-cache";

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

/**
 * Stores and merges thread turns for the active session.
 */
export class ThreadTurnCache {
  private readonly entries = new Map<string, ThreadTurnCacheEntry>();

  /**
   * Returns.
   *
   * @param threadId Thread identifier.
   *
   * @returns Computed value.
   */
  get(threadId: string): ThreadTurnCacheEntry | null {
    return this.entries.get(threadId) ?? null;
  }

  /**
   * Returns or create.
   *
   * @param thread Thread payload to process.
   *
   * @returns Computed value.
   */
  getOrCreate(thread: OpenCodexThread): ThreadTurnCacheEntry {
    const existing = this.entries.get(thread.id);

    if (existing !== undefined) {
      existing.thread = mergeThreadMetadata(existing.thread, thread);
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

  /**
   * Renames a thread and persists the new title.
   *
   * @param threadId Thread identifier.
   * @param title Thread title or display title.
   *
   * @returns Nothing.
   */
  renameThread(threadId: string, title: string): void {
    const entry = this.entries.get(threadId);

    if (entry === undefined) {
      return;
    }

    entry.thread = {
      ...entry.thread,
      customTitle: title,
      title
    };
  }

  /**
   * Updates codex thread title.
   *
   * @param threadId Thread identifier.
   * @param codexTitle Codex title.
   *
   * @returns Computed value.
   */
  updateCodexThreadTitle(threadId: string, codexTitle: string): ThreadTurnCacheEntry | null {
    const entry = this.entries.get(threadId);

    if (entry === undefined) {
      return null;
    }

    const customTitle = entry.thread.customTitle?.trim() ?? "";
    const title = resolveThreadTitle(codexTitle, customTitle, entry.thread.preview);

    entry.thread = {
      ...entry.thread,
      codexTitle,
      title
    };

    return entry;
  }

  /**
   * Merges latest turns.
   *
   * @param entry Entry.
   * @param turns Turn collection to process.
   * @param olderCursor Pagination cursor for older turns.
   *
   * @returns Nothing.
   */
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

  /**
   * Merges older turns.
   *
   * @param entry Entry.
   * @param turns Turn collection to process.
   * @param olderCursor Pagination cursor for older turns.
   *
   * @returns Nothing.
   */
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

  /**
   * Handles replace from snapshot.
   *
   * @param snapshot Cached thread snapshot.
   *
   * @returns Computed value.
   */
  replaceFromSnapshot(snapshot: CachedThreadSnapshot): ThreadTurnCacheEntry {
    const entry = this.getOrCreate(snapshot.thread);
    entry.turnsById.clear();
    entry.orderedTurnIds = [];
    mergeTurns(entry, snapshot.turns);
    applySyncState(entry, snapshot.syncState);
    return entry;
  }

  /**
   * Converts turns to the target representation.
   *
   * @param entry Entry.
   *
   * @returns Requested values.
   */
  toTurns(entry: ThreadTurnCacheEntry): unknown[] {
    return entry.orderedTurnIds
      .map((turnId) => entry.turnsById.get(turnId))
      .filter((turn): turn is unknown => turn !== undefined);
  }
}

/**
 * Resolves thread title.
 *
 * @param codexTitle Codex title.
 * @param customTitle Custom title.
 * @param preview Preview.
 *
 * @returns Computed string value.
 */
function resolveThreadTitle(codexTitle: string, customTitle: string, preview: string): string {
  if (customTitle.length > 0) {
    return customTitle;
  }

  if (codexTitle.length > 0) {
    return codexTitle;
  }

  return preview;
}

/**
 * Merges incoming thread metadata with the existing store state.
 *
 * @param currentThread Current thread state.
 * @param nextThread Next thread state.
 *
 * @returns Computed value.
 */
function mergeThreadMetadata(
  currentThread: OpenCodexThread,
  nextThread: OpenCodexThread
): OpenCodexThread {
  const customTitle = nextThread.customTitle ?? currentThread.customTitle;

  return {
    ...nextThread,
    customTitle,
    title: resolveThreadTitle(nextThread.codexTitle, customTitle?.trim() ?? "", nextThread.preview)
  };
}

/**
 * Applies sync state.
 *
 * @param entry Entry.
 * @param syncState Thread synchronization state.
 *
 * @returns Nothing.
 */
function applySyncState(entry: ThreadTurnCacheEntry, syncState: CachedThreadSyncState): void {
  entry.newestTurnId = syncState.newestTurnId;
  entry.oldestTurnId = syncState.oldestTurnId;
  entry.olderCursor = syncState.olderCursor;
  entry.hasLoadedLatest = syncState.hasLoadedLatest;
  entry.hasLoadedAllOlderTurns = syncState.hasLoadedAllOlderTurns;
  entry.lastSyncedAt = syncState.lastSyncedAt;
}

/**
 * Merges turns.
 *
 * @param entry Entry.
 * @param turns Turn collection to process.
 *
 * @returns Nothing.
 */
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

/**
 * Handles compare turns.
 *
 * @param left Left.
 * @param right Right.
 * @param leftId Left identifier.
 * @param rightId Right identifier.
 *
 * @returns Computed value.
 */
function compareTurns(left: unknown, right: unknown, leftId: string, rightId: string): number {
  const leftTime = readTurnTime(left);
  const rightTime = readTurnTime(right);

  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return leftId.localeCompare(rightId);
}

/**
 * Reads turn time.
 *
 * @param turn Turn payload to process.
 *
 * @returns Numeric value, or `null` when unavailable.
 */
function readTurnTime(turn: unknown): number | null {
  const value = readObject(turn);
  return readNullableNumber(value.startedAt) ?? readNullableNumber(value.completedAt);
}
