/**
 * Persists thread metadata, turns, and sync state inside a local SQLite cache.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

import Database, { type Database as BetterSqliteDatabase } from "better-sqlite3";

import { createProjectIdentity, normalizeProjectPath } from "./projectIdentity.js";
import type {
  CachedProject,
  CachedSource,
  CachedSourceLocalSettings,
  CachedThreadDelta,
  CachedThreadReadOptions,
  CachedThreadSnapshot,
  CachedThreadSummary,
  CachedThreadSyncState,
  CachedOlderTurnsQuery,
  CachedOlderTurnsResult,
  OpenCodexCacheRepository,
  ThreadListCacheQuery
} from "./types.js";

export type SqliteOpenCodexCacheRepositoryOptions = {
  directory: string;
  fileName?: string;
};

type ThreadRow = {
  id: string;
  source_id: string | null;
  cwd: string | null;
  project_default_name: string | null;
  project_display_name: string | null;
  branch_name: string | null;
  codex_title: string;
  custom_title: string | null;
  title: string;
  preview: string | null;
  model: string | null;
  reasoning_effort: "low" | "medium" | "high" | "xhigh" | null;
  status: string | null;
  updated_at: string | null;
  newest_turn_id: string | null;
  oldest_turn_id: string | null;
  older_cursor: string | null;
  has_loaded_latest: number;
  has_loaded_all_older_turns: number;
  last_synced_at: string | null;
};

type TurnRow = {
  id: string;
  raw_json: string;
};

type ProjectRow = {
  id: string;
  source_id: string | null;
  path: string;
  default_name: string;
  display_name: string | null;
  is_hidden: number;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  edited_at: string;
};

type SourceRow = {
  id: string;
  kind: "local";
  name: string;
  settings: string;
  created_at: string;
  updated_at: string;
};

const LEGACY_DEFAULT_SOURCE_ID = "default";
const DEFAULT_SOURCE_NAME = "Default";

/**
 * Creates the SQLite-backed cache repository used by the desktop application.
 *
 * @param options Directory and optional file name for the SQLite database.
 * @returns Cache repository implementation backed by SQLite.
 */
export function createOpenCodexSqliteCacheRepository(
  options: SqliteOpenCodexCacheRepositoryOptions
): OpenCodexCacheRepository {
  return new SqliteOpenCodexCacheRepository(options);
}

/**
 * Implements the thread cache contract with a local SQLite database.
 */
export class SqliteOpenCodexCacheRepository implements OpenCodexCacheRepository {
  private readonly database: BetterSqliteDatabase;

  /**
   * Opens the SQLite database, configures pragmas, and runs migrations.
   *
   * @param options Directory and optional file name for the database file.
   */
  constructor(options: SqliteOpenCodexCacheRepositoryOptions) {
    fs.mkdirSync(options.directory, { recursive: true });

    const fileName = options.fileName ?? "opencodex-cache.sqlite";
    this.database = new Database(path.join(options.directory, fileName));
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    runMigrations(this.database);
  }

  /**
   * Ensures the built-in local Codex source exists.
   *
   * @returns Promise resolved with the default source.
   */
  async ensureDefaultSource(): Promise<CachedSource> {
    const sources = await this.listSources();

    if (sources.length > 0) {
      const existingSource = sources[0];

      if (existingSource !== undefined) {
        return existingSource;
      }
    }

    const now = new Date().toISOString();
    const source: CachedSource = {
      id: crypto.randomUUID(),
      kind: "local",
      name: DEFAULT_SOURCE_NAME,
      settings: createDefaultLocalSourceSettings(),
      createdAt: now,
      updatedAt: now
    };

    this.database
      .prepare(
        `
        INSERT INTO sources (
          id,
          kind,
          name,
          settings,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @kind,
          @name,
          @settingsJson,
          @createdAt,
          @updatedAt
        )
        `
      )
      .run({
        ...source,
        settingsJson: serializeSourceSettings(source.settings)
      });

    return source;
  }

