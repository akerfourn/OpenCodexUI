import type {
  OpenCodexMessage,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ChatTimelineStore } from "./ChatTimelineStore";
import {
  findFirstChangedTurnIndex,
  toTurnItem
} from "./chatTurnUtils";

/**
 * Applies incoming turns while preserving live-only streamed items.
 *
 * @param timeline Timeline store to mutate.
 * @param nextTurns Incoming turns.
 * @param strategy Replace or incremental merge mode.
 */
export function applyThreadTurns(
  timeline: ChatTimelineStore,
  nextTurns: OpenCodexTurn[],
  strategy: "replace" | "merge"
): void {
  const mergedTurns = preserveLiveTurnItems(timeline.turns, nextTurns);

  if (strategy === "replace" || timeline.turns.length === 0) {
    timeline.setTurns(mergedTurns);
    return;
  }

  const firstChangedIndex = findFirstChangedTurnIndex(timeline.turns, mergedTurns);

  if (firstChangedIndex === null) {
    return;
  }

  timeline.setTurns([
    ...timeline.turns.slice(0, firstChangedIndex),
    ...mergedTurns.slice(firstChangedIndex)
  ]);
}

/**
 * Applies a completed turn duration to a stored turn.
 *
 * @param timeline Timeline store to mutate.
 * @param turnId Turn identifier.
 * @param durationMs Duration in milliseconds, or `null`.
 */
export function applyTurnDuration(
  timeline: ChatTimelineStore,
  turnId: string,
  durationMs: number | null
): void {
  if (durationMs === null) {
    return;
  }

  const turn = timeline.turns.find((entry) => entry.id === turnId);

  if (turn !== undefined) {
    turn.durationMs = durationMs;
  }
}

/**
 * Creates or reuses an optimistic pending user turn.
 *
 * @param timeline Timeline store to mutate.
 * @param threadId Owning thread identifier.
 * @param message Optimistic user message.
 * @param pendingTurnId Current optimistic turn identifier.
 * @returns Unchanged pending id when reused, or the newly created id.
 */
export function upsertPendingUserTurn(
  timeline: ChatTimelineStore,
  threadId: string,
  message: OpenCodexMessage,
  pendingTurnId: string | null
): string | null {
  const existingTurn = findPendingUserTurn(timeline, message.content, pendingTurnId);

  if (existingTurn !== null) {
    existingTurn.threadId = threadId;
    return pendingTurnId;
  }

  const turn = findOrCreateTurn(timeline, threadId, `pending:${message.id}`);
  turn.items.push(toTurnItem(message));
  turn.items = movePlanItemsToLatestSubTurn(turn).items;
  timeline.refreshTurnStructure(turn.id);
  return turn.id;
}

/**
 * Moves an optimistic pending turn to the real Codex turn id.
 *
 * @param timeline Timeline store to mutate.
 * @param threadId Owning thread identifier.
 * @param pendingTurnId Current optimistic turn identifier.
 * @param turnId Real turn id emitted by Codex.
 * @returns Unchanged pending id unless the pending turn is renamed directly.
 */
export function movePendingTurnToStartedTurn(
  timeline: ChatTimelineStore,
  threadId: string,
  pendingTurnId: string | null,
  turnId: string
): string | null {
  const pendingTurn = findPendingTurn(timeline, pendingTurnId);
  const existingTurn = timeline.turns.find((turn) => turn.id === turnId);

  if (pendingTurn === undefined) {
    const turn = findOrCreateTurn(timeline, threadId, turnId);
    turn.status = "running";
    turn.startedAt = turn.startedAt ?? new Date().toISOString();
    return pendingTurnId;
  }

  if (existingTurn !== undefined) {
    existingTurn.items = [...pendingTurn.items, ...existingTurn.items];
    existingTurn.startedAt = existingTurn.startedAt ?? pendingTurn.startedAt ?? new Date().toISOString();
    existingTurn.status = "running";
    timeline.refreshTurnStructure(existingTurn.id);
    timeline.setTurns(timeline.turns.filter((turn) => turn !== pendingTurn));
    return pendingTurnId;
  }

  pendingTurn.id = turnId;
  pendingTurn.threadId = threadId;
  pendingTurn.status = "running";
  pendingTurn.startedAt = pendingTurn.startedAt ?? new Date().toISOString();
  timeline.syncTurnStores();
  timeline.refreshTurnStructure(turnId);
  return null;
}

/**
 * Moves plan activities into the sub-turn opened by the latest user item.
 *
 * Codex keeps the same turn id when a user steers an active turn. The UI uses
 * user items to split that turn into sub-turns, so an in-place plan update
 * must be repositioned when a later steer exists.
 *
 * @param turn Turn whose plan activities should be normalized.
 * @returns The original turn when no repositioning is needed, or a copy with
 * the plan activities moved after the latest user item.
 */
export function movePlanItemsToLatestSubTurn(turn: OpenCodexTurn): OpenCodexTurn {
  const latestUserIndex = findLastUserItemIndex(turn.items);

  if (latestUserIndex < 0) {
    return turn;
  }

  const hasPlanBeforeLatestUser = turn.items.some((item, index) => (
    index < latestUserIndex && isPlanItem(item)
  ));

  if (!hasPlanBeforeLatestUser) {
    return turn;
  }

  const planItems = turn.items.filter(isPlanItem);
  const itemsWithoutPlans = turn.items.filter((item) => !isPlanItem(item));
  const latestUserIndexWithoutPlans = findLastUserItemIndex(itemsWithoutPlans);

  if (latestUserIndexWithoutPlans < 0) {
    return turn;
  }

  return {
    ...turn,
    items: [
      ...itemsWithoutPlans.slice(0, latestUserIndexWithoutPlans + 1),
      ...planItems,
      ...itemsWithoutPlans.slice(latestUserIndexWithoutPlans + 1)
    ]
  };
}

