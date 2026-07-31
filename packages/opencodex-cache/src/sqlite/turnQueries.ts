/**
 * Turn-related SQLite operations used by thread queries.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type { CachedThreadSyncState } from "../types.js";
import { upsertTurnExecutionMetadata } from "./tokenUsageQueries.js";
import type { TurnRow } from "./rowTypes.js";
import {
  normalizeTurn,
  readTurnExecutionSettings,
  readTurnMetadata,
  stringifyTurn
} from "./turnSerialization.js";

/**
 * Reads the latest cached turn rows for a thread.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 * @param limit Maximum number of latest turns, or `null` for all.
 *
 * @returns Turn rows sorted oldest to newest.
 */
export function readLatestTurnRows(
  database: BetterSqliteDatabase,
  threadId: string,
  limit: number | null
): TurnRow[] {
  if (limit === null || limit <= 0) {
    return database
      .prepare(
        `
        SELECT
          turns.id,
          turns.raw_json,
          metadata.requested_model AS execution_requested_model,
          metadata.effective_model AS execution_effective_model,
          metadata.requested_reasoning_effort AS execution_requested_reasoning_effort,
          metadata.effective_reasoning_effort AS execution_effective_reasoning_effort,
          metadata.service_tier AS execution_service_tier,
          metadata.first_observed_at AS execution_first_observed_at,
          metadata.updated_at AS execution_updated_at
        FROM turns
        LEFT JOIN threads ON threads.id = turns.thread_id
        LEFT JOIN turn_execution_metadata AS metadata
          ON metadata.source_id = threads.source_id
          AND metadata.thread_id = turns.thread_id
          AND metadata.turn_id = turns.id
        WHERE turns.thread_id = @threadId
        ORDER BY turns.started_at ASC, turns.completed_at ASC, turns.id ASC
        `
      )
      .all({ threadId }) as TurnRow[];
  }

  return database
    .prepare(
      `
      SELECT
        id,
        raw_json,
        execution_requested_model,
        execution_effective_model,
        execution_requested_reasoning_effort,
        execution_effective_reasoning_effort,
        execution_service_tier,
        execution_first_observed_at,
        execution_updated_at
      FROM (
        SELECT
          turns.id,
          turns.raw_json,
          turns.started_at,
          turns.completed_at,
          metadata.requested_model AS execution_requested_model,
          metadata.effective_model AS execution_effective_model,
          metadata.requested_reasoning_effort AS execution_requested_reasoning_effort,
          metadata.effective_reasoning_effort AS execution_effective_reasoning_effort,
          metadata.service_tier AS execution_service_tier,
          metadata.first_observed_at AS execution_first_observed_at,
          metadata.updated_at AS execution_updated_at
        FROM turns
        LEFT JOIN threads ON threads.id = turns.thread_id
        LEFT JOIN turn_execution_metadata AS metadata
          ON metadata.source_id = threads.source_id
          AND metadata.thread_id = turns.thread_id
          AND metadata.turn_id = turns.id
        WHERE turns.thread_id = @threadId
        ORDER BY turns.started_at DESC, turns.completed_at DESC, turns.id DESC
        LIMIT @limit
      )
      ORDER BY started_at ASC, completed_at ASC, id ASC
      `
    )
    .all({ threadId, limit }) as TurnRow[];
}

/**
 * Reads cached turn rows older than a given turn.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 * @param beforeTurnId Cursor turn identifier.
 * @param limit Maximum number of rows to read.
 *
 * @returns Turn rows sorted oldest to newest.
 */
export function readOlderTurnRows(
  database: BetterSqliteDatabase,
  threadId: string,
  beforeTurnId: string,
  limit: number
): TurnRow[] {
  return database
    .prepare(
      `
      SELECT
        id,
        raw_json,
        execution_requested_model,
        execution_effective_model,
        execution_requested_reasoning_effort,
        execution_effective_reasoning_effort,
        execution_service_tier,
        execution_first_observed_at,
        execution_updated_at
      FROM (
        SELECT
          turns.id,
          turns.raw_json,
          turns.started_at,
          turns.completed_at,
          metadata.requested_model AS execution_requested_model,
          metadata.effective_model AS execution_effective_model,
          metadata.requested_reasoning_effort AS execution_requested_reasoning_effort,
          metadata.effective_reasoning_effort AS execution_effective_reasoning_effort,
          metadata.service_tier AS execution_service_tier,
          metadata.first_observed_at AS execution_first_observed_at,
          metadata.updated_at AS execution_updated_at
        FROM turns
        LEFT JOIN threads ON threads.id = turns.thread_id
        LEFT JOIN turn_execution_metadata AS metadata
          ON metadata.source_id = threads.source_id
          AND metadata.thread_id = turns.thread_id
          AND metadata.turn_id = turns.id
        WHERE
          turns.thread_id = @threadId
          AND (
            turns.started_at < (
              SELECT started_at FROM turns WHERE thread_id = @threadId AND id = @beforeTurnId
            )
            OR (
              turns.started_at = (
                SELECT started_at FROM turns WHERE thread_id = @threadId AND id = @beforeTurnId
              )
              AND turns.id < @beforeTurnId
            )
          )
        ORDER BY turns.started_at DESC, turns.completed_at DESC, turns.id DESC
        LIMIT @limit
      )
      ORDER BY started_at ASC, completed_at ASC, id ASC
      `
    )
    .all({ threadId, beforeTurnId, limit }) as TurnRow[];
}