  /**
   * Creates a new local Codex source.
   *
   * @param name Optional source display name.
   * @returns Created source.
   */
  async createSource(name = "Codex"): Promise<CachedSource> {
    const now = new Date().toISOString();
    const source: CachedSource = {
      id: crypto.randomUUID(),
      kind: "local",
      name,
      settings: createDefaultLocalSourceSettings(),
      createdAt: now,
      updatedAt: now
    };

    this.database
      .prepare(
        `
        INSERT INTO sources (
          id,
          kind,
          name,
          settings,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @kind,
          @name,
          @settingsJson,
          @createdAt,
          @updatedAt
        )
        `
      )
      .run({ ...source, settingsJson: serializeSourceSettings(source.settings) });

    return source;
  }

  /**
   * Lists known Codex sources ordered by creation date.
   *
   * @returns Promise resolved with cached sources.
   */
  async listSources(): Promise<CachedSource[]> {
    const rows = this.database
      .prepare(
        `
        SELECT *
        FROM sources
        ORDER BY created_at ASC, name ASC
        `
      )
      .all() as SourceRow[];

    return rows.map(mapSourceRow);
  }

  /**
   * Reads one Codex source.
   *
   * @param sourceId Source identifier.
   * @returns Source row, or `null` when missing.
   */
  async getSource(sourceId: string): Promise<CachedSource | null> {
    const row = this.database
      .prepare("SELECT * FROM sources WHERE id = @sourceId")
      .get({ sourceId }) as SourceRow | undefined;

    return row === undefined ? null : mapSourceRow(row);
  }

  /**
   * Counts projects currently associated with one source.
   *
   * @param sourceId Source identifier.
   * @returns Associated project count.
   */
  async getSourceProjectCount(sourceId: string): Promise<number> {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM projects WHERE source_id = @sourceId")
      .get({ sourceId }) as { count: number } | undefined;

    return row?.count ?? 0;
  }

  /**
   * Updates editable fields on a Codex source.
   *
   * @param sourceId Source identifier.
   * @param patch Fields to update.
   * @returns Updated source.
   */
  async updateSource(
    sourceId: string,
    patch: Partial<Pick<CachedSource, "name">> & {
      settings?: Partial<CachedSourceLocalSettings>;
    }
  ): Promise<CachedSource> {
    const source = await this.getSource(sourceId);

    if (source === null) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const nextSource: CachedSource = {
      ...source,
      name: patch.name?.trim() || source.name,
      settings: {
        ...source.settings,
        ...patch.settings,
        command: patch.settings?.command !== undefined
          ? normalizeNullableText(patch.settings.command)
          : source.settings.command
      },
      updatedAt: new Date().toISOString()
    };

    this.database
      .prepare(
        `
        UPDATE sources SET
          name = @name,
          settings = @settingsJson,
          updated_at = @updatedAt
        WHERE id = @id
        `
      )
      .run({ ...nextSource, settingsJson: serializeSourceSettings(nextSource.settings) });

    return nextSource;
  }

  /**
   * Deletes a Codex source entry.
   *
   * @param sourceId Source identifier.
   * @returns Promise resolved when the source has been deleted.
   */
  async deleteSource(sourceId: string): Promise<void> {
    this.database
      .prepare("DELETE FROM sources WHERE id = @sourceId")
      .run({ sourceId });
  }

  /**
   * Removes project and thread associations for a source.
   *
   * @param sourceId Source identifier.
   * @returns Promise resolved when associations are cleared.
   */
  async clearSourceAssociations(sourceId: string): Promise<void> {
    const clearAssociations = this.database.transaction(() => {
      this.database
        .prepare("UPDATE projects SET source_id = NULL WHERE source_id = @sourceId")
        .run({ sourceId });
      this.database
        .prepare("UPDATE threads SET source_id = NULL WHERE source_id = @sourceId")
        .run({ sourceId });
    });

    clearAssociations();
  }

