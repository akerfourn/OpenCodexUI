/**
 * Provides pure value helpers for merging raw Codex turn data.
 */
import { readMessagePhase, readNullableNumber, readObject, readString } from "./mapping.js";

/**
 * Merges an incoming turn while preserving richer cached item details.
 *
 * @param existingTurn Previously cached turn.
 * @param incomingTurn Fresh turn from Codex.
 * @returns Merged raw turn.
 */
export function mergeTurnPreservingExistingItems(existingTurn: unknown, incomingTurn: unknown): unknown {
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
export function mergeTurnItemsPreservingExistingDetails(
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
export function mergeRecordPreservingExistingDetails(
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
export function preserveExistingItemIdentity(
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
 * Reads the stable raw item key used by Codex.
 *
 * @param item Raw turn item.
 * @returns Item id or call id.
 */
export function readTurnItemKey(item: Record<string, unknown>): string {
  return readString(item.id) || readString(item.call_id);
}

/**
 * Reads a semantic key for matching items whose ids changed between sources.
 *
 * @param item Raw turn item.
 * @returns Semantic key, or an empty string when unsupported.
 */
export function readTurnItemSemanticKey(item: Record<string, unknown>): string {
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
export function readUserMessageText(item: Record<string, unknown>): string {
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
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Reads a mutable copy of a turn item list.
 *
 * @param turn Raw turn record.
 * @returns Turn items, or an empty array.
 */
export function readTurnItems(turn: Record<string, unknown>): unknown[] {
  return Array.isArray(turn.items) ? [...turn.items] : [];
}

/**
 * Checks whether an incoming value should not overwrite existing data.
 *
 * @param value Incoming field value.
 * @returns Whether the value is semantically empty.
 */
export function isEmptyIncomingValue(value: unknown): boolean {
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
export function compareTurns(left: unknown, right: unknown, leftId: string, rightId: string): number {
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
export function readTurnTime(turn: unknown): number | null {
  const value = readObject(turn);
  return readTimestampValue(value.startedAt) ?? readTimestampValue(value.completedAt);
}

/**
 * Reads either a numeric or ISO timestamp as milliseconds.
 *
 * @param value Raw timestamp value.
 * @returns Timestamp in milliseconds, or `null`.
 */
export function readTimestampValue(value: unknown): number | null {
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
