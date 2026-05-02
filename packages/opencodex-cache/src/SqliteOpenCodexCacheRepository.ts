import fs from "node:fs";
import path from "node:path";

import Database, { type Database as BetterSqliteDatabase } from "better-sqlite3";

import { createProjectIdentity, normalizeProjectPath } from "./projectIdentity.js";
import type {
  CachedThreadDelta,
  CachedThreadSnapshot,
  CachedThreadSummary,
  CachedThreadSyncState,
  OpenCodexCacheRepository,
  ThreadListCacheQuery
} from "./types.js";

export type SqliteOpenCodexCacheRepositoryOptions = {
  directory: string;
  fileName?: string;
};

type ThreadRow = {
  id: string;
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
  raw_json: string;
};

export function createOpenCodexSqliteCacheRepository(
  options: SqliteOpenCodexCacheRepositoryOptions
): OpenCodexCacheRepository {
  return new SqliteOpenCodexCacheRepository(options);
}

export class SqliteOpenCodexCacheRepository implements OpenCodexCacheRepository {
  private readonly database: BetterSqliteDatabase;

  constructor(options: SqliteOpenCodexCacheRepositoryOptions) {
    fs.mkdirSync(options.directory, { recursive: true });

    const fileName = options.fileName ?? "opencodex-cache.sqlite";
    this.database = new Database(path.join(options.directory, fileName));
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    runMigrations(this.database);
  }

  async upsertThreadIndex(threads: CachedThreadSummary[]): Promise<void> {
    this.writeThreadIndex(threads);
  }

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

  async listThreads(query: ThreadListCacheQuery): Promise<CachedThreadSummary[]> {
    const clauses: string[] = [];
    const params: Record<string, string> = {};
    const currentProjectPath = normalizeProjectPath(query.currentProjectPath);
    const searchTerm = query.searchTerm?.trim() ?? "";

    if (query.scope === "currentProject" && currentProjectPath !== null) {
      clauses.push("threads.cwd = @currentProjectPath");
      params.currentProjectPath = currentProjectPath;
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

  async getThread(threadId: string): Promise<CachedThreadSnapshot | null> {
    const thread = this.readThread(threadId);

    if (thread === null) {
      return null;
    }

    const turnRows = this.database
      .prepare(
        `
        SELECT raw_json
        FROM turns
        WHERE thread_id = @threadId
        ORDER BY started_at ASC, completed_at ASC, id ASC
        `
      )
      .all({ threadId }) as TurnRow[];
    const turns = turnRows
      .map((row) => parseTurn(row.raw_json))
      .filter((turn): turn is unknown => turn !== null);

    return {
      thread,
      turns,
      syncState: this.readSyncState(threadId)
    };
  }

  async saveThreadSnapshot(snapshot: CachedThreadSnapshot): Promise<void> {
    const writeSnapshot = this.database.transaction(() => {
      this.writeThreadIndex([snapshot.thread]);
      this.database.prepare("DELETE FROM turns WHERE thread_id = ?").run(snapshot.thread.id);
      this.writeTurns(snapshot.thread.id, snapshot.turns);
      this.writeSyncState(snapshot.syncState);
    });

    writeSnapshot();
  }

  async saveThreadDelta(delta: CachedThreadDelta): Promise<void> {
    const writeDelta = this.database.transaction(() => {
      this.writeTurns(delta.threadId, delta.turns);
      this.writeSyncState(delta.syncState);
    });

    writeDelta();
  }

  async getSyncState(threadId: string): Promise<CachedThreadSyncState | null> {
    const thread = this.readThreadRow(threadId);

    if (thread === null) {
      return null;
    }

    return mapSyncState(thread);
  }

  async close(): Promise<void> {
    this.database.close();
  }

  private readThread(threadId: string): CachedThreadSummary | null {
    const row = this.readThreadRow(threadId);
    return row === null ? null : mapThreadRow(row);
  }

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

  private readSyncState(threadId: string): CachedThreadSyncState {
    const row = this.readThreadRow(threadId);

    if (row !== null) {
      return mapSyncState(row);
    }

    return createEmptySyncState(threadId);
  }

  private writeThreadIndex(threads: CachedThreadSummary[]): void {
    const now = new Date().toISOString();
    const upsertProject = this.database.prepare(
      `
      INSERT INTO projects (
        id,
        path,
        default_name,
        display_name,
        created_at,
        updated_at,
        last_seen_at
      )
      VALUES (
        @id,
        @path,
        @defaultName,
        NULL,
        @now,
        @now,
        @now
      )
      ON CONFLICT(path) DO UPDATE SET
        default_name = excluded.default_name,
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at
      `
    );
    const upsertThread = this.database.prepare(
      `
      INSERT INTO threads (
        id,
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

        if (project !== null) {
          upsertProject.run({ ...project, now });
        }

        upsertThread.run({
          id: thread.id,
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
          path TEXT NOT NULL UNIQUE,
          default_name TEXT NOT NULL,
          display_name TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS threads (
          id TEXT PRIMARY KEY,
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
}

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

function mapThreadRow(row: ThreadRow): CachedThreadSummary {
  const projectName = row.project_display_name ?? row.project_default_name;
  const title = resolveCachedThreadTitle(row.codex_title, row.custom_title, row.preview ?? "");
  const thread: CachedThreadSummary = {
    id: row.id,
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

function parseTurn(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
