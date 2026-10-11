/**
 * SQLite persistence for source-scoped turn execution metadata.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type { CachedTurnExecutionMetadata } from "../../types.js";

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
