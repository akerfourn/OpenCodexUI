/**
 * Applies SQLite schema migrations for the cache database.
 */
import crypto from "node:crypto";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { DEFAULT_SOURCE_NAME, LEGACY_DEFAULT_SOURCE_ID } from "./constants.js";
import {
  createDefaultLocalSourceSettings,
  normalizeNullableText,
  serializeSourceSettings
} from "./sourceSettings.js";

/**
 * Applies all database schema migrations required by the SQLite cache.
 *
 * @param database Open SQLite database connection.
 * @returns Nothing.
 */
export function runMigrations(database: BetterSqliteDatabase): void {
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
  applySchemaMigrationV8(database);
  applySchemaMigrationV9(database);
  applySchemaMigrationV10(database);
  applySchemaMigrationV11(database);
  applySchemaMigrationV12(database);
  applySchemaMigrationV13(database);
  applySchemaMigrationV14(database);
}

/**
 * Adds custom and Codex title columns to cached threads.
 *
 * @param database SQLite database connection.
 *
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
 * Creates the sources table and legacy default source.
 *
 * @param database SQLite database connection.
 *
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
 * Rebuilds projects to remove implicit legacy default associations.
 *
 * @param database SQLite database connection.
 *
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
 * Migrates source command columns into the JSON settings document.
 *
 * @param database SQLite database connection.
 *
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
      migrateLegacySources(database);
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
 * Replaces the legacy default source identifier with a generated UUID.
 *
 * @param database SQLite database connection.
 *
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
 * Adds hidden-project support.
 *
 * @param database SQLite database connection.
 *
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
 * Adds application log persistence.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
function applySchemaMigrationV8(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(8);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        details_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_logs_created
        ON logs(created_at DESC, id DESC);
    `);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(8, now);
  });

  applyMigration();
}

/**
 * Adds per-project command configuration.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
function applySchemaMigrationV9(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(9);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS project_commands (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        allow_parallel INTEGER NOT NULL DEFAULT 0,
        persist_logs INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_project_commands_project
        ON project_commands(project_id, created_at ASC);
    `);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(9, now);
  });

  applyMigration();
}

/**
 * Adds nullable per-thread token usage cache.
 *
 * This is intentionally an additive column-only migration. Older app versions
 * keep working because their explicit INSERT/SELECT statements ignore this
 * extra nullable column.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
function applySchemaMigrationV10(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(10);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    addColumnIfMissing(database, "threads", "token_usage_json", "TEXT");
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(10, now);
  });

  applyMigration();
}

/**
 * Adds nullable project preferences.
 *
 * This is an additive nullable JSON column. Older application versions keep
 * working because their explicit project statements ignore unknown columns.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
function applySchemaMigrationV11(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(11);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    addColumnIfMissing(database, "projects", "preferences_json", "TEXT");
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(11, now);
  });

  applyMigration();
}

/**
 * Adds nullable source diagnostics for last Codex CLI detection.
 *
 * This migration is additive and nullable. Older app versions keep working
 * because their explicit source statements ignore these extra columns.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
function applySchemaMigrationV12(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(12);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    addColumnIfMissing(database, "sources", "last_detected_codex_version", "TEXT");
    addColumnIfMissing(database, "sources", "last_detected_codex_at", "TEXT");
    addColumnIfMissing(database, "sources", "last_detection_error", "TEXT");
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(12, now);
  });

  applyMigration();
}

/**
 * Adds an archive marker to cached threads.
 *
 * The Codex app-server exposes archived threads through a separate list
 * filter. Persisting the flag keeps active and archived cache reads separate.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
function applySchemaMigrationV13(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(13);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    addColumnIfMissing(database, "threads", "is_archived", "INTEGER NOT NULL DEFAULT 0");
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(13, now);
  });

  applyMigration();
}

/**
 * Adds local project tasks.
 *
 * Tasks are OpenCodexUI-local metadata. They are not synchronized with Codex or
 * external issue trackers.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
function applySchemaMigrationV14(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(14);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS project_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_project_tasks_project_status
        ON project_tasks(project_id, status, updated_at DESC);
    `);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(14, now);
  });

  applyMigration();
}

/**
 * Copies legacy source rows into the document-settings schema.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
function migrateLegacySources(database: BetterSqliteDatabase): void {
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
        command: normalizeNullableText(row.command),
        color: "blue",
        openFolderCommand: null,
        openFileCommand: null
      }),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }
}

/**
 * Adds a column when the table does not already contain it.
 *
 * @param database SQLite database connection.
 * @param tableName Table name.
 * @param columnName Column name.
 * @param definition SQLite column definition.
 *
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
