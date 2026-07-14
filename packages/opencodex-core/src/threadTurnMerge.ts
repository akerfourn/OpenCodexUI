/**
 * Merges raw Codex turns while preserving locally enriched live items.
 */
import { readMessagePhase, readNullableNumber, readObject, readString } from "./mapping.js";
import type { ThreadTurnCacheEntry } from "./ThreadTurnCache.js";
import {
  bufferLiveTextDelta,
  materializeLiveItemText,
  materializeLiveTurnText
} from "./liveTurnTextBuffer.js";

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
    const nextTurn = existingTurn === undefined
      ? turn
      : mergeTurnPreservingExistingItems(existingTurn, turn);

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
 * Merges an incoming turn while preserving richer cached item details.
 *
 * @param existingTurn Previously cached turn.
 * @param incomingTurn Fresh turn from Codex.
 * @returns Merged raw turn.
 */
function mergeTurnPreservingExistingItems(existingTurn: unknown, incomingTurn: unknown): unknown {
  const existing = readObject(existingTurn);
  const incoming = readObject(incomingTurn);
  const existingItems = readTurnItems(existing);
  const incomingItems = readTurnItems(incoming);
  const merged = mergeRecordPreservingExistingDetails(existing, incoming);

  if (existingItems.length === 0) {
    return { ...merged, items: incomingItems };
  }

  if (incomingItems.length === 0) {
    return { ...merged, items: existingItems };
  }

  return {
    ...merged,
    items: mergeTurnItemsPreservingExistingDetails(existingItems, incomingItems)
  };
}

/**
 * Merges turn item arrays by id and semantic identity.
 *
 * @param existingItems Cached turn items.
 * @param incomingItems Fresh turn items from Codex.
 * @returns Merged item list preserving cached-only details.
 */
function mergeTurnItemsPreservingExistingDetails(
  existingItems: unknown[],
  incomingItems: unknown[]
): unknown[] {
  const incomingByKey = new Map<string, Record<string, unknown>>();
  const incomingBySemanticKey = new Map<string, Record<string, unknown>>();
  const consumedIncomingKeys = new Set<string>();
  const consumedIncomingSemanticKeys = new Set<string>();

  for (const incomingItemValue of incomingItems) {
    const incomingItem = readObject(incomingItemValue);
    const key = readTurnItemKey(incomingItem);
    const semanticKey = readTurnItemSemanticKey(incomingItem);

    if (key.length > 0) {
      incomingByKey.set(key, incomingItem);
    }

    if (semanticKey.length > 0) {
      incomingBySemanticKey.set(semanticKey, incomingItem);
    }
  }

  const mergedItems = existingItems.map((existingItemValue) => {
    const existingItem = readObject(existingItemValue);
    const key = readTurnItemKey(existingItem);
    const semanticKey = readTurnItemSemanticKey(existingItem);
    const incomingItem = key.length > 0
      ? incomingByKey.get(key)
      : undefined;
    const semanticIncomingItem = incomingItem ?? (
      semanticKey.length > 0 ? incomingBySemanticKey.get(semanticKey) : undefined
    );
    const isSemanticOnlyMatch = incomingItem === undefined && semanticIncomingItem !== undefined;

    if (semanticIncomingItem === undefined) {
      return existingItemValue;
    }

    if (key.length > 0) {
      consumedIncomingKeys.add(key);
    }

    if (semanticKey.length > 0) {
      consumedIncomingSemanticKeys.add(semanticKey);
    }

    const mergedItem = mergeRecordPreservingExistingDetails(existingItem, semanticIncomingItem);

    if (isSemanticOnlyMatch) {
      return preserveExistingItemIdentity(mergedItem, existingItem);
    }

    return mergedItem;
  });

  for (const incomingItemValue of incomingItems) {
    const incomingItem = readObject(incomingItemValue);
    const key = readTurnItemKey(incomingItem);
    const semanticKey = readTurnItemSemanticKey(incomingItem);
    const wasConsumedByKey = key.length > 0 && consumedIncomingKeys.has(key);
    const wasConsumedBySemanticKey = (
      semanticKey.length > 0 &&
      consumedIncomingSemanticKeys.has(semanticKey)
    );

    if (!wasConsumedByKey && !wasConsumedBySemanticKey) {
      mergedItems.push(incomingItemValue);
    }
  }

  return mergedItems;
}

