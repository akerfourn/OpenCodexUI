/**
 * Buffers streamed live-turn text until a cache consistency boundary.
 */
import { readObject, readString } from "./mapping.js";
import type { ThreadTurnCacheEntry } from "./ThreadTurnCache.js";

/** Pending chunks for one scalar or segmented item field. */
export interface LiveTextBuffer {
  mode: "array" | "text";
  chunks: string[];
}

/** Pending text grouped by item and field inside one turn. */
export type LiveTurnTextBuffers = Map<string, Map<string, LiveTextBuffer>>;

/**
 * Adds a fragment without rebuilding the complete cached string.
 *
 * @param entry Thread cache entry.
 * @param turnId Turn identifier.
 * @param itemId Item identifier.
 * @param field Item field receiving the fragment.
 * @param mode Scalar or segmented text representation.
 * @param delta Text fragment.
 */
export function bufferLiveTextDelta(
  entry: ThreadTurnCacheEntry,
  turnId: string,
  itemId: string,
  field: string,
  mode: LiveTextBuffer["mode"],
  delta: string
): void {
  let turnBuffers = entry.liveTextBuffers.get(turnId);

  if (turnBuffers === undefined) {
    turnBuffers = new Map();
    entry.liveTextBuffers.set(turnId, turnBuffers);
  }

  let itemBuffers = turnBuffers.get(itemId);

  if (itemBuffers === undefined) {
    itemBuffers = new Map();
    turnBuffers.set(itemId, itemBuffers);
  }

  const existing = itemBuffers.get(field);

  if (existing !== undefined && existing.mode === mode) {
    existing.chunks.push(delta);
    return;
  }

  if (existing !== undefined) {
    materializeLiveItemText(entry, turnId, itemId);
    bufferLiveTextDelta(entry, turnId, itemId, field, mode, delta);
    return;
  }

  itemBuffers.set(field, { mode, chunks: [delta] });
}

/**
 * Materializes pending fields for one live item.
 *
 * @param entry Thread cache entry.
 * @param turnId Turn identifier.
 * @param itemId Item identifier.
 */
export function materializeLiveItemText(
  entry: ThreadTurnCacheEntry,
  turnId: string,
  itemId: string
): void {
  const turnBuffers = entry.liveTextBuffers.get(turnId);
  const itemBuffers = turnBuffers?.get(itemId);

  if (turnBuffers === undefined || itemBuffers === undefined) {
    return;
  }

  const item = findLiveItem(entry, turnId, itemId);

  if (item === null) {
    return;
  }

  for (const [field, buffer] of itemBuffers) {
    const delta = buffer.chunks.join("");

    if (buffer.mode === "array") {
      appendArrayText(item, field, delta);
    } else {
      item[field] = `${readString(item[field])}${delta}`;
    }
  }

  turnBuffers.delete(itemId);

  if (turnBuffers.size === 0) {
    entry.liveTextBuffers.delete(turnId);
  }
}

/**
 * Materializes every pending item owned by one turn.
 *
 * @param entry Thread cache entry.
 * @param turnId Turn identifier.
 */
export function materializeLiveTurnText(
  entry: ThreadTurnCacheEntry,
  turnId: string
): void {
  const turnBuffers = entry.liveTextBuffers.get(turnId);

  if (turnBuffers === undefined) {
    return;
  }

  for (const itemId of Array.from(turnBuffers.keys())) {
    materializeLiveItemText(entry, turnId, itemId);
  }
}

/**
 * Materializes all pending text in a cache entry.
 *
 * @param entry Thread cache entry.
 */
export function materializeAllLiveText(entry: ThreadTurnCacheEntry): void {
  for (const turnId of Array.from(entry.liveTextBuffers.keys())) {
    materializeLiveTurnText(entry, turnId);
  }
}

/**
 * Finds an indexed item and repairs the lookup lazily when necessary.
 *
 * @param entry Thread cache entry.
 * @param turnId Turn identifier.
 * @param itemId Item identifier.
 * @returns Mutable item record, or `null` when unavailable.
 */
function findLiveItem(
  entry: ThreadTurnCacheEntry,
  turnId: string,
  itemId: string
): Record<string, unknown> | null {
  const indexedItem = entry.turnItemsById.get(turnId)?.get(itemId);

  if (indexedItem !== undefined) {
    return indexedItem;
  }

  const turn = readObject(entry.turnsById.get(turnId));
  const items = Array.isArray(turn.items) ? turn.items : [];
  const item = items
    .map((itemValue) => readObject(itemValue))
    .find((itemValue) => readItemId(itemValue) === itemId);

  if (item === undefined) {
    return null;
  }

  let itemsById = entry.turnItemsById.get(turnId);

  if (itemsById === undefined) {
    itemsById = new Map();
    entry.turnItemsById.set(turnId, itemsById);
  }

  itemsById.set(itemId, item);
  return item;
}

/**
 * Appends text to the final segment of an array-backed field.
 *
 * @param item Mutable item record.
 * @param field Segmented field name.
 * @param delta Combined buffered text.
 */
function appendArrayText(item: Record<string, unknown>, field: string, delta: string): void {
  const segments = Array.isArray(item[field]) ? item[field] : [];
  const lastSegment = segments.at(-1);

  if (typeof lastSegment === "string") {
    segments[segments.length - 1] = `${lastSegment}${delta}`;
  } else {
    segments.push(delta);
  }

  item[field] = segments;
}

/**
 * Reads the stable raw item identifier used by live notifications.
 *
 * @param item Raw item record.
 * @returns Item or call identifier.
 */
function readItemId(item: Record<string, unknown>): string {
  return readString(item.id) || readString(item.call_id);
}
