/**
 * Merges raw Codex turns while preserving locally enriched live items.
 */
import { readMessagePhase, readNullableNumber, readObject, readString } from "./mapping.js";
import type { ThreadTurnCacheEntry } from "./ThreadTurnCache.js";

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

    const existingTurn = entry.turnsById.get(turnId);
    const nextTurn = existingTurn === undefined
      ? turn
      : mergeTurnPreservingExistingItems(existingTurn, turn);

    entry.turnsById.set(turnId, nextTurn);
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

  const items = readTurnItems(turn);
  const existingIndex = items.findIndex((entryItem) => readTurnItemKey(readObject(entryItem)) === itemId);

  if (existingIndex >= 0) {
    items[existingIndex] = mergeRecordPreservingExistingDetails(
      readObject(items[existingIndex]),
      item
    );
  } else {
    items.push(item);
  }

  turn.items = items;
  mergeTurns(entry, [turn]);
  return { entry, turn: entry.turnsById.get(turnId) ?? turn };
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

  const existing = recordLiveItemInTurn(entry, turnId, {
    type: "reasoning",
    id: itemId,
    summary: [],
    content: []
  });
  const turn = readObject(existing.turn);
  const items = readTurnItems(turn);
  const item = items
    .map((itemValue) => readObject(itemValue))
    .find((itemValue) => readTurnItemKey(itemValue) === itemId);

  if (item === undefined) {
    return null;
  }

  appendArrayText(item, field, delta);
  turn.items = items;
  mergeTurns(entry, [turn]);
  return { entry, turn: entry.turnsById.get(turnId) ?? turn };
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

function mergeTurnItemsPreservingExistingDetails(
  existingItems: unknown[],
  incomingItems: unknown[]
): unknown[] {
  const incomingByKey = new Map<string, Record<string, unknown>>();
  const consumedIncomingKeys = new Set<string>();

  for (const incomingItemValue of incomingItems) {
    const incomingItem = readObject(incomingItemValue);
    const key = readTurnItemKey(incomingItem);

    if (key.length > 0) {
      incomingByKey.set(key, incomingItem);
    }
  }

  const mergedItems = existingItems.map((existingItemValue) => {
    const existingItem = readObject(existingItemValue);
    const key = readTurnItemKey(existingItem);
    const incomingItem = incomingByKey.get(key);

    if (key.length === 0 || incomingItem === undefined) {
      return existingItemValue;
    }

    consumedIncomingKeys.add(key);
    return mergeRecordPreservingExistingDetails(existingItem, incomingItem);
  });

  for (const incomingItemValue of incomingItems) {
    const incomingItem = readObject(incomingItemValue);
    const key = readTurnItemKey(incomingItem);

    if (key.length === 0 || !consumedIncomingKeys.has(key)) {
      mergedItems.push(incomingItemValue);
    }
  }

  return mergedItems;
}

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

function appendItemTextDelta(
  entry: ThreadTurnCacheEntry,
  turnId: string,
  itemId: string,
  fallbackItem: Record<string, unknown>,
  field: string,
  delta: string
): RecordedTurnMutation | null {
  const existing = recordLiveItemInTurn(entry, turnId, fallbackItem);
  const turn = readObject(existing.turn);
  const items = readTurnItems(turn);
  const item = items
    .map((itemValue) => readObject(itemValue))
    .find((itemValue) => readTurnItemKey(itemValue) === itemId);

  if (item === undefined) {
    return null;
  }

  item[field] = `${readString(item[field])}${delta}`;
  turn.items = items;
  mergeTurns(entry, [turn]);
  return { entry, turn: entry.turnsById.get(turnId) ?? turn };
}

function appendArrayText(item: Record<string, unknown>, field: string, delta: string): void {
  const segments = Array.isArray(item[field]) ? [...item[field]] : [];
  const lastSegment = segments.at(-1);

  if (typeof lastSegment === "string") {
    segments[segments.length - 1] = `${lastSegment}${delta}`;
  } else {
    segments.push(delta);
  }

  item[field] = segments;
}

function readTurnItemKey(item: Record<string, unknown>): string {
  return readString(item.id) || readString(item.call_id);
}

function readTurnItems(turn: Record<string, unknown>): unknown[] {
  return Array.isArray(turn.items) ? [...turn.items] : [];
}

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
  return readTimestampValue(value.startedAt) ?? readTimestampValue(value.completedAt);
}

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
