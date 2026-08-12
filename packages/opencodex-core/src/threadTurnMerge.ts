/**
 * Merges raw Codex turns while preserving locally enriched live items.
 */
import { readMessagePhase, readObject, readString } from "./mapping.js";
import type { ThreadTurnCacheEntry } from "./ThreadTurnCache.js";
import {
  bufferLiveTextDelta,
  materializeLiveItemText,
  materializeLiveTurnText
} from "./liveTurnTextBuffer.js";
import {
  compareTurns,
  mergeRecordPreservingExistingDetails,
  mergeTurnPreservingExistingItems,
  readTurnItemKey,
  readTurnItems
} from "./threadTurnMergeValues.js";
import {
  attachTurnExecutionMetadata,
  mergeTurnExecutionMetadata,
  readTurnExecutionMetadata
} from "./turnExecutionMetadata.js";

export type RecordedTurnMutation = {
  entry: ThreadTurnCacheEntry;
  turn: unknown;
};

/**
 * Merges raw turns into a cache entry.
 *
 * @param entry Entry to update.
 * @param turns Turn collection to merge.
 *
 * @returns Nothing.
 */
export function mergeTurns(entry: ThreadTurnCacheEntry, turns: unknown[]): void {
  for (const turn of turns) {
    const turnId = readString(readObject(turn).id);

    if (turnId.length === 0) {
      continue;
    }

    materializeLiveTurnText(entry, turnId);
    const existingTurn = entry.turnsById.get(turnId);
    const incomingExecution = readTurnExecutionMetadata(turn);

    if (incomingExecution !== null) {
      entry.turnExecutionMetadataById.set(
        turnId,
        mergeTurnExecutionMetadata(
          entry.turnExecutionMetadataById.get(turnId) ?? null,
          incomingExecution
        )
      );
    }

    const mergedTurn = existingTurn === undefined
      ? turn
      : mergeTurnPreservingExistingItems(existingTurn, turn);
    const execution = entry.turnExecutionMetadataById.get(turnId);
    const nextTurn = execution === undefined
      ? mergedTurn
      : attachTurnExecutionMetadata(mergedTurn, execution);

    entry.turnsById.set(turnId, nextTurn);

    if (entry.turnItemsById.has(turnId)) {
      indexTurnItems(entry, turnId, nextTurn);
    }
  }

  entry.orderedTurnIds = Array.from(entry.turnsById.entries())
    .sort((left, right) => compareTurns(left[1], right[1], left[0], right[0]))
    .map(([turnId]) => turnId);
  entry.oldestTurnId = entry.orderedTurnIds[0] ?? null;
  entry.newestTurnId = entry.orderedTurnIds.at(-1) ?? null;
}

/**
 * Records a live item update inside an existing turn.
 *
 * @param entry Cache entry.
 * @param turnId Turn identifier.
 * @param itemValue Raw item payload.
 *
 * @returns Updated turn mutation.
 */
export function recordLiveItemInTurn(
  entry: ThreadTurnCacheEntry,
  turnId: string,
  itemValue: unknown
): RecordedTurnMutation {
  const turn = ensureTurn(entry, turnId);
  const item = readObject(itemValue);
  const itemId = readTurnItemKey(item);

  if (itemId.length === 0) {
    return { entry, turn };
  }

  materializeLiveItemText(entry, turnId, itemId);
  const items = readMutableTurnItems(turn);
  const itemsById = getOrCreateTurnItemIndex(entry, turnId, turn);
  const indexedItem = itemsById.get(itemId);

  if (indexedItem !== undefined) {
    const existingIndex = items.indexOf(indexedItem);
    const mergedItem = mergeRecordPreservingExistingDetails(
      indexedItem,
      item
    );

    if (existingIndex >= 0) {
      items[existingIndex] = mergedItem;
    } else {
      items.push(mergedItem);
    }

    itemsById.set(itemId, mergedItem);
  } else {
    items.push(item);
    itemsById.set(itemId, item);
  }

  turn.items = items;
  return { entry, turn };
}

/**
 * Appends streamed assistant text to a live turn.
 *
 * @param entry Cache entry.
 * @param turnId Turn identifier.
 * @param itemId Assistant item identifier.
 * @param delta Text delta.
 * @param phase Message phase, when known.
 *
 * @returns Updated turn mutation, or `null`.
 */
export function appendAgentMessageDeltaToTurn(
  entry: ThreadTurnCacheEntry,
  turnId: string,
  itemId: string,
  delta: string,
  phase: unknown
): RecordedTurnMutation | null {
  if (itemId.length === 0 || delta.length === 0) {
    return null;
  }

  return appendItemTextDelta(entry, turnId, itemId, {
    type: "agentMessage",
    id: itemId,
    text: "",
    phase: readMessagePhase(phase),
    memoryCitation: null
  }, "text", delta);
}

/**
 * Appends streamed reasoning text to a live turn.
 *
 * @param entry Cache entry.
 * @param turnId Turn identifier.
 * @param itemId Reasoning item identifier.
 * @param field Reasoning field to update.
 * @param delta Text delta.
 *
 * @returns Updated turn mutation, or `null`.
 */
export function appendReasoningDeltaToTurn(
  entry: ThreadTurnCacheEntry,
  turnId: string,
  itemId: string,
  field: "summary" | "content",
  delta: string
): RecordedTurnMutation | null {
  if (itemId.length === 0 || delta.length === 0) {
    return null;
  }

  const liveItem = ensureLiveTurnItem(entry, turnId, itemId, {
    type: "reasoning",
    id: itemId,
    summary: [],
    content: []
  });

  if (liveItem === null) {
    return null;
  }

  bufferLiveTextDelta(entry, turnId, itemId, field, "array", delta);
  return { entry, turn: liveItem.turn };
}

