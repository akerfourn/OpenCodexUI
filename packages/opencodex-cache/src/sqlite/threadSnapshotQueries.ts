/**
 * Thread snapshot and turn-related SQLite operations.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedOlderTurnsQuery,
  CachedOlderTurnsResult,
  CachedThreadDelta,
  CachedThreadReadOptions,
  CachedThreadSnapshot,
  CachedThreadSyncState
} from "../types.js";
import {
  mapSyncState,
  mapThreadTokenUsage,
  mapThreadRow
} from "./mappers.js";
import { parseTurnRows } from "./turnSerialization.js";
import {
  createCacheOlderCursor,
  hasMoreCachedTurnsBefore,
  readLatestTurnRows,
  readOlderTurnRows,
  writeSyncState,
  writeTurns
} from "./turnQueries.js";
import { readThreadRow } from "./threadIndexQueries.js";
import { writeThreadIndex } from "./threadIndexWriter.js";

/**
 * Reads a cached thread snapshot with optional latest-turn limit.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 * @param options Read options.
 *
 * @returns Cached snapshot, or `null`.
 */
export async function getThread(
  database: BetterSqliteDatabase,
  threadId: string,
  options: CachedThreadReadOptions = {}
): Promise<CachedThreadSnapshot | null> {
  const threadRow = readThreadRow(database, threadId);

  if (threadRow === null) {
    return null;
  }

  const thread = mapThreadRow(threadRow);
  const turnRows = readLatestTurnRows(database, threadId, options.latestTurnLimit ?? null);
  const turns = parseTurnRows(turnRows);
  const syncState = mapSyncState(threadRow);
  const tokenUsage = mapThreadTokenUsage(threadRow);
  const hasMoreCachedTurns = hasMoreCachedTurnsBefore(database, threadId, turnRows[0]?.id ?? null);

  return {
    thread,
    turns,
    tokenUsage,
    syncState: {
      ...syncState,
      oldestTurnId: turnRows[0]?.id ?? syncState.oldestTurnId,
      hasLoadedAllOlderTurns: syncState.hasLoadedAllOlderTurns && !hasMoreCachedTurns,
      olderCursor: hasMoreCachedTurns
        ? createCacheOlderCursor(turnRows[0]?.id ?? "")
        : syncState.olderCursor
    }
  };
}

/**
 * Reads older cached turns for a thread.
 *
 * @param database SQLite database connection.
 * @param query Older-turn query.
 *
 * @returns Older turns and pagination state.
 */
export async function getOlderTurns(
  database: BetterSqliteDatabase,
  query: CachedOlderTurnsQuery
): Promise<CachedOlderTurnsResult> {
  const rows = readOlderTurnRows(database, query.threadId, query.beforeTurnId, query.limit);
  const turns = parseTurnRows(rows);
  const hasMoreOlderTurns = hasMoreCachedTurnsBefore(database, query.threadId, rows[0]?.id ?? null);

  return {
    turns,
    hasMoreOlderTurns
  };
}

/**
 * Saves a full thread snapshot transactionally.
 *
 * @param database SQLite database connection.
 * @param snapshot Thread snapshot.
 *
 * @returns Promise resolved when save completes.
 */
export async function saveThreadSnapshot(
  database: BetterSqliteDatabase,
  snapshot: CachedThreadSnapshot
): Promise<void> {
  const writeSnapshot = database.transaction(() => {
    writeThreadIndex(database, [snapshot.thread]);
    database.prepare("DELETE FROM turns WHERE thread_id = ?").run(snapshot.thread.id);
    writeTurns(database, snapshot.thread.id, snapshot.turns);
    writeSyncState(database, snapshot.syncState);
  });

  writeSnapshot();
}

/**
 * Saves an incremental thread turn delta.
 *
 * @param database SQLite database connection.
 * @param delta Thread delta.
 *
 * @returns Promise resolved when save completes.
 */
export async function saveThreadDelta(
  database: BetterSqliteDatabase,
  delta: CachedThreadDelta
): Promise<void> {
  const writeDelta = database.transaction(() => {
    writeTurns(database, delta.threadId, delta.turns);
    writeSyncState(database, delta.syncState);
  });

  writeDelta();
}

/**
 * Reads cached synchronization state for a thread.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 *
 * @returns Sync state, or `null`.
 */
export async function getSyncState(
  database: BetterSqliteDatabase,
  threadId: string
): Promise<CachedThreadSyncState | null> {
  const thread = readThreadRow(database, threadId);

  if (thread === null) {
    return null;
  }

  return mapSyncState(thread);
}
