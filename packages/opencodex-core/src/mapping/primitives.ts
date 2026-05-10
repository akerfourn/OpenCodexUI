/**
 * Small normalization helpers for Codex payload mapping.
 */
import type { OpenCodexMessagePhase } from "@open-codex-ui/opencodex-protocol";

export function readObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readMessagePhase(value: unknown): OpenCodexMessagePhase | null {
  const phase = readString(value);

  if (phase === "commentary" || phase === "final_answer") {
    return phase;
  }

  return null;
}

export function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readTimestamp(value: unknown): string | null {
  if (typeof value !== "number") {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