  /**
   * Persists a project entry independently from its threads.
   *
   * @param projectPath Project folder path to persist.
   * @param sourceId Source associated with the project.
   * @returns Promise resolved with the cached project entry.
   */
  async upsertProject(projectPath: string, sourceId: string | null = null): Promise<CachedProject> {
    const project = createProjectIdentity(projectPath);

    if (project === null) {
      throw new Error("Project path is required.");
    }

    const now = new Date().toISOString();
    this.database
      .prepare(
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
          0,
          @now,
          @now,
          @now
        )
        ON CONFLICT(path) DO UPDATE SET
          source_id = COALESCE(excluded.source_id, projects.source_id),
          default_name = excluded.default_name,
          updated_at = excluded.updated_at,
          last_seen_at = excluded.last_seen_at
        `
      )
      .run({ ...project, sourceId, now });

    const row = this.database
      .prepare(
        `
        SELECT
          projects.*,
          COALESCE(MAX(threads.updated_at), projects.created_at) AS edited_at
        FROM projects
        LEFT JOIN threads ON threads.project_id = projects.id
        WHERE path = @path
        GROUP BY projects.id
        `
      )
      .get({ path: project.path }) as ProjectRow | undefined;

    if (row === undefined) {
      throw new Error("Project could not be read after being cached.");
    }

    return mapProjectRow(row);
  }

  /**
   * Lists projects known by the local cache, ordered by most recent activity.
   *
   * @returns Promise resolved with cached projects.
   */
  async listProjects(): Promise<CachedProject[]> {
    const rows = this.database
      .prepare(
        `
        SELECT
          projects.*,
          COALESCE(MAX(threads.updated_at), projects.created_at) AS edited_at
        FROM projects
        LEFT JOIN threads ON threads.project_id = projects.id
        GROUP BY projects.id
        ORDER BY edited_at DESC, projects.path ASC
        `
      )
      .all() as ProjectRow[];

    return rows.map((row) => mapProjectRow(row));
  }

  /**
   * Upserts the cached thread index entries.
   *
   * @param threads Thread summaries to persist.
   * @returns Promise resolved once the index has been written.
   */
  async upsertThreadIndex(threads: CachedThreadSummary[]): Promise<void> {
    this.writeThreadIndex(threads);
  }

  /**
   * Persists a user-defined thread title.
   *
   * @param threadId Identifier of the thread to update.
   * @param title Custom title chosen by the user.
   * @returns Promise resolved once the title update has been written.
   */
  async updateThreadTitle(threadId: string, title: string): Promise<void> {
    this.database
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
   * Persists the title currently reported by Codex for a thread.
   *
   * @param threadId Identifier of the thread to update.
   * @param title Codex-provided thread title.
   * @returns Promise resolved once the title update has been written.
   */
  async updateThreadCodexTitle(threadId: string, title: string): Promise<void> {
    this.database
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
   * Deletes a cached thread and its associated turns.
   *
   * @param threadId Identifier of the thread to remove.
   * @returns Promise resolved once the thread has been deleted.
   */
  async deleteThread(threadId: string): Promise<void> {
    this.database.prepare("DELETE FROM threads WHERE id = ?").run(threadId);
  }

  /**
   * Lists cached threads filtered by scope and optional search term.
   *
   * @param query Scope, current project, and search filters.
   * @returns Promise resolved with the matching cached thread summaries.
   */
  async listThreads(query: ThreadListCacheQuery): Promise<CachedThreadSummary[]> {
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

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.database
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
   * Reads a cached thread snapshot along with its latest cached turns.
   *
   * @param threadId Identifier of the thread to read.
   * @param options Optional read settings such as the latest turn limit.
   * @returns Promise resolved with the cached snapshot, or `null` when not found.
   */
  async getThread(
    threadId: string,
    options: CachedThreadReadOptions = {}
  ): Promise<CachedThreadSnapshot | null> {
    const thread = this.readThread(threadId);

    if (thread === null) {
      return null;
    }

    const turnRows = this.readLatestTurnRows(threadId, options.latestTurnLimit ?? null);
    const turns = parseTurnRows(turnRows);
    const syncState = this.readSyncState(threadId);
    const hasMoreCachedTurns = this.hasMoreCachedTurnsBefore(threadId, turnRows[0]?.id ?? null);

    return {
      thread,
      turns,
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
   * Reads cached turns that come before a known turn identifier.
   *
   * @param query Thread identifier, pivot turn, and page size.
   * @returns Promise resolved with older cached turns and pagination state.
   */
  async getOlderTurns(query: CachedOlderTurnsQuery): Promise<CachedOlderTurnsResult> {
    const rows = this.readOlderTurnRows(query.threadId, query.beforeTurnId, query.limit);
    const turns = parseTurnRows(rows);
    const hasMoreOlderTurns = this.hasMoreCachedTurnsBefore(query.threadId, rows[0]?.id ?? null);

    return {
      turns,
      hasMoreOlderTurns
    };
  }

  /**
   * Replaces the stored thread snapshot with a full snapshot payload.
   *
   * @param snapshot Thread summary, turns, and sync state to persist.
   * @returns Promise resolved once the snapshot transaction has completed.
   */
  async saveThreadSnapshot(snapshot: CachedThreadSnapshot): Promise<void> {
    const writeSnapshot = this.database.transaction(() => {
      this.writeThreadIndex([snapshot.thread]);
      this.database.prepare("DELETE FROM turns WHERE thread_id = ?").run(snapshot.thread.id);
      this.writeTurns(snapshot.thread.id, snapshot.turns);
      this.writeSyncState(snapshot.syncState);
    });

    writeSnapshot();
  }

  /**
   * Persists incremental turn and sync-state updates for a thread.
   *
   * @param delta Partial thread update to store.
   * @returns Promise resolved once the delta transaction has completed.
   */
  async saveThreadDelta(delta: CachedThreadDelta): Promise<void> {
    const writeDelta = this.database.transaction(() => {
      this.writeTurns(delta.threadId, delta.turns);
      this.writeSyncState(delta.syncState);
    });

    writeDelta();
  }

  /**
   * Reads the cached sync state for a thread.
   *
   * @param threadId Identifier of the thread to inspect.
   * @returns Promise resolved with the sync state, or `null` when the thread is unknown.
   */
  async getSyncState(threadId: string): Promise<CachedThreadSyncState | null> {
    const thread = this.readThreadRow(threadId);

    if (thread === null) {
      return null;
    }

    return mapSyncState(thread);
  }

  /**
   * Closes the underlying SQLite connection.
   *
   * @returns Promise resolved once the database has been closed.
   */
  async close(): Promise<void> {
    this.database.pragma("wal_checkpoint(TRUNCATE)");
    this.database.close();
  }

  /**
   * Updates whether a project should be hidden from the default project list.
   *
   * @param projectId Project identifier.
   * @param isHidden Whether the project should be hidden.
   * @returns Promise resolved once the update has been persisted.
   */
  async setProjectHidden(projectId: string, isHidden: boolean): Promise<void> {
    this.database
      .prepare(
        `
        UPDATE projects SET
          is_hidden = @isHidden,
          updated_at = @updatedAt
        WHERE id = @projectId
        `
      )
      .run({
        projectId,
        isHidden: isHidden ? 1 : 0,
        updatedAt: new Date().toISOString()
      });
  }

  /**
   * Reads a cached thread summary by identifier.
   *
   * @param threadId Identifier of the thread to read.
   * @returns Cached thread summary, or `null` when no row exists.
   */
  private readThread(threadId: string): CachedThreadSummary | null {
    const row = this.readThreadRow(threadId);
    return row === null ? null : mapThreadRow(row);
  }

  /**
   * Reads the joined thread row and project metadata from SQLite.
   *
   * @param threadId Identifier of the thread to read.
   * @returns Joined database row, or `null` when the thread is unknown.
   */
  private readThreadRow(threadId: string): ThreadRow | null {
    const row = this.database
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
   * Reads the cached sync state for a thread, or returns an empty default state.
   *
   * @param threadId Identifier of the thread to inspect.
   * @returns Cached sync state for the thread.
   */
  private readSyncState(threadId: string): CachedThreadSyncState {
    const row = this.readThreadRow(threadId);

    if (row !== null) {
      return mapSyncState(row);
    }

    return createEmptySyncState(threadId);
  }

  /**
   * Reads the latest cached turns for a thread, optionally capped to a fixed count.
   *
   * @param threadId Identifier of the thread whose turns should be read.
   * @param limit Optional maximum number of latest turns to keep.
   * @returns Ordered turn rows from oldest to newest within the requested window.
   */
  private readLatestTurnRows(threadId: string, limit: number | null): TurnRow[] {
    if (limit === null || limit <= 0) {
      return this.database
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

    return this.database
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

  /**
   * Reads cached turns that come before a known turn identifier.
   *
   * @param threadId Identifier of the thread whose turns should be read.
   * @param beforeTurnId Identifier used as the exclusive upper bound.
   * @param limit Maximum number of older turns to read.
   * @returns Ordered turn rows from oldest to newest within the requested page.
   */
  private readOlderTurnRows(threadId: string, beforeTurnId: string, limit: number): TurnRow[] {
    return this.database
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

  /**
   * Checks whether more cached turns exist before a known turn identifier.
   *
   * @param threadId Identifier of the thread to inspect.
   * @param beforeTurnId Identifier used as the exclusive upper bound.
   * @returns `true` when at least one older cached turn exists.
   */
  private hasMoreCachedTurnsBefore(threadId: string, beforeTurnId: string | null): boolean {
    if (beforeTurnId === null || beforeTurnId.length === 0) {
      return false;
    }

    const row = this.database
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
   * Upserts thread and project index rows inside a single transaction.
   *
   * @param threads Thread summaries to store.
   * @returns Nothing.
   */
  private writeThreadIndex(threads: CachedThreadSummary[]): void {
    const now = new Date().toISOString();
    const upsertProject = this.database.prepare(
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
    const upsertThread = this.database.prepare(
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
        updated_at = excluded.updated_at
      `
    );