/**
 * Appends streamed activity output to a live turn.
 *
 * @param entry Cache entry.
 * @param turnId Turn identifier.
 * @param itemId Activity item identifier.
 * @param itemType Fallback item type.
 * @param field Field to update.
 * @param delta Text delta.
 *
 * @returns Updated turn mutation, or `null`.
 */
export function appendActivityDeltaToTurn(
  entry: ThreadTurnCacheEntry,
  turnId: string,
  itemId: string,
  itemType: string,
  field: string,
  delta: string
): RecordedTurnMutation | null {
  if (itemId.length === 0 || delta.length === 0) {
    return null;
  }

  return appendItemTextDelta(entry, turnId, itemId, {
    type: itemType,
    id: itemId
  }, field, delta);
}

/**
 * Ensures a running placeholder turn exists before live item mutations.
 *
 * @param entry Thread cache entry.
 * @param turnId Turn identifier.
 * @returns Existing or newly created raw turn record.
 */
function ensureTurn(entry: ThreadTurnCacheEntry, turnId: string): Record<string, unknown> {
  const existingTurn = readObject(entry.turnsById.get(turnId));

  if (readString(existingTurn.id).length > 0) {
    return existingTurn;
  }

  const turn = {
    id: turnId,
    items: [],
    itemsView: "full",
    status: "running",
    error: null,
    startedAt: Date.now() / 1000,
    completedAt: null,
    durationMs: null
  };

  mergeTurns(entry, [turn]);
  return turn;
}

/**
 * Appends streamed text to a live item field inside one turn.
 *
 * @param entry Thread cache entry.
 * @param turnId Turn identifier.
 * @param itemId Item identifier.
 * @param fallbackItem Item to create when missing.
 * @param field Text field to append.
 * @param delta Text delta.
 * @returns Recorded mutation, or `null` when the item cannot be found.
 */
function appendItemTextDelta(
  entry: ThreadTurnCacheEntry,
  turnId: string,
  itemId: string,
  fallbackItem: Record<string, unknown>,
  field: string,
  delta: string
): RecordedTurnMutation | null {
  const liveItem = ensureLiveTurnItem(entry, turnId, itemId, fallbackItem);

  if (liveItem === null) {
    return null;
  }

  bufferLiveTextDelta(entry, turnId, itemId, field, "text", delta);
  return { entry, turn: liveItem.turn };
}

/**
 * Returns an indexed live item, creating its fallback record when absent.
 *
 * @param entry Thread cache entry.
 * @param turnId Turn identifier.
 * @param itemId Item identifier.
 * @param fallbackItem Item created when the live item is not known yet.
 * @returns Indexed item and owning turn, or `null` when creation failed.
 */
function ensureLiveTurnItem(
  entry: ThreadTurnCacheEntry,
  turnId: string,
  itemId: string,
  fallbackItem: Record<string, unknown>
): { turn: Record<string, unknown>; item: Record<string, unknown> } | null {
  const turn = ensureTurn(entry, turnId);
  const itemsById = getOrCreateTurnItemIndex(entry, turnId, turn);
  const existingItem = itemsById.get(itemId);

  if (existingItem !== undefined) {
    return { turn, item: existingItem };
  }

  const recorded = recordLiveItemInTurn(entry, turnId, fallbackItem);
  const item = itemsById.get(itemId);

  if (item === undefined) {
    return null;
  }

  return { turn: readObject(recorded.turn), item };
}

/**
 * Returns the direct item index for one live turn, building it on demand.
 *
 * @param entry Thread cache entry.
 * @param turnId Turn identifier.
 * @param turn Raw live turn.
 * @returns Direct item lookup map.
 */
function getOrCreateTurnItemIndex(
  entry: ThreadTurnCacheEntry,
  turnId: string,
  turn: Record<string, unknown>
): Map<string, Record<string, unknown>> {
  let itemsById = entry.turnItemsById.get(turnId);

  if (itemsById === undefined) {
    itemsById = indexTurnItems(entry, turnId, turn);
  }

  return itemsById;
}

/**
 * Rebuilds direct item lookups after a defensive full-turn merge.
 *
 * @param entry Thread cache entry.
 * @param turnId Turn identifier.
 * @param turn Raw merged turn.
 * @returns Rebuilt item lookup map.
 */
function indexTurnItems(
  entry: ThreadTurnCacheEntry,
  turnId: string,
  turn: unknown
): Map<string, Record<string, unknown>> {
  const itemsById = new Map<string, Record<string, unknown>>();
  const items = readTurnItems(readObject(turn));

  for (const itemValue of items) {
    const item = readObject(itemValue);
    const itemId = readTurnItemKey(item);

    if (itemId.length > 0) {
      itemsById.set(itemId, item);
    }
  }

  entry.turnItemsById.set(turnId, itemsById);
  return itemsById;
}

/**
 * Reads the mutable item list owned by a live cached turn.
 *
 * @param turn Raw live turn record.
 * @returns Existing mutable items, or a newly attached empty array.
 */
function readMutableTurnItems(turn: Record<string, unknown>): unknown[] {
  if (Array.isArray(turn.items)) {
    return turn.items;
  }

  const items: unknown[] = [];
  turn.items = items;
  return items;
}
