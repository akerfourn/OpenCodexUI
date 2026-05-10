/**
 * Parses and serializes raw turn payloads stored in SQLite.
 */
import type { TurnRow } from "./rowTypes.js";

/**
 * Parses serialized turn rows and drops rows that no longer contain valid JSON.
 *
 * @param rows Turn rows read from SQLite.
 * @returns Parsed raw turn payloads.
 */
export function parseTurnRows(rows: TurnRow[]): unknown[] {
  return rows
    .map((row) => parseTurn(row.raw_json))
    .filter((turn): turn is unknown => turn !== null);
}

/**
 * Extracts the persisted turn metadata used for sorting and indexing.
 *
 * @param turn Raw turn payload read from the backend.
 * @returns Serializable turn metadata for the cache tables.
 */
export function readTurnMetadata(turn: unknown): {
  id: string;
  status: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  itemCount: number;
} {
  const value = readObject(turn);
  const items = Array.isArray(value.items) ? value.items : [];

  return {
    id: readString(value.id),
    status: readNullableString(value.status),
    startedAt: readNullableString(value.startedAt),
    completedAt: readNullableString(value.completedAt),
    durationMs: readNullableNumber(value.durationMs),
    itemCount: items.length
  };
}

/**
 * Parses a serialized turn payload from SQLite.
 *
 * @param value Serialized JSON turn payload.
 * @returns Parsed turn object, or `null` when parsing fails.
 */
function parseTurn(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Reads a plain object from an unknown JSON value.
 *
 * @param value Unknown value to normalize.
 * @returns Plain object, or an empty object when the value is not an object.
 */
function readObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

/**
 * Reads a string from an unknown value.
 *
 * @param value Unknown value to normalize.
 * @returns String value, or an empty string when the value is not a string.
 */
function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads a non-empty string from an unknown value.
 *
 * @param value Unknown value to normalize.
 * @returns Non-empty string value, or `null` when unavailable.
 */
function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads a finite number from an unknown value.
 *
 * @param value Unknown value to normalize.
 * @returns Finite number value, or `null` when unavailable.
 */
function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

