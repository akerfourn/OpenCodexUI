/**
 * SQLite operations for token usage history and turn execution metadata.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedThreadTokenUsage,
  CachedThreadTokenUsageSnapshot,
  CachedThreadTokenUsageSnapshotQuery,
  CachedSourceTokenUsageSnapshotQuery,
  CachedTurnExecutionMetadata
} from "../../types.js";

/**
 * Inserts one immutable token usage snapshot when its values changed.
 * Repeated values for the same source, thread, and turn are ignored.
 *
 * @param database SQLite database connection.
 * @param snapshot Snapshot to persist.
 *
 * @returns Nothing.
 */
export function insertTokenUsageSnapshot(
  database: BetterSqliteDatabase,
  snapshot: CachedThreadTokenUsageSnapshot
): void {
  const latestSnapshot = database
    .prepare(
      `
      SELECT
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
      FROM thread_token_usage_snapshots
      WHERE source_id = @sourceId
        AND thread_id = @threadId
        AND turn_id = @turnId
      ORDER BY observed_at DESC, id DESC
      LIMIT 1
      `
    )
    .get({
      sourceId: snapshot.sourceId,
      threadId: snapshot.threadId,
      turnId: snapshot.turnId
    }) as Record<string, unknown> | undefined;

  if (latestSnapshot !== undefined && hasSameSnapshotValues(latestSnapshot, snapshot)) {
    return;
  }

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
 * Saves the latest usage and appends its distinct history snapshot atomically.
 *
 * Duplicate snapshots skip both the latest-value update and the history insert.
 *
 * @param database SQLite database connection.
 * @param usage Latest usage values for the thread.
 * @param snapshot Immutable history snapshot.
 * @returns Nothing.
 */
export function saveThreadTokenUsageAndSnapshot(
  database: BetterSqliteDatabase,
  usage: CachedThreadTokenUsage,
  snapshot: CachedThreadTokenUsageSnapshot
): void {
  const persist = database.transaction(() => {
    const sourceId = snapshot.sourceId;
    const tokenUsageJson = JSON.stringify(usage);
    const currentThread = database
      .prepare(
        `
        SELECT token_usage_json
        FROM threads
        WHERE id = @threadId
          AND source_id = @sourceId
        `
      )
      .get({ threadId: usage.threadId, sourceId }) as { token_usage_json?: unknown } | undefined;

    if (currentThread?.token_usage_json !== tokenUsageJson) {
      database
        .prepare(
          `
          UPDATE threads SET
            token_usage_json = @tokenUsageJson
          WHERE id = @threadId
            AND source_id = @sourceId
          `
        )
        .run({
          threadId: usage.threadId,
          sourceId,
          tokenUsageJson
        });
    }

    insertTokenUsageSnapshot(database, snapshot);
  });

  persist();
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
 * Reads source-wide token usage snapshots and one baseline before the period
 * for every thread.
 *
 * @param database SQLite database connection.
 * @param query Source-wide snapshot query.
 * @returns Baselines and in-range snapshots ordered by observation time.
 */
export function listSourceTokenUsageSnapshots(
  database: BetterSqliteDatabase,
  query: CachedSourceTokenUsageSnapshotQuery
): CachedThreadTokenUsageSnapshot[] {
  const rows = database
    .prepare(
      `
      WITH baselines AS (
        SELECT current_snapshot.*
        FROM thread_token_usage_snapshots AS current_snapshot
        WHERE current_snapshot.source_id = @sourceId
          AND current_snapshot.observed_at < @fromObservedAt
          AND NOT EXISTS (
            SELECT 1
            FROM thread_token_usage_snapshots AS newer_snapshot
            WHERE newer_snapshot.source_id = current_snapshot.source_id
              AND newer_snapshot.thread_id = current_snapshot.thread_id
              AND newer_snapshot.observed_at < @fromObservedAt
              AND (
                newer_snapshot.observed_at > current_snapshot.observed_at
                OR (
                  newer_snapshot.observed_at = current_snapshot.observed_at
                  AND newer_snapshot.id > current_snapshot.id
                )
              )
          )
      )
      SELECT *
      FROM (
        SELECT *
        FROM thread_token_usage_snapshots
        WHERE source_id = @sourceId
          AND observed_at >= @fromObservedAt
          AND observed_at < @toObservedAt

        UNION ALL

        SELECT *
        FROM baselines
      )
      ORDER BY observed_at ASC, id ASC
      LIMIT @limit
      `
    )
    .all({
      sourceId: query.sourceId,
      fromObservedAt: query.fromObservedAt,
      toObservedAt: query.toObservedAt,
      limit: normalizeSourceSnapshotLimit(query.limit)
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
 * Checks whether a stored row contains the same usage values as a snapshot.
 *
 * Observation time is deliberately excluded so repeated identical reports do
 * not create unbounded history rows.
 *
 * @param row Stored SQLite values.
 * @param snapshot Incoming usage snapshot.
 * @returns Whether both snapshots carry the same usage data.
 */
function hasSameSnapshotValues(
  row: Record<string, unknown>,
  snapshot: CachedThreadTokenUsageSnapshot
): boolean {
  return readNumber(row.total_total_tokens) === snapshot.total.totalTokens &&
    readNumber(row.total_input_tokens) === snapshot.total.inputTokens &&
    readNumber(row.total_cached_input_tokens) === snapshot.total.cachedInputTokens &&
    readNumber(row.total_output_tokens) === snapshot.total.outputTokens &&
    readNumber(row.total_reasoning_output_tokens) === snapshot.total.reasoningOutputTokens &&
    readNumber(row.last_total_tokens) === snapshot.last.totalTokens &&
    readNumber(row.last_input_tokens) === snapshot.last.inputTokens &&
    readNumber(row.last_cached_input_tokens) === snapshot.last.cachedInputTokens &&
    readNumber(row.last_output_tokens) === snapshot.last.outputTokens &&
    readNumber(row.last_reasoning_output_tokens) === snapshot.last.reasoningOutputTokens &&
    readNullableNumber(row.model_context_window) === snapshot.modelContextWindow &&
    readNullableString(row.model) === snapshot.model &&
    readNullableString(row.reasoning_effort) === snapshot.reasoningEffort &&
    readNullableString(row.service_tier) === snapshot.serviceTier;
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

/**
 * Normalizes the maximum number of source-wide snapshots returned by SQLite.
 *
 * @param limit Requested limit.
 * @returns Positive bounded limit.
 */
function normalizeSourceSnapshotLimit(limit: number | null | undefined): number {
  if (limit === undefined || limit === null || !Number.isFinite(limit) || limit <= 0) {
    return 200_000;
  }

  return Math.min(Math.floor(limit), 200_000);
}
