/**
 * Reads and writes application logs.
 */
import crypto from "node:crypto";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedLogCreateInput,
  CachedLogEntry,
  CachedLogListQuery,
  CachedLogPage
} from "../types.js";
import { mapLogRow } from "./mappers.js";
import type { LogRow } from "./rowTypes.js";

const DEFAULT_LOG_LIMIT = 30;
const MAX_LOG_LIMIT = 200;
let lastLogTimestampMs = 0;

/**
 * Creates a persisted application log entry.
 *
 * @param database SQLite database connection.
 * @param input Log payload.
 * @returns Created log entry.
 */
export async function createLog(
  database: BetterSqliteDatabase,
  input: CachedLogCreateInput
): Promise<CachedLogEntry> {
  const log = {
    id: crypto.randomUUID(),
    type: input.type,
    message: input.message,
    detailsJson: stringifyLogDetails(input.details),
    createdAt: createLogTimestamp()
  };

  database
    .prepare(`
      INSERT INTO logs (
        id,
        type,
        message,
        details_json,
        created_at
      )
      VALUES (
        @id,
        @type,
        @message,
        @detailsJson,
        @createdAt
      )
    `)
    .run(log);

  return {
    id: log.id,
    type: log.type,
    message: log.message,
    details: input.details ?? null,
    createdAt: log.createdAt
  };
}

/**
 * Lists application logs from newest to oldest.
 *
 * @param database SQLite database connection.
 * @param query Pagination query.
 * @returns Log page.
 */
export async function listLogs(
  database: BetterSqliteDatabase,
  query: CachedLogListQuery
): Promise<CachedLogPage> {
  const limit = normalizeLimit(query.limit);
  const rows = database
    .prepare(`
      SELECT
        id,
        type,
        message,
        details_json,
        created_at
      FROM logs
      WHERE @beforeCreatedAt IS NULL OR created_at < @beforeCreatedAt
      ORDER BY created_at DESC, id DESC
      LIMIT @limit
    `)
    .all({
      beforeCreatedAt: query.beforeCreatedAt ?? null,
      limit: limit + 1
    }) as LogRow[];
  const pageRows = rows.slice(0, limit);

  return {
    logs: pageRows.map(mapLogRow),
    hasMore: rows.length > limit
  };
}

/**
 * Deletes one application log entry.
 *
 * @param database SQLite database connection.
 * @param logId Log identifier.
 * @returns Nothing.
 */
export async function deleteLog(database: BetterSqliteDatabase, logId: string): Promise<void> {
  database.prepare("DELETE FROM logs WHERE id = @logId").run({ logId });
}

/**
 * Deletes all application log entries.
 *
 * @param database SQLite database connection.
 * @returns Nothing.
 */
export async function clearLogs(database: BetterSqliteDatabase): Promise<void> {
  database.prepare("DELETE FROM logs").run();
}

/**
 * Deletes application log entries older than a cutoff.
 *
 * @param database SQLite database connection.
 * @param createdBefore Exclusive timestamp cutoff.
 * @returns Nothing.
 */
export async function clearLogsOlderThan(
  database: BetterSqliteDatabase,
  createdBefore: string
): Promise<void> {
  database
    .prepare("DELETE FROM logs WHERE created_at < @createdBefore")
    .run({ createdBefore });
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LOG_LIMIT;
  }

  return Math.min(Math.floor(limit), MAX_LOG_LIMIT);
}

function stringifyLogDetails(details: unknown): string | null {
  if (details === undefined || details === null) {
    return null;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return JSON.stringify(String(details));
  }
}

function createLogTimestamp(): string {
  const now = Date.now();
  lastLogTimestampMs = now <= lastLogTimestampMs ? lastLogTimestampMs + 1 : now;
  return new Date(lastLogTimestampMs).toISOString();
}
