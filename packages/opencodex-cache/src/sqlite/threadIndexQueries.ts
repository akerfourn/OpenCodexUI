/**
 * Thread index and metadata-related SQLite operations.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { normalizeProjectPath } from "../projectIdentity.js";
import type {
  CachedThreadSummary,
  CachedThreadSyncState,
  ThreadListCacheQuery
} from "../types.js";
import {
  createEmptySyncState,
  mapSyncState,
  mapThreadRow
} from "./mappers.js";
import type { ThreadRow } from "./rowTypes.js";
import { writeThreadIndex } from "./threadIndexWriter.js";

/**
 * Inserts or updates thread metadata rows.
 *
 * @param database SQLite database connection.
 * @param threads Thread summaries to persist.
 *
 * @returns Promise resolved when the write completes.
 */
export async function upsertThreadIndex(
  database: BetterSqliteDatabase,
  threads: CachedThreadSummary[]
): Promise<void> {
  writeThreadIndex(database, threads);
}

/**
 * Updates the user-defined title for a thread.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 * @param title Custom title.
 *
 * @returns Promise resolved when the update completes.
 */
export async function updateThreadTitle(
  database: BetterSqliteDatabase,
  threadId: string,
  title: string
): Promise<void> {
  database
    .prepare(
      `
      UPDATE threads SET
        custom_title = @title,
        title = @title,
        updated_at = @updatedAt
      WHERE id = @threadId
      `
    )
    .run({
      threadId,
      title,
      updatedAt: new Date().toISOString()
    });
}

/**
 * Updates the archive marker for a cached thread.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 * @param isArchived Whether the thread is archived.
 *
 * @returns Promise resolved when the update completes.
 */
export async function updateThreadArchiveState(
  database: BetterSqliteDatabase,
  threadId: string,
  isArchived: boolean
): Promise<void> {
  database
    .prepare(
      `
      UPDATE threads SET
        is_archived = @isArchived,
        updated_at = @updatedAt
      WHERE id = @threadId
      `
    )
    .run({
      threadId,
      isArchived: isArchived ? 1 : 0,
      updatedAt: new Date().toISOString()
    });
}

/**
 * Updates the Codex-generated title for a thread.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 * @param title Codex title.
 *
 * @returns Promise resolved when the update completes.
 */
export async function updateThreadCodexTitle(
  database: BetterSqliteDatabase,
  threadId: string,
  title: string
): Promise<void> {
  database
    .prepare(
      `
      UPDATE threads SET
        codex_title = @title,
        title = CASE
          WHEN COALESCE(custom_title, '') <> '' THEN custom_title
          WHEN @title <> '' THEN @title
          ELSE COALESCE(preview, '')
        END,
        updated_at = @updatedAt
      WHERE id = @threadId
      `
    )
    .run({
      threadId,
      title,
      updatedAt: new Date().toISOString()
    });
}

/**
 * Deletes a cached thread and its dependent rows.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 *
 * @returns Promise resolved when deletion completes.
 */
export async function deleteThread(
  database: BetterSqliteDatabase,
  threadId: string
): Promise<void> {
  database.prepare("DELETE FROM threads WHERE id = ?").run(threadId);
}

/**
 * Deletes empty never-synced thread shells for one project.
 *
 * @param database SQLite database connection.
 * @param currentProjectPath Project path to clean.
 * @param sourceId Optional source identifier.
 * @returns Number of deleted thread rows.
 */
export async function deleteEmptyUnsyncedThreads(
  database: BetterSqliteDatabase,
  currentProjectPath: string,
  sourceId?: string | null
): Promise<number> {
  const projectPath = normalizeProjectPath(currentProjectPath);

  if (projectPath === null) {
    return 0;
  }

  const sourceClause = createSourceClause(sourceId);
  const result = database
    .prepare(
      `
      DELETE FROM threads
      WHERE
        cwd = @projectPath
        ${sourceClause.sql}
        AND COALESCE(title, '') = ''
        AND COALESCE(codex_title, '') = ''
        AND COALESCE(custom_title, '') = ''
        AND COALESCE(preview, '') = ''
        AND has_loaded_latest = 0
        AND last_synced_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM turns
          WHERE turns.thread_id = threads.id
        )
      `
    )
    .run({
      ...sourceClause.params,
      projectPath
    });

  return result.changes;
}

