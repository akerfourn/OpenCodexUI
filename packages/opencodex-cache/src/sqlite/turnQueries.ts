/**
 * Turn-related SQLite operations used by thread queries.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type { CachedThreadSyncState } from "../types.js";
import type { TurnRow } from "./rowTypes.js";
import { readTurnMetadata } from "./turnSerialization.js";

export function readLatestTurnRows(
  database: BetterSqliteDatabase,
  threadId: string,
  limit: number | null
): TurnRow[] {
  if (limit === null || limit <= 0) {
    return database
      .prepare(
        `
        SELECT id, raw_json
        FROM turns
        WHERE thread_id = @threadId
        ORDER BY started_at ASC, completed_at ASC, id ASC
        `
      )
      .all({ threadId }) as TurnRow[];
  }

  return database
    .prepare(
      `
      SELECT id, raw_json
      FROM (
        SELECT id, raw_json, started_at, completed_at
        FROM turns
        WHERE thread_id = @threadId
        ORDER BY started_at DESC, completed_at DESC, id DESC
        LIMIT @limit
      )
      ORDER BY started_at ASC, completed_at ASC, id ASC
      `
    )
    .all({ threadId, limit }) as TurnRow[];
}

export function readOlderTurnRows(
  database: BetterSqliteDatabase,
  threadId: string,
  beforeTurnId: string,
  limit: number
): TurnRow[] {
  return database
    .prepare(
      `
      SELECT id, raw_json
      FROM (
        SELECT id, raw_json, started_at, completed_at
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
        ORDER BY started_at DESC, completed_at DESC, id DESC
        LIMIT @limit
      )
      ORDER BY started_at ASC, completed_at ASC, id ASC
      `
    )
    .all({ threadId, beforeTurnId, limit }) as TurnRow[];
}

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

  for (const turn of turns) {
    const metadata = readTurnMetadata(turn);

    if (metadata.id.length === 0) {
      continue;
    }

    upsertTurn.run({
      threadId,
      ...metadata,
      rawJson: JSON.stringify(turn),
      updatedAt
    });
  }
}

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

export function createCacheOlderCursor(turnId: string): string {
  return `cache:${turnId}`;
}

