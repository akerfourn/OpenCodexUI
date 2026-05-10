/**
 * Small normalization helpers for Codex payload mapping.
 */
import type { OpenCodexMessagePhase } from "@open-codex-ui/opencodex-protocol";

/**
 * Reads a plain object from an unknown value.
 *
 * @param value Value to normalize.
 *
 * @returns Object value, or an empty object.
 */
export function readObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

/**
 * Reads a string from an unknown value.
 *
 * @param value Value to normalize.
 *
 * @returns String value, or an empty string.
 */
export function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads a finite number from an unknown value.
 *
 * @param value Value to normalize.
 *
 * @returns Number value, or `null`.
 */
export function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Reads a supported assistant message phase.
 *
 * @param value Value to normalize.
 *
 * @returns Message phase, or `null`.
 */
export function readMessagePhase(value: unknown): OpenCodexMessagePhase | null {
  const phase = readString(value);

  if (phase === "commentary" || phase === "final_answer") {
    return phase;
  }

  return null;
}

/**
 * Reads a non-empty string from an unknown value.
 *
 * @param value Value to normalize.
 *
 * @returns String value, or `null`.
 */
export function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads a Unix timestamp as an ISO string.
 *
 * @param value Value to normalize.
 *
 * @returns ISO timestamp, or `null`.
 */
export function readTimestamp(value: unknown): string | null {
  if (typeof value !== "number") {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

/**
 * Creates a lightweight generated identifier.
 *
 * @param prefix Identifier prefix.
 *
 * @returns Generated identifier.
 */
export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
