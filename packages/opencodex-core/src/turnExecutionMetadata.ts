/**
 * Handles OpenCodexUI-only execution metadata attached to cached raw turns.
 *
 * The metadata is kept outside Codex's persisted payload by the cache layer,
 * but is carried in memory alongside a raw turn so the existing turn mapping
 * can expose it without introducing a second transport lookup.
 */
import type { OpenCodexTurnExecutionMetadata } from "@open-codex-ui/opencodex-protocol";

export const TURN_EXECUTION_METADATA_KEY = "openCodexUiExecution";

/**
 * Reads execution metadata from an internally enriched raw turn.
 *
 * @param turn Raw or enriched turn value.
 * @returns Metadata, or `null` when unavailable.
 */
export function readTurnExecutionMetadata(turn: unknown): OpenCodexTurnExecutionMetadata | null {
  if (turn === null || typeof turn !== "object" || Array.isArray(turn)) {
    return null;
  }

  const value = turn as Record<string, unknown>;
  const metadata = value[TURN_EXECUTION_METADATA_KEY];

  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;

  return {
    requestedModel: readNullableString(record.requestedModel),
    effectiveModel: readNullableString(record.effectiveModel),
    requestedReasoningEffort: readNullableString(record.requestedReasoningEffort),
    effectiveReasoningEffort: readNullableString(record.effectiveReasoningEffort),
    serviceTier: readNullableString(record.serviceTier)
  };
}

/**
 * Attaches execution metadata to a raw turn for in-memory mapping.
 *
 * @param turn Raw turn value.
 * @param metadata Metadata to attach.
 * @returns Enriched turn value, or the original value when it is not an object.
 */
export function attachTurnExecutionMetadata(
  turn: unknown,
  metadata: OpenCodexTurnExecutionMetadata
): unknown {
  if (turn === null || typeof turn !== "object" || Array.isArray(turn)) {
    return turn;
  }

  return {
    ...(turn as Record<string, unknown>),
    [TURN_EXECUTION_METADATA_KEY]: metadata
  };
}

/**
 * Merges newly observed metadata without discarding known values.
 *
 * @param current Existing metadata.
 * @param next Newly observed metadata.
 * @returns Merged metadata.
 */
export function mergeTurnExecutionMetadata(
  current: OpenCodexTurnExecutionMetadata | null,
  next: OpenCodexTurnExecutionMetadata
): OpenCodexTurnExecutionMetadata {
  return {
    requestedModel: next.requestedModel ?? current?.requestedModel ?? null,
    effectiveModel: next.effectiveModel ?? current?.effectiveModel ?? null,
    requestedReasoningEffort:
      next.requestedReasoningEffort ?? current?.requestedReasoningEffort ?? null,
    effectiveReasoningEffort:
      next.effectiveReasoningEffort ?? current?.effectiveReasoningEffort ?? null,
    serviceTier: next.serviceTier ?? current?.serviceTier ?? null
  };
}

/**
 * Reads an optional non-empty string from an unknown value.
 *
 * @param value Unknown value.
 * @returns Non-empty string, or `null`.
 */
function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
