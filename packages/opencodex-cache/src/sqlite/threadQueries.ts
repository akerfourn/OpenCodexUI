/**
 * Thread and turn-related SQLite operations.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { createProjectIdentity, normalizeProjectPath } from "../projectIdentity.js";
import type {
  CachedOlderTurnsQuery,
  CachedOlderTurnsResult,
  CachedThreadDelta,
  CachedThreadReadOptions,
  CachedThreadSnapshot,
  CachedThreadSummary,
  CachedThreadSyncState,
  CachedThreadTokenUsage,
  ThreadListCacheQuery
} from "../types.js";
import {
  createEmptySyncState,
  mapSyncState,
  mapThreadTokenUsage,
  mapThreadRow
} from "./mappers.js";
import type { ThreadRow } from "./rowTypes.js";
import { parseTurnRows } from "./turnSerialization.js";
import {
  createCacheOlderCursor,
  hasMoreCachedTurnsBefore,
  readLatestTurnRows,
  readOlderTurnRows,
  writeSyncState,
  writeTurns
} from "./turnQueries.js";

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
function createSourceClause(sourceId: string | null | undefined): {
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
 * Saves the latest known token usage for a cached thread.
 *
 * @param database SQLite database connection.
 * @param usage Thread token usage snapshot.
 *
 * @returns Promise resolved when save completes.
 */
export async function saveThreadTokenUsage(
  database: BetterSqliteDatabase,
  usage: CachedThreadTokenUsage
): Promise<void> {
  database
    .prepare(
      `
      UPDATE threads SET
        token_usage_json = @tokenUsageJson
      WHERE id = @threadId
      `
    )
    .run({
      threadId: usage.threadId,
      tokenUsageJson: JSON.stringify(usage)
    });
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
function readThreadRow(database: BetterSqliteDatabase, threadId: string): ThreadRow | null {
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

/**
 * Writes thread index data and associated project rows.
 *
 * @param database SQLite database connection.
 * @param threads Thread summaries to write.
 *
 * @returns Nothing.
 */
function writeThreadIndex(
  database: BetterSqliteDatabase,
  threads: CachedThreadSummary[]
): void {
  const now = new Date().toISOString();
  const upsertProject = database.prepare(
    `
    INSERT INTO projects (
      id,
      source_id,
      path,
      default_name,
      display_name,
      is_hidden,
      created_at,
      updated_at,
      last_seen_at
    )
    VALUES (
      @id,
      @sourceId,
      @path,
      @defaultName,
      NULL,
      @isHidden,
      @now,
      @now,
      @now
    )
    ON CONFLICT(path) DO UPDATE SET
      source_id = COALESCE(excluded.source_id, projects.source_id),
      default_name = excluded.default_name,
      is_hidden = CASE
        WHEN excluded.is_hidden = 1 THEN 1
        ELSE projects.is_hidden
      END,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at
    `
  );
  const upsertThread = database.prepare(
    `
    INSERT INTO threads (
      id,
      source_id,
      project_id,
      cwd,
      branch_name,
      codex_title,
      custom_title,
      title,
      preview,
      model,
      reasoning_effort,
      status,
      is_archived,
      updated_at
    )
    VALUES (
      @id,
      @sourceId,
      @projectId,
      @cwd,
      @branchName,
      @codexTitle,
      @customTitle,
      @title,
      @preview,
      @model,
      @reasoningEffort,
      @status,
      @isArchived,
      @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      source_id = COALESCE(excluded.source_id, threads.source_id),
      project_id = excluded.project_id,
      cwd = excluded.cwd,
      branch_name = excluded.branch_name,
      codex_title = excluded.codex_title,
      custom_title = COALESCE(excluded.custom_title, threads.custom_title),
      title = CASE
        WHEN COALESCE(excluded.custom_title, threads.custom_title, '') <> ''
          THEN COALESCE(excluded.custom_title, threads.custom_title)
        WHEN excluded.codex_title <> '' THEN excluded.codex_title
        ELSE COALESCE(excluded.preview, '')
      END,
      preview = excluded.preview,
      model = COALESCE(excluded.model, threads.model),
      reasoning_effort = COALESCE(excluded.reasoning_effort, threads.reasoning_effort),
      status = excluded.status,
      is_archived = excluded.is_archived,
      updated_at = excluded.updated_at
    `
  );

  const writeIndex = database.transaction(() => {
    for (const thread of threads) {
      const project = createProjectIdentity(thread.projectPath ?? "");
      const sourceId = thread.sourceId;

      if (project !== null) {
        upsertProject.run({
          ...project,
          sourceId,
          isHidden: thread.projectHidden === true ? 1 : 0,
          now
        });
      }

      upsertThread.run({
        id: thread.id,
        sourceId,
        projectId: project?.id ?? null,
        cwd: project?.path ?? null,
        branchName: thread.branchName ?? null,
        codexTitle: thread.codexTitle,
        customTitle: thread.customTitle,
        title: thread.title,
        preview: thread.preview ?? null,
        model: thread.model ?? null,
        reasoningEffort: thread.reasoningEffort ?? null,
        status: thread.status ?? null,
        isArchived: thread.isArchived ? 1 : 0,
        updatedAt: thread.updatedAt ?? null
      });
    }
  });

  writeIndex();
}