/**
 * Finds a turn or creates an empty one.
 *
 * @param timeline Timeline store to mutate.
 * @param threadId Owning thread identifier.
 * @param turnId Turn identifier.
 * @returns Existing or created turn.
 */
export function findOrCreateTurn(
  timeline: ChatTimelineStore,
  threadId: string,
  turnId: string
): OpenCodexTurn {
  const existing = timeline.turns.find((turn) => turn.id === turnId);

  if (existing !== undefined) {
    return existing;
  }

  const created: OpenCodexTurn = {
    id: turnId,
    threadId,
    status: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    items: []
  };

  timeline.appendTurn(created);
  return created;
}

/**
 * Finds the last user item in a turn.
 *
 * @param items Turn items to inspect.
 * @returns Index of the last user item, or `-1` when none exists.
 */
function findLastUserItemIndex(items: OpenCodexTurn["items"]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.role === "user") {
      return index;
    }
  }

  return -1;
}

/**
 * Checks whether a turn item is a structured plan activity.
 *
 * @param item Turn item to inspect.
 * @returns Whether the item represents a plan.
 */
function isPlanItem(item: OpenCodexTurn["items"][number]): boolean {
  return item.role === "activity" && item.kind === "plan";
}

/**
 * Finds the current optimistic pending turn.
 *
 * @param timeline Timeline store to inspect.
 * @param pendingTurnId Current optimistic turn identifier.
 * @returns Pending turn, when present.
 */
function findPendingTurn(
  timeline: ChatTimelineStore,
  pendingTurnId: string | null
): OpenCodexTurn | undefined {
  if (pendingTurnId !== null) {
    return timeline.turns.find((turn) => turn.id === pendingTurnId);
  }

  return timeline.turns.find((turn) => turn.id.startsWith("pending:"));
}

/**
 * Finds a pending user turn with the same content.
 *
 * @param timeline Timeline store to inspect.
 * @param content User message content.
 * @param pendingTurnId Current optimistic turn identifier.
 * @returns Matching pending turn, or `null`.
 */
function findPendingUserTurn(
  timeline: ChatTimelineStore,
  content: string,
  pendingTurnId: string | null
): OpenCodexTurn | null {
  const pendingTurn = findPendingTurn(timeline, pendingTurnId);

  if (pendingTurn === undefined) {
    return null;
  }

  const pendingUserItem = pendingTurn.items.find((item) => item.role === "user");

  if (pendingUserItem?.content !== content) {
    return null;
  }

  return pendingTurn;
}

/**
 * Preserves live items that are richer than the latest Codex snapshot.
 *
 * @param currentTurns Current store turns.
 * @param nextTurns Incoming turns.
 * @returns Merged turns.
 */
function preserveLiveTurnItems(
  currentTurns: OpenCodexTurn[],
  nextTurns: OpenCodexTurn[]
): OpenCodexTurn[] {
  if (currentTurns.length === 0) {
    return nextTurns;
  }

  const currentTurnsById = new Map(currentTurns.map((turn) => [turn.id, turn]));
  const nextTurnIds = new Set(nextTurns.map((turn) => turn.id));
  const mergedTurns = nextTurns.map((nextTurn) => {
    const currentTurn = currentTurnsById.get(nextTurn.id);

    if (currentTurn === undefined) {
      return nextTurn;
    }

    const currentItemsById = new Map(currentTurn.items.map((item) => [item.id, item]));
    const nextItemIds = new Set(nextTurn.items.map((item) => item.id));
    let didPreserveExistingItem = false;
    const preservedItems = nextTurn.items.map((nextItem) => {
      const currentItem = currentItemsById.get(nextItem.id);

      if (currentItem === undefined) {
        return nextItem;
      }

      const preservedItem = chooseMostCompleteLiveItem(currentItem, nextItem);
      didPreserveExistingItem = didPreserveExistingItem || preservedItem !== nextItem;
      return preservedItem;
    });
    const missingLiveItems = currentTurn.items.filter((item) => (
      shouldPreserveLiveItem(item) &&
      !nextItemIds.has(item.id)
    ));

    if (missingLiveItems.length === 0 && !didPreserveExistingItem) {
      return nextTurn;
    }

    return {
      ...nextTurn,
      items: [
        ...preservedItems,
        ...missingLiveItems
      ]
    };
  });

  const missingPendingTurns = currentTurns.filter((turn) => (
    turn.id.startsWith("pending:") &&
    !nextTurnIds.has(turn.id)
  ));

  return [
    ...mergedTurns,
    ...missingPendingTurns
  ];
}

/**
 * Chooses the item version with the most complete live content.
 *
 * @param currentItem Current live item.
 * @param nextItem Incoming snapshot item.
 * @returns Item to keep.
 */
function chooseMostCompleteLiveItem(
  currentItem: OpenCodexTurn["items"][number],
  nextItem: OpenCodexTurn["items"][number]
): OpenCodexTurn["items"][number] {
  if (!shouldPreserveLiveItem(currentItem)) {
    return nextItem;
  }

  if (currentItem.content.length > nextItem.content.length) {
    return {
      ...nextItem,
      ...currentItem
    };
  }

  return nextItem;
}

/**
 * Checks whether a live item may contain extra information absent from sync.
 *
 * @param item Turn item candidate.
 * @returns Whether the item should be preserved across sync.
 */
function shouldPreserveLiveItem(item: OpenCodexTurn["items"][number]): boolean {
  return (
    item.role === "activity" ||
    item.status === "streaming" ||
    (item.role === "assistant" && item.phase === "commentary")
  );
}
