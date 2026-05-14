/**
 * Stores thread metadata and merged turn payloads for the active UI session.
 */
import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";
import type { CachedThreadSnapshot, CachedThreadSyncState } from "@open-codex-ui/opencodex-cache";

import { readObject, readString } from "./mapping.js";
import {
  appendActivityDeltaToTurn,
  appendAgentMessageDeltaToTurn,
  appendReasoningDeltaToTurn,
  mergeTurns,
  recordLiveItemInTurn,
  type RecordedTurnMutation
} from "./threadTurnMerge.js";

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
   * Records or refreshes a live turn shell from Codex notifications.
   *
   * @param threadId Thread identifier.
   * @param turnValue Raw turn payload from Codex, when available.
   *
   * @returns Updated cache entry and turn, or `null` when the thread is not loaded.
   */
  recordLiveTurn(threadId: string, turnValue: unknown): RecordedTurnMutation | null {
    const entry = this.entries.get(threadId);

    if (entry === undefined) {
      return null;
    }

    const turn = readObject(turnValue);
    const turnId = readString(turn.id);

    if (turnId.length === 0) {
      return null;
    }

    mergeTurns(entry, [turn]);
    return { entry, turn: entry.turnsById.get(turnId) ?? turn };
  }

  /**
   * Records a live item update inside an existing turn.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   * @param itemValue Raw item payload from Codex.
   *
   * @returns Updated cache entry and turn, or `null` when it cannot be recorded.
   */
  recordLiveItem(
    threadId: string,
    turnId: string,
    itemValue: unknown
  ): RecordedTurnMutation | null {
    const entry = this.entries.get(threadId);

    if (entry === undefined || turnId.length === 0) {
      return null;
    }

    return recordLiveItemInTurn(entry, turnId, itemValue);
  }

  /**
   * Appends streamed text to a live assistant message.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   * @param itemId Assistant item identifier.
   * @param delta Text delta to append.
   * @param phase Message phase, when known.
   *
   * @returns Updated cache entry and turn, or `null` when it cannot be recorded.
   */
  appendAgentMessageDelta(
    threadId: string,
    turnId: string,
    itemId: string,
    delta: string,
    phase: unknown
  ): RecordedTurnMutation | null {
    const entry = this.entries.get(threadId);

    if (entry === undefined) {
      return null;
    }

    return appendAgentMessageDeltaToTurn(entry, turnId, itemId, delta, phase);
  }

  /**
   * Appends streamed text to a live reasoning item.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   * @param itemId Reasoning item identifier.
   * @param field Reasoning field to update.
   * @param delta Text delta to append.
   *
   * @returns Updated cache entry and turn, or `null` when it cannot be recorded.
   */
  appendReasoningDelta(
    threadId: string,
    turnId: string,
    itemId: string,
    field: "summary" | "content",
    delta: string
  ): RecordedTurnMutation | null {
    const entry = this.entries.get(threadId);

    if (entry === undefined) {
      return null;
    }

    return appendReasoningDeltaToTurn(entry, turnId, itemId, field, delta);
  }

  /**
   * Appends streamed output to a live activity item.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   * @param itemId Activity item identifier.
   * @param itemType Fallback item type.
   * @param field Output field to update.
   * @param delta Text delta to append.
   *
   * @returns Updated cache entry and turn, or `null` when it cannot be recorded.
   */
  appendActivityDelta(
    threadId: string,
    turnId: string,
    itemId: string,
    itemType: string,
    field: string,
    delta: string
  ): RecordedTurnMutation | null {
    const entry = this.entries.get(threadId);

    if (entry === undefined) {
      return null;
    }

    return appendActivityDeltaToTurn(entry, turnId, itemId, itemType, field, delta);
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
   * Replaces an entry with freshly returned raw turns.
   *
   * @param thread Thread metadata.
   * @param turns Raw turn collection.
   *
   * @returns Replaced cache entry.
   */
  replaceThreadTurns(thread: OpenCodexThread, turns: unknown[]): ThreadTurnCacheEntry {
    const entry = this.getOrCreate(thread);
    entry.turnsById.clear();
    entry.orderedTurnIds = [];
    mergeTurns(entry, turns);
    entry.hasLoadedLatest = true;
    entry.lastSyncedAt = new Date().toISOString();
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
    title: resolveThreadTitle(nextThread.codexTitle, customTitle?.trim() ?? "", nextThread.preview),
    model: nextThread.model ?? currentThread.model,
    reasoningEffort: nextThread.reasoningEffort ?? currentThread.reasoningEffort
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