/**
 * Checks whether older cached turns exist before a turn.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 * @param beforeTurnId Cursor turn identifier.
 *
 * @returns `true` when more cached turns exist.
 */
export function hasMoreCachedTurnsBefore(
  database: BetterSqliteDatabase,
  threadId: string,
  beforeTurnId: string | null
): boolean {
  if (beforeTurnId === null || beforeTurnId.length === 0) {
    return false;
  }

  const row = database
    .prepare(
      `
      SELECT 1
      FROM turns
      WHERE
        thread_id = @threadId
        AND (
          started_at < (SELECT started_at FROM turns WHERE thread_id = @threadId AND id = @beforeTurnId)
          OR (
            started_at = (SELECT started_at FROM turns WHERE thread_id = @threadId AND id = @beforeTurnId)
            AND id < @beforeTurnId
          )
        )
      LIMIT 1
      `
    )
    .get({ threadId, beforeTurnId });

  return row !== undefined;
}

/**
 * Inserts or updates raw turn payloads for a thread.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 * @param turns Raw turn payloads.
 *
 * @returns Nothing.
 */
export function writeTurns(
  database: BetterSqliteDatabase,
  threadId: string,
  turns: unknown[]
): void {
  const upsertTurn = database.prepare(
    `
    INSERT INTO turns (
      thread_id,
      id,
      status,
      started_at,
      completed_at,
      duration_ms,
      item_count,
      raw_json,
      updated_at
    )
    VALUES (
      @threadId,
      @id,
      @status,
      @startedAt,
      @completedAt,
      @durationMs,
      @itemCount,
      @rawJson,
      @updatedAt
    )
    ON CONFLICT(thread_id, id) DO UPDATE SET
      status = excluded.status,
      started_at = excluded.started_at,
      completed_at = excluded.completed_at,
      duration_ms = excluded.duration_ms,
      item_count = excluded.item_count,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
    `
  );
  const updatedAt = new Date().toISOString();
  const sourceRow = database
    .prepare("SELECT source_id FROM threads WHERE id = @threadId")
    .get({ threadId }) as { source_id: string | null } | undefined;
  const sourceId = sourceRow?.source_id ?? null;

  for (const turn of turns) {
    const normalizedTurn = normalizeTurn(turn) ?? turn;
    const metadata = readTurnMetadata(normalizedTurn);

    if (metadata.id.length === 0) {
      continue;
    }

    upsertTurn.run({
      threadId,
      ...metadata,
      rawJson: stringifyTurn(normalizedTurn),
      updatedAt
    });

    const execution = readTurnExecutionSettings(normalizedTurn);

    if (sourceId !== null && execution !== null) {
      upsertTurnExecutionMetadata(database, {
        sourceId,
        threadId,
        turnId: metadata.id,
        ...execution,
        firstObservedAt: metadata.startedAt ?? updatedAt,
        updatedAt
      });
    }
  }

  const latestTurn = database
    .prepare(
      `
      SELECT MAX(COALESCE(completed_at, started_at)) AS latest_at
      FROM turns
      WHERE thread_id = @threadId
      `
    )
    .get({ threadId }) as { latest_at: string | null };

  if (latestTurn.latest_at !== null) {
    database
      .prepare(
        `
        UPDATE threads
        SET updated_at = CASE
          WHEN updated_at IS NULL OR updated_at < @latestAt THEN @latestAt
          ELSE updated_at
        END
        WHERE id = @threadId
        `
      )
      .run({ threadId, latestAt: latestTurn.latest_at });
  }
}

/**
 * Persists thread synchronization state.
 *
 * @param database SQLite database connection.
 * @param syncState Sync state to write.
 *
 * @returns Nothing.
 */
export function writeSyncState(
  database: BetterSqliteDatabase,
  syncState: CachedThreadSyncState
): void {
  database
    .prepare(
      `
      UPDATE threads SET
        newest_turn_id = @newestTurnId,
        oldest_turn_id = @oldestTurnId,
        older_cursor = @olderCursor,
        has_loaded_latest = @hasLoadedLatest,
        has_loaded_all_older_turns = @hasLoadedAllOlderTurns,
        last_synced_at = @lastSyncedAt
      WHERE id = @threadId
      `
    )
    .run({
      threadId: syncState.threadId,
      newestTurnId: syncState.newestTurnId,
      oldestTurnId: syncState.oldestTurnId,
      olderCursor: syncState.olderCursor,
      hasLoadedLatest: syncState.hasLoadedLatest ? 1 : 0,
      hasLoadedAllOlderTurns: syncState.hasLoadedAllOlderTurns ? 1 : 0,
      lastSyncedAt: syncState.lastSyncedAt
    });
}

/**
 * Creates a cache cursor for older-turn pagination.
 *
 * @param turnId Turn identifier.
 *
 * @returns Cache cursor.
 */
export function createCacheOlderCursor(turnId: string): string {
  return `cache:${turnId}`;
}
