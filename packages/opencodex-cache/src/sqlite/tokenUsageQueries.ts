/**
 * SQLite operations for token usage history and turn execution metadata.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedThreadTokenUsageSnapshot,
  CachedThreadTokenUsageSnapshotQuery,
  CachedTurnExecutionMetadata
} from "../types.js";

/**
 * Appends one immutable token usage snapshot.
 *
 * @param database SQLite database connection.
 * @param snapshot Snapshot to persist.
 * @returns Nothing.
 */
export function insertTokenUsageSnapshot(
  database: BetterSqliteDatabase,
  snapshot: CachedThreadTokenUsageSnapshot
): void {
  database
    .prepare(
      `
      INSERT INTO thread_token_usage_snapshots (
        source_id,
        thread_id,
        turn_id,
        observed_at,
        total_total_tokens,
        total_input_tokens,
        total_cached_input_tokens,
        total_output_tokens,
        total_reasoning_output_tokens,
        last_total_tokens,
        last_input_tokens,
        last_cached_input_tokens,
        last_output_tokens,
        last_reasoning_output_tokens,
        model_context_window,
        model,
        reasoning_effort,
        service_tier
      )
      VALUES (
        @sourceId,
        @threadId,
        @turnId,
        @observedAt,
        @totalTotalTokens,
        @totalInputTokens,
        @totalCachedInputTokens,
        @totalOutputTokens,
        @totalReasoningOutputTokens,
        @lastTotalTokens,
        @lastInputTokens,
        @lastCachedInputTokens,
        @lastOutputTokens,
        @lastReasoningOutputTokens,
        @modelContextWindow,
        @model,
        @reasoningEffort,
        @serviceTier
      )
      `
    )
    .run({
      sourceId: snapshot.sourceId,
      threadId: snapshot.threadId,
      turnId: snapshot.turnId,
      observedAt: snapshot.observedAt,
      totalTotalTokens: snapshot.total.totalTokens,
      totalInputTokens: snapshot.total.inputTokens,
      totalCachedInputTokens: snapshot.total.cachedInputTokens,
      totalOutputTokens: snapshot.total.outputTokens,
      totalReasoningOutputTokens: snapshot.total.reasoningOutputTokens,
      lastTotalTokens: snapshot.last.totalTokens,
      lastInputTokens: snapshot.last.inputTokens,
      lastCachedInputTokens: snapshot.last.cachedInputTokens,
      lastOutputTokens: snapshot.last.outputTokens,
      lastReasoningOutputTokens: snapshot.last.reasoningOutputTokens,
      modelContextWindow: snapshot.modelContextWindow,
      model: snapshot.model,
      reasoningEffort: snapshot.reasoningEffort,
      serviceTier: snapshot.serviceTier
    });
}

/**
 * Reads historical token usage snapshots for one thread.
 *
 * @param database SQLite database connection.
 * @param query Snapshot query.
 * @returns Snapshots ordered from oldest to newest.
 */
export function listTokenUsageSnapshots(
  database: BetterSqliteDatabase,
  query: CachedThreadTokenUsageSnapshotQuery
): CachedThreadTokenUsageSnapshot[] {
  const turnClause = query.turnId === undefined || query.turnId === null
    ? ""
    : " AND turn_id = @turnId";
  const limitClause = query.limit === undefined || query.limit === null || query.limit <= 0
    ? ""
    : " LIMIT @limit";
  const rows = database
    .prepare(
      `
      SELECT *
      FROM thread_token_usage_snapshots
      WHERE source_id = @sourceId
        AND thread_id = @threadId
        ${turnClause}
      ORDER BY observed_at ASC, id ASC
      ${limitClause}
      `
    )
    .all({
      sourceId: query.sourceId,
      threadId: query.threadId,
      ...(query.turnId === undefined || query.turnId === null ? {} : { turnId: query.turnId }),
      ...(query.limit === undefined || query.limit === null || query.limit <= 0
        ? {}
        : { limit: query.limit })
    }) as Array<Record<string, unknown>>;

  return rows.map(mapTokenUsageSnapshotRow);
}

/**
 * Upserts the latest known execution metadata for a turn.
 *
 * @param database SQLite database connection.
 * @param metadata Metadata to merge.
 * @returns Nothing.
 */