    const writeIndex = this.database.transaction(() => {
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
          updatedAt: thread.updatedAt ?? null
        });
      }
    });

    writeIndex();
  }

  /**
   * Upserts raw turn payloads for a thread.
   *
   * @param threadId Identifier of the thread owning the turns.
   * @param turns Raw turn payloads to persist.
   * @returns Nothing.
   */
  private writeTurns(threadId: string, turns: unknown[]): void {
    const upsertTurn = this.database.prepare(
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

  /**
   * Updates the persisted sync-state columns for a thread.
   *
   * @param syncState Sync state snapshot to write.
   * @returns Nothing.
   */
  private writeSyncState(syncState: CachedThreadSyncState): void {
    this.database
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
}

/**
 * Applies all database schema migrations required by the SQLite cache.
 *
 * @param database Open SQLite database connection.
 * @returns Nothing.
 */
function runMigrations(database: BetterSqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(1);

  if (migration === undefined) {
    const applyMigration = database.transaction(() => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          source_id TEXT,
          path TEXT NOT NULL UNIQUE,
          default_name TEXT NOT NULL,
          display_name TEXT,
          is_hidden INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS threads (
          id TEXT PRIMARY KEY,
          source_id TEXT,
          project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
          cwd TEXT,
          branch_name TEXT,
          title TEXT NOT NULL,
          preview TEXT,
          model TEXT,
          reasoning_effort TEXT,
          status TEXT,
          created_at TEXT,
          updated_at TEXT,
          last_synced_at TEXT,
          newest_turn_id TEXT,
          oldest_turn_id TEXT,
          older_cursor TEXT,
          has_loaded_latest INTEGER NOT NULL DEFAULT 0,
          has_loaded_all_older_turns INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS turns (
          thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          status TEXT,
          started_at TEXT,
          completed_at TEXT,
          duration_ms INTEGER,
          item_count INTEGER NOT NULL DEFAULT 0,
          raw_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY(thread_id, id)
        );

        CREATE INDEX IF NOT EXISTS idx_threads_project_updated
          ON threads(project_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_threads_updated
          ON threads(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_turns_thread_started
          ON turns(thread_id, started_at);
      `);
      database
        .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(1, new Date().toISOString());
    });

    applyMigration();
  }

  applySchemaMigrationV2(database);
  applySchemaMigrationV3(database);
  applySchemaMigrationV4(database);
  applySchemaMigrationV5(database);
  applySchemaMigrationV6(database);
  applySchemaMigrationV7(database);
}

/**
 * Applies the second cache schema migration when it has not been installed yet.
 *
 * @param database Open SQLite database connection.
 * @returns Nothing.
 */
function applySchemaMigrationV2(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(2);

  if (migration !== undefined) {
    return;
  }

  const applyMigration = database.transaction(() => {
    addColumnIfMissing(database, "threads", "codex_title", "TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing(database, "threads", "custom_title", "TEXT");
    database.exec(`
      UPDATE threads SET
        custom_title = CASE
          WHEN title <> '' AND title <> COALESCE(preview, '') THEN title
          ELSE custom_title
        END,
        codex_title = CASE
          WHEN title = COALESCE(preview, '') THEN title
          ELSE codex_title
        END;
    `);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(2, new Date().toISOString());
  });

  applyMigration();
}

/**
 * Applies source storage migration when it has not been installed yet.
 *
 * @param database Open SQLite database connection.
 * @returns Nothing.
 */
function applySchemaMigrationV3(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(3);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        settings TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    database
      .prepare(
        `
        INSERT INTO sources (
          id,
          kind,
          name,
          settings,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          'local',
          @name,
          @settings,
          @now,
          @now
        )
        ON CONFLICT(id) DO NOTHING
        `
      )
      .run({
        id: LEGACY_DEFAULT_SOURCE_ID,
        name: DEFAULT_SOURCE_NAME,
        settings: serializeSourceSettings(createDefaultLocalSourceSettings()),
        now
      });
    addColumnIfMissing(database, "projects", "source_id", "TEXT");
    addColumnIfMissing(database, "threads", "source_id", "TEXT");
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(3, now);
  });

  applyMigration();
}

/**
 * Removes eager default source assignments introduced before source sync was explicit.
 *
 * @param database Open SQLite database connection.
 * @returns Nothing.
 */
function applySchemaMigrationV4(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(4);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  database.pragma("foreign_keys = OFF");
  const applyMigration = database.transaction(() => {
    database.exec(`
      DROP TABLE IF EXISTS projects_next;

      CREATE TABLE IF NOT EXISTS projects_next (
        id TEXT PRIMARY KEY,
        source_id TEXT,
        path TEXT NOT NULL UNIQUE,
        default_name TEXT NOT NULL,
        display_name TEXT,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      INSERT INTO projects_next (
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
      SELECT
        id,
        CASE WHEN source_id = 'default' THEN NULL ELSE source_id END,
        path,
        default_name,
        display_name,
        0,
        created_at,
        updated_at,
        last_seen_at
      FROM projects;

      DROP TABLE projects;
      ALTER TABLE projects_next RENAME TO projects;
      UPDATE projects SET source_id = NULL WHERE source_id = 'default';
      UPDATE threads SET source_id = NULL WHERE source_id = 'default';
    `);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(4, now);
  });

  applyMigration();
  database.pragma("foreign_keys = ON");
}

/**
 * Moves source-specific fields into a settings document.
 *
 * @param database Open SQLite database connection.
 * @returns Nothing.
 */
function applySchemaMigrationV5(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(5);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const tableInfo = database
    .prepare("PRAGMA table_info(sources)")
    .all() as Array<{ name: string }>;
  const hasLegacyCommandMode = tableInfo.some((column) => column.name === "command_mode");

  database.pragma("foreign_keys = OFF");
  const applyMigration = database.transaction(() => {
    database.exec(`
      DROP TABLE IF EXISTS sources_next;

      CREATE TABLE sources_next (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        settings TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    if (hasLegacyCommandMode) {
      const rows = database
        .prepare("SELECT id, kind, name, command_mode, command, created_at, updated_at FROM sources")
        .all() as Array<{
          id: string;
          kind: "local";
          name: string;
          command_mode: string;
          command: string | null;
          created_at: string;
          updated_at: string;
        }>;

      const insertSource = database.prepare(`
        INSERT INTO sources_next (
          id,
          kind,
          name,
          settings,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @kind,
          @name,
          @settings,
          @createdAt,
          @updatedAt
        )
      `);

      for (const row of rows) {
        insertSource.run({
          id: row.id,
          kind: row.kind,
          name: row.name,
          settings: serializeSourceSettings({
            commandMode: row.command_mode === "custom" ? "custom" : "auto",
            command: normalizeNullableText(row.command)
          }),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }
    } else {
      database.exec(`
        INSERT INTO sources_next (
          id,
          kind,
          name,
          settings,
          created_at,
          updated_at
        )
        SELECT
          id,
          kind,
          name,
          settings,
          created_at,
          updated_at
        FROM sources;
      `);
    }

    database.exec(`
      DROP TABLE sources;
      ALTER TABLE sources_next RENAME TO sources;
    `);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(5, now);
  });

  applyMigration();
  database.pragma("foreign_keys = ON");
}

/**
 * Replaces the legacy fixed default source id with a generated source id.
 *
 * @param database Open SQLite database connection.
 * @returns Nothing.
 */
function applySchemaMigrationV6(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(6);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const legacySource = database
    .prepare("SELECT id FROM sources WHERE id = @sourceId")
    .get({ sourceId: LEGACY_DEFAULT_SOURCE_ID }) as { id: string } | undefined;

  const applyMigration = database.transaction(() => {
    if (legacySource !== undefined) {
      const nextSourceId = crypto.randomUUID();
      database
        .prepare("UPDATE sources SET id = @nextSourceId WHERE id = @legacySourceId")
        .run({
          nextSourceId,
          legacySourceId: LEGACY_DEFAULT_SOURCE_ID
        });
      database
        .prepare("UPDATE projects SET source_id = @nextSourceId WHERE source_id = @legacySourceId")
        .run({
          nextSourceId,
          legacySourceId: LEGACY_DEFAULT_SOURCE_ID
        });
      database
        .prepare("UPDATE threads SET source_id = @nextSourceId WHERE source_id = @legacySourceId")
        .run({
          nextSourceId,
          legacySourceId: LEGACY_DEFAULT_SOURCE_ID
        });
    }

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(6, now);
  });

  applyMigration();
}

/**
 * Adds project visibility preferences.
 *
 * @param database Open SQLite database connection.
 * @returns Nothing.
 */
function applySchemaMigrationV7(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(7);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    addColumnIfMissing(database, "projects", "is_hidden", "INTEGER NOT NULL DEFAULT 0");
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(7, now);
  });

  applyMigration();
}

/**
 * Adds a column to a table when the column is missing from the current schema.
 *
 * @param database Open SQLite database connection.
 * @param tableName Table to alter.
 * @param columnName Column to add when missing.
 * @param definition SQL column definition appended to the `ALTER TABLE`.
 * @returns Nothing.
 */
function addColumnIfMissing(
  database: BetterSqliteDatabase,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;
  const exists = columns.some((column) => column.name === columnName);

  if (exists) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

/**
 * Maps a raw SQLite thread row into the public cached thread summary shape.
 *
 * @param row Joined thread row read from SQLite.
 * @returns Normalized cached thread summary.
 */
function mapThreadRow(row: ThreadRow): CachedThreadSummary {
  const projectName = row.project_display_name ?? row.project_default_name;
  const title = resolveCachedThreadTitle(row.codex_title, row.custom_title, row.preview ?? "");
  const thread: CachedThreadSummary = {
    id: row.id,
    sourceId: row.source_id,
    codexTitle: row.codex_title,
    customTitle: row.custom_title,
    title,
    preview: row.preview ?? "",
    model: row.model,
    reasoningEffort: row.reasoning_effort,
    projectName,
    projectPath: row.cwd,
    branchName: row.branch_name,
    updatedAt: row.updated_at
  };

  if (row.status !== null) {
    thread.status = row.status;
  }

  return thread;
}

/**
 * Maps a raw SQLite project row into the public cached project shape.
 *
 * @param row Project row read from SQLite.
 * @returns Normalized cached project entry.
 */
function mapProjectRow(row: ProjectRow): CachedProject {
  return {
    id: row.id,
    sourceId: row.source_id,
    path: row.path,
    defaultName: row.default_name,
    displayName: row.display_name,
    isHidden: row.is_hidden === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
    editedAt: row.edited_at
  };
}

/**
 * Maps a raw SQLite source row into the public cached source shape.
 *
 * @param row Source row read from SQLite.
 * @returns Normalized cached source entry.
 */
function mapSourceRow(row: SourceRow): CachedSource {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    settings: parseLocalSourceSettings(row.settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Creates default settings for a local Codex source.
 *
 * @returns Local source settings.
 */
function createDefaultLocalSourceSettings(): CachedSourceLocalSettings {
  return {
    commandMode: "auto",
    command: null
  };
}

/**
 * Serializes source settings for SQLite storage.
 *
 * @param settings Source-specific settings.
 * @returns JSON document.
 */
function serializeSourceSettings(settings: CachedSourceLocalSettings): string {
  return JSON.stringify({
    commandMode: settings.commandMode,
    command: normalizeNullableText(settings.command)
  });
}

/**
 * Parses and normalizes a local source settings document.
 *
 * @param value Raw JSON value read from SQLite.
 * @returns Local source settings.
 */
function parseLocalSourceSettings(value: string): CachedSourceLocalSettings {
  try {
    const parsed = JSON.parse(value) as Partial<CachedSourceLocalSettings>;
    const commandMode = parsed.commandMode === "custom" ? "custom" : "auto";

    return {
      commandMode,
      command: normalizeNullableText(parsed.command ?? null)
    };
  } catch {
    return createDefaultLocalSourceSettings();
  }
}

/**
 * Normalizes user-editable text where blank means no value.
 *
 * @param value Text value to normalize.
 * @returns Trimmed value, or `null` when blank.
 */
function normalizeNullableText(value: string | null): string | null {
  const trimmedValue = value?.trim() ?? "";
  return trimmedValue.length > 0 ? trimmedValue : null;
}

/**
 * Resolves the effective thread title stored in the cache.
 *
 * @param codexTitle Title reported by Codex.
 * @param customTitle User-defined thread title.
 * @param preview Fallback preview text from the thread.
 * @returns Effective title shown by the application.
 */
function resolveCachedThreadTitle(
  codexTitle: string,
  customTitle: string | null,
  preview: string
): string {
  const trimmedCustomTitle = customTitle?.trim() ?? "";
  const trimmedCodexTitle = codexTitle.trim();

  if (trimmedCustomTitle.length > 0) {
    return trimmedCustomTitle;
  }

  if (trimmedCodexTitle.length > 0) {
    return trimmedCodexTitle;
  }

  return preview;
}

/**
 * Parses serialized turn rows and drops rows that no longer contain valid JSON.
 *
 * @param rows Turn rows read from SQLite.
 * @returns Parsed raw turn payloads.
 */
function parseTurnRows(rows: TurnRow[]): unknown[] {
  return rows
    .map((row) => parseTurn(row.raw_json))
    .filter((turn): turn is unknown => turn !== null);
}

/**
 * Creates the synthetic cache cursor used to page through stored turns.
 *
 * @param turnId Oldest cached turn identifier currently exposed to the UI.
 * @returns Synthetic cache cursor string.
 */
function createCacheOlderCursor(turnId: string): string {
  return `cache:${turnId}`;
}

/**
 * Maps SQLite sync-state columns into the cache sync-state shape.
 *
 * @param row Joined thread row containing sync-state columns.
 * @returns Normalized sync-state snapshot.
 */
function mapSyncState(row: ThreadRow): CachedThreadSyncState {
  return {
    threadId: row.id,
    newestTurnId: row.newest_turn_id,
    oldestTurnId: row.oldest_turn_id,
    olderCursor: row.older_cursor,
    hasLoadedLatest: row.has_loaded_latest === 1,
    hasLoadedAllOlderTurns: row.has_loaded_all_older_turns === 1,
    lastSyncedAt: row.last_synced_at
  };
}

/**
 * Creates an empty sync-state snapshot for an unknown thread.
 *
 * @param threadId Identifier of the thread being initialized.
 * @returns Sync-state object with default empty values.
 */
function createEmptySyncState(threadId: string): CachedThreadSyncState {
  return {
    threadId,
    newestTurnId: null,
    oldestTurnId: null,
    olderCursor: null,
    hasLoadedLatest: false,
    hasLoadedAllOlderTurns: false,
    lastSyncedAt: null
  };
}

/**
 * Extracts the persisted turn metadata used for sorting and indexing.
 *
 * @param turn Raw turn payload read from the backend.
 * @returns Serializable turn metadata for the cache tables.
 */
function readTurnMetadata(turn: unknown): {
  id: string;
  status: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  itemCount: number;
} {
  const value = readObject(turn);
  const items = Array.isArray(value.items) ? value.items : [];

  return {
    id: readString(value.id),
    status: readNullableString(value.status),
    startedAt: readNullableString(value.startedAt),
    completedAt: readNullableString(value.completedAt),
    durationMs: readNullableNumber(value.durationMs),
    itemCount: items.length
  };
}

/**
 * Parses a serialized turn payload from SQLite.
 *
 * @param value Serialized JSON turn payload.
 * @returns Parsed turn object, or `null` when parsing fails.
 */
function parseTurn(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Reads a plain object from an unknown JSON value.
 *
 * @param value Unknown value to normalize.
 * @returns Plain object, or an empty object when the value is not an object.
 */
function readObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

/**
 * Reads a string from an unknown value.
 *
 * @param value Unknown value to normalize.
 * @returns String value, or an empty string when the value is not a string.
 */
function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads a non-empty string from an unknown value.
 *
 * @param value Unknown value to normalize.
 * @returns Non-empty string value, or `null` when unavailable.
 */
function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads a finite number from an unknown value.
 *
 * @param value Unknown value to normalize.
 * @returns Finite number value, or `null` when unavailable.
 */
function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