/**
 * Lists cached threads using scope, source, and search filters.
 *
 * @param database SQLite database connection.
 * @param query Thread list query.
 *
 * @returns Cached thread summaries.
 */
export async function listThreads(
  database: BetterSqliteDatabase,
  query: ThreadListCacheQuery
): Promise<CachedThreadSummary[]> {
  const clauses: string[] = [];
  const params: Record<string, string> = {};
  const currentProjectPath = normalizeProjectPath(query.currentProjectPath);
  const searchTerm = query.searchTerm?.trim() ?? "";

  if (query.scope === "currentProject" && currentProjectPath !== null) {
    clauses.push("threads.cwd = @currentProjectPath");
    params.currentProjectPath = currentProjectPath;
  }

  if (query.sourceId === null) {
    clauses.push("threads.source_id IS NULL");
  } else if (query.sourceId !== undefined) {
    clauses.push("threads.source_id = @sourceId");
    params.sourceId = query.sourceId;
  }

  if (searchTerm.length > 0) {
    clauses.push(
      [
        "(",
        "threads.title LIKE @searchTerm",
        "OR threads.preview LIKE @searchTerm",
        "OR threads.cwd LIKE @searchTerm",
        "OR threads.branch_name LIKE @searchTerm",
        ")"
      ].join(" ")
    );
    params.searchTerm = `%${searchTerm}%`;
  }

  clauses.push("threads.is_archived = @isArchived");
  params.isArchived = query.isArchived === true ? "1" : "0";

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = database
    .prepare(
      `
      SELECT
        threads.*,
        projects.default_name AS project_default_name,
        projects.display_name AS project_display_name
      FROM threads
      LEFT JOIN projects ON projects.id = threads.project_id
      ${whereClause}
      ORDER BY threads.updated_at DESC, threads.id ASC
      `
    )
    .all(params) as ThreadRow[];

  return rows.map((row) => mapThreadRow(row));
}

/**
 * Creates a source filter clause for optional source-aware cleanup queries.
 *
 * @param sourceId Source identifier semantics matching thread list queries.
 * @returns SQL fragment and parameters.
 */
export function createSourceClause(sourceId: string | null | undefined): {
  sql: string;
  params: Record<string, string>;
} {
  if (sourceId === null) {
    return {
      sql: "AND source_id IS NULL",
      params: {}
    };
  }

  if (sourceId !== undefined) {
    return {
      sql: "AND source_id = @sourceId",
      params: { sourceId }
    };
  }

  return {
    sql: "",
    params: {}
  };
}

/**
 * Reads one cached thread summary.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 *
 * @returns Cached thread summary, or `null`.
 */
function readThread(database: BetterSqliteDatabase, threadId: string): CachedThreadSummary | null {
  const row = readThreadRow(database, threadId);
  return row === null ? null : mapThreadRow(row);
}

/**
 * Reads one raw thread row with joined project metadata.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 *
 * @returns Thread row, or `null`.
 */
export function readThreadRow(database: BetterSqliteDatabase, threadId: string): ThreadRow | null {
  const row = database
    .prepare(
      `
      SELECT
        threads.*,
        projects.default_name AS project_default_name,
        projects.display_name AS project_display_name
      FROM threads
      LEFT JOIN projects ON projects.id = threads.project_id
      WHERE threads.id = @threadId
      `
    )
    .get({ threadId }) as ThreadRow | undefined;

  return row ?? null;
}

/**
 * Reads sync state for a thread, falling back to an empty state.
 *
 * @param database SQLite database connection.
 * @param threadId Thread identifier.
 *
 * @returns Sync state.
 */
function readSyncState(database: BetterSqliteDatabase, threadId: string): CachedThreadSyncState {
  const row = readThreadRow(database, threadId);

  if (row !== null) {
    return mapSyncState(row);
  }

  return createEmptySyncState(threadId);
}