export function upsertTurnExecutionMetadata(
  database: BetterSqliteDatabase,
  metadata: CachedTurnExecutionMetadata
): void {
  database
    .prepare(
      `
      INSERT INTO turn_execution_metadata (
        source_id,
        thread_id,
        turn_id,
        requested_model,
        effective_model,
        requested_reasoning_effort,
        effective_reasoning_effort,
        service_tier,
        first_observed_at,
        updated_at
      )
      VALUES (
        @sourceId,
        @threadId,
        @turnId,
        @requestedModel,
        @effectiveModel,
        @requestedReasoningEffort,
        @effectiveReasoningEffort,
        @serviceTier,
        @firstObservedAt,
        @updatedAt
      )
      ON CONFLICT(source_id, thread_id, turn_id) DO UPDATE SET
        requested_model = COALESCE(excluded.requested_model, turn_execution_metadata.requested_model),
        effective_model = COALESCE(excluded.effective_model, turn_execution_metadata.effective_model),
        requested_reasoning_effort = COALESCE(
          excluded.requested_reasoning_effort,
          turn_execution_metadata.requested_reasoning_effort
        ),
        effective_reasoning_effort = COALESCE(
          excluded.effective_reasoning_effort,
          turn_execution_metadata.effective_reasoning_effort
        ),
        service_tier = COALESCE(excluded.service_tier, turn_execution_metadata.service_tier),
        first_observed_at = CASE
          WHEN excluded.first_observed_at < turn_execution_metadata.first_observed_at
            THEN excluded.first_observed_at
          ELSE turn_execution_metadata.first_observed_at
        END,
        updated_at = excluded.updated_at
      `
    )
    .run({
      sourceId: metadata.sourceId,
      threadId: metadata.threadId,
      turnId: metadata.turnId,
      requestedModel: metadata.requestedModel,
      effectiveModel: metadata.effectiveModel,
      requestedReasoningEffort: metadata.requestedReasoningEffort,
      effectiveReasoningEffort: metadata.effectiveReasoningEffort,
      serviceTier: metadata.serviceTier,
      firstObservedAt: metadata.firstObservedAt,
      updatedAt: metadata.updatedAt
    });
}

/**
 * Maps one SQLite snapshot row to the cache contract.
 *
 * @param row SQLite row.
 * @returns Snapshot DTO.
 */
function mapTokenUsageSnapshotRow(row: Record<string, unknown>): CachedThreadTokenUsageSnapshot {
  return {
    id: readNumber(row.id),
    sourceId: readString(row.source_id),
    threadId: readString(row.thread_id),
    turnId: readString(row.turn_id),
    observedAt: readString(row.observed_at),
    total: {
      totalTokens: readNumber(row.total_total_tokens),
      inputTokens: readNumber(row.total_input_tokens),
      cachedInputTokens: readNumber(row.total_cached_input_tokens),
      outputTokens: readNumber(row.total_output_tokens),
      reasoningOutputTokens: readNumber(row.total_reasoning_output_tokens)
    },
    last: {
      totalTokens: readNumber(row.last_total_tokens),
      inputTokens: readNumber(row.last_input_tokens),
      cachedInputTokens: readNumber(row.last_cached_input_tokens),
      outputTokens: readNumber(row.last_output_tokens),
      reasoningOutputTokens: readNumber(row.last_reasoning_output_tokens)
    },
    modelContextWindow: readNullableNumber(row.model_context_window),
    model: readNullableString(row.model),
    reasoningEffort: readNullableString(row.reasoning_effort),
    serviceTier: readNullableString(row.service_tier)
  };
}

/**
 * Reads a finite number from a SQLite value.
 *
 * @param value SQLite value.
 * @returns Number, or zero.
 */
function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Reads a nullable finite number from a SQLite value.
 *
 * @param value SQLite value.
 * @returns Number, or `null`.
 */
function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Reads a string from a SQLite value.
 *
 * @param value SQLite value.
 * @returns String, or an empty string.
 */
function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads an optional non-empty string from a SQLite value.
 *
 * @param value SQLite value.
 * @returns String, or `null`.
 */
function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