/**
 * Merges records without replacing meaningful values by empty incoming fields.
 *
 * @param existing Existing record.
 * @param incoming Incoming record.
 * @returns Merged record.
 */
function mergeRecordPreservingExistingDetails(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing, ...incoming };

  for (const [key, existingValue] of Object.entries(existing)) {
    const incomingValue = incoming[key];

    if (isEmptyIncomingValue(incomingValue) && !isEmptyIncomingValue(existingValue)) {
      merged[key] = existingValue;
    }
  }

  return merged;
}

/**
 * Reuses an existing item id when a semantic-only match was merged.
 *
 * @param item Merged incoming item.
 * @param existingItem Existing cached item.
 * @returns Item with stable cached identity.
 */
function preserveExistingItemIdentity(
  item: Record<string, unknown>,
  existingItem: Record<string, unknown>
): Record<string, unknown> {
  const existingId = readString(existingItem.id);
  const existingCallId = readString(existingItem.call_id);
  const nextItem = { ...item };

  if (existingId.length > 0) {
    nextItem.id = existingId;
  }

  if (existingCallId.length > 0) {
    nextItem.call_id = existingCallId;
  }

  return nextItem;
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
 * Reads the stable raw item key used by Codex.
 *
 * @param item Raw turn item.
 * @returns Item id or call id.
 */
function readTurnItemKey(item: Record<string, unknown>): string {
  return readString(item.id) || readString(item.call_id);
}

/**
 * Reads a semantic key for matching items whose ids changed between sources.
 *
 * @param item Raw turn item.
 * @returns Semantic key, or an empty string when unsupported.
 */
function readTurnItemSemanticKey(item: Record<string, unknown>): string {
  const type = readString(item.type);

  if (type === "userMessage") {
    return ["userMessage", readUserMessageText(item)].join(":");
  }

  if (type === "agentMessage") {
    return [
      "agentMessage",
      readMessagePhase(item.phase) ?? "none",
      normalizeText(readString(item.text))
    ].join(":");
  }

  return "";
}

/**
 * Reads normalized text from a user-message item.
 *
 * @param item Raw user-message item.
 * @returns Normalized user text.
 */
function readUserMessageText(item: Record<string, unknown>): string {
  const content = Array.isArray(item.content) ? item.content : [];
  return normalizeText(
    content
      .map((entry) => readObject(entry))
      .filter((entry) => readString(entry.type) === "text")
      .map((entry) => readString(entry.text))
      .join("\n\n")
  );
}

/**
 * Normalizes text for semantic comparison.
 *
 * @param value Raw text.
 * @returns Trimmed text with collapsed whitespace.
 */
function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Reads a mutable copy of a turn item list.
 *
 * @param turn Raw turn record.
 * @returns Turn items, or an empty array.
 */
function readTurnItems(turn: Record<string, unknown>): unknown[] {
  return Array.isArray(turn.items) ? [...turn.items] : [];
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

/**
 * Checks whether an incoming value should not overwrite existing data.
 *
 * @param value Incoming field value.
 * @returns Whether the value is semantically empty.
 */
function isEmptyIncomingValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === "string") {
    return value.length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

/**
 * Orders turns by available timestamps, then by id.
 *
 * @param left Left raw turn.
 * @param right Right raw turn.
 * @param leftId Left turn id.
 * @param rightId Right turn id.
 * @returns Sort order.
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
 * Reads the best timestamp for ordering one turn.
 *
 * @param turn Raw turn.
 * @returns Timestamp in milliseconds, or `null`.
 */
function readTurnTime(turn: unknown): number | null {
  const value = readObject(turn);
  return readTimestampValue(value.startedAt) ?? readTimestampValue(value.completedAt);
}

/**
 * Reads either a numeric or ISO timestamp as milliseconds.
 *
 * @param value Raw timestamp value.
 * @returns Timestamp in milliseconds, or `null`.
 */
function readTimestampValue(value: unknown): number | null {
  const numericValue = readNullableNumber(value);

  if (numericValue !== null) {
    return numericValue;
  }

  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const parsedValue = Date.parse(value);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}
