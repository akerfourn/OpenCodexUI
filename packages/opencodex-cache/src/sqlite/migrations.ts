/**
 * Applies SQLite schema migrations for the cache database.
 */
import crypto from "node:crypto";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { createProjectIdentity } from "../projectIdentity.js";
import { DEFAULT_SOURCE_NAME, LEGACY_DEFAULT_SOURCE_ID } from "./constants.js";
import {
  createDefaultCustomSourceSettings,
  createDefaultLocalSourceSettings,
  normalizeNullableText,
  normalizeSourceColor,
  serializeSourceSettings
} from "./sourceSettings.js";

type ProjectMigrationRow = {
  id: string;
  source_id: string | null;
  path: string;
  default_name: string;
  display_name: string | null;
  is_hidden: number;
  preferences_json: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

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
          source_key TEXT NOT NULL DEFAULT 'orphan',
          path TEXT NOT NULL,
          default_name TEXT NOT NULL,
          display_name TEXT,
          is_hidden INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          UNIQUE(source_key, path)
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
  applySchemaMigrationV15(database);
  applySchemaMigrationV16(database);
  applySchemaMigrationV17(database);
  applySchemaMigrationV18(database);
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
        source_key TEXT NOT NULL DEFAULT 'orphan',
        path TEXT NOT NULL,
        default_name TEXT NOT NULL,
        display_name TEXT,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        UNIQUE(source_key, path)
      );

      INSERT INTO projects_next (
        id,
        source_id,
        source_key,
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
        CASE
          WHEN source_id IS NULL OR source_id = 'default' THEN 'orphan'
          ELSE source_id
        END,
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
 * Adds stable user-defined ordering to project commands.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
function applySchemaMigrationV15(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(15);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    addColumnIfMissing(database, "project_commands", "sort_order", "INTEGER");
    database.exec(`
      UPDATE project_commands
      SET sort_order = (
        SELECT COUNT(*)
        FROM project_commands AS earlier
        WHERE
          earlier.project_id = project_commands.project_id
          AND (
            earlier.created_at < project_commands.created_at
            OR (
              earlier.created_at = project_commands.created_at
              AND earlier.name <= project_commands.name
            )
          )
      ) - 1
      WHERE sort_order IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_commands_project_sort
        ON project_commands(project_id, sort_order ASC);
    `);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(15, now);
  });

  applyMigration();
}

/**
 * Makes project identity source-scoped instead of path-only.
 *
 * Projects with the same path can exist in different local, WSL, SSH, or custom
 * sources. The migration rewrites project ids and all known local references so
 * source-specific paths no longer collide.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
function applySchemaMigrationV16(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(16);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  database.pragma("foreign_keys = OFF");
  const applyMigration = database.transaction(() => {
    const projectRows = database
      .prepare(
        `
        SELECT
          id,
          source_id,
          path,
          default_name,
          display_name,
          is_hidden,
          preferences_json,
          created_at,
          updated_at,
          last_seen_at
        FROM projects
        `
      )
      .all() as ProjectMigrationRow[];

    database.exec(`
      DROP TABLE IF EXISTS project_id_migrations;
      DROP TABLE IF EXISTS projects_next;

      CREATE TEMP TABLE project_id_migrations (
        old_id TEXT PRIMARY KEY,
        new_id TEXT NOT NULL
      );

      CREATE TABLE projects_next (
        id TEXT PRIMARY KEY,
        source_id TEXT,
        source_key TEXT NOT NULL DEFAULT 'orphan',
        path TEXT NOT NULL,
        default_name TEXT NOT NULL,
        display_name TEXT,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        preferences_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        UNIQUE(source_key, path)
      );
    `);

    const insertProject = database.prepare(`
      INSERT INTO projects_next (
        id,
        source_id,
        source_key,
        path,
        default_name,
        display_name,
        is_hidden,
        preferences_json,
        created_at,
        updated_at,
        last_seen_at
      )
      VALUES (
        @id,
        @sourceId,
        @sourceKey,
        @path,
        @defaultName,
        @displayName,
        @isHidden,
        @preferencesJson,
        @createdAt,
        @updatedAt,
        @lastSeenAt
      )
      ON CONFLICT(source_key, path) DO UPDATE SET
        source_id = COALESCE(excluded.source_id, projects_next.source_id),
        default_name = excluded.default_name,
        display_name = COALESCE(projects_next.display_name, excluded.display_name),
        is_hidden = CASE
          WHEN excluded.is_hidden = 1 THEN 1
          ELSE projects_next.is_hidden
        END,
        preferences_json = COALESCE(projects_next.preferences_json, excluded.preferences_json),
        updated_at = MAX(projects_next.updated_at, excluded.updated_at),
        last_seen_at = MAX(projects_next.last_seen_at, excluded.last_seen_at)
    `);
    const insertMapping = database.prepare(`
      INSERT INTO project_id_migrations (old_id, new_id)
      VALUES (@oldId, @newId)
      ON CONFLICT(old_id) DO UPDATE SET new_id = excluded.new_id
    `);

    for (const row of projectRows) {
      const identity = createProjectIdentity(row.path, row.source_id);

      if (identity === null) {
        continue;
      }

      insertProject.run({
        id: identity.id,
        sourceId: row.source_id,
        sourceKey: identity.sourceKey,
        path: identity.path,
        defaultName: identity.defaultName,
        displayName: row.display_name,
        isHidden: row.is_hidden,
        preferencesJson: row.preferences_json,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastSeenAt: row.last_seen_at
      });
      insertMapping.run({
        oldId: row.id,
        newId: identity.id
      });
    }

    database.exec(`
      UPDATE threads
      SET project_id = (
        SELECT new_id FROM project_id_migrations WHERE old_id = threads.project_id
      )
      WHERE project_id IN (SELECT old_id FROM project_id_migrations);

      UPDATE project_commands
      SET project_id = (
        SELECT new_id FROM project_id_migrations WHERE old_id = project_commands.project_id
      )
      WHERE project_id IN (SELECT old_id FROM project_id_migrations);

      UPDATE project_tasks
      SET project_id = (
        SELECT new_id FROM project_id_migrations WHERE old_id = project_tasks.project_id
      )
      WHERE project_id IN (SELECT old_id FROM project_id_migrations);

      DROP TABLE projects;
      ALTER TABLE projects_next RENAME TO projects;

      CREATE INDEX IF NOT EXISTS idx_projects_source_path
        ON projects(source_id, path);
    `);

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(16, now);
  });

  applyMigration();
  database.pragma("foreign_keys = ON");
}

/**
 * Splits legacy local/custom command settings into explicit source kinds.
 *
 * Existing custom-command sources were stored as `kind = local` with a custom
 * command mode in settings. They keep local access enabled to preserve opener
 * behavior from previous versions.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
function applySchemaMigrationV17(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(17);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    const rows = database
      .prepare("SELECT id, kind, settings FROM sources")
      .all() as Array<{ id: string; kind: string; settings: string }>;
    const updateSource = database.prepare(`
      UPDATE sources SET
        kind = @kind,
        settings = @settings,
        updated_at = @updatedAt
      WHERE id = @id
    `);

    for (const row of rows) {
      const parsedSettings = parseSettingsObject(row.settings);

      if (parsedSettings.commandMode === "custom") {
        updateSource.run({
          id: row.id,
          kind: "custom",
          settings: serializeSourceSettings({
            commandMode: "custom",
            command: normalizeNullableText(readStringSetting(parsedSettings, "command")),
            hasLocalAccess: true,
            color: normalizeSourceColor(parsedSettings.color),
            openFolderCommand: normalizeNullableText(readStringSetting(parsedSettings, "openFolderCommand")),
            openFileCommand: normalizeNullableText(readStringSetting(parsedSettings, "openFileCommand"))
          }),
          updatedAt: now
        });
        continue;
      }

      if (row.kind === "local") {
        updateSource.run({
          id: row.id,
          kind: "local",
          settings: serializeSourceSettings({
            commandMode: "auto",
            command: null,
            color: normalizeSourceColor(parsedSettings.color),
            openFolderCommand: normalizeNullableText(readStringSetting(parsedSettings, "openFolderCommand")),
            openFileCommand: normalizeNullableText(readStringSetting(parsedSettings, "openFileCommand"))
          }),
          updatedAt: now
        });
      }
    }

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(17, now);
  });

  applyMigration();
}

/**
 * Adds thread ancestry metadata reported by Codex sub-agent sessions.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
function applySchemaMigrationV18(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(18);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    addColumnIfMissing(database, "threads", "session_id", "TEXT");
    addColumnIfMissing(database, "threads", "parent_thread_id", "TEXT");
    addColumnIfMissing(database, "threads", "thread_source", "TEXT");
    addColumnIfMissing(database, "threads", "agent_nickname", "TEXT");
    addColumnIfMissing(database, "threads", "agent_role", "TEXT");

    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_threads_parent_updated
        ON threads(parent_thread_id, updated_at DESC);
    `);

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(18, now);
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
    const settings = row.command_mode === "custom"
      ? createDefaultCustomSourceSettings(row.command)
      : createDefaultLocalSourceSettings();

    insertSource.run({
      id: row.id,
      kind: row.kind,
      name: row.name,
      settings: serializeSourceSettings(settings),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }
}

/**
 * Parses a JSON settings object for schema migration use.
 *
 * @param value Raw JSON settings string.
 * @returns Decoded object, or an empty object when invalid.
 */
function parseSettingsObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

/**
 * Reads one optional string setting from a decoded settings object.
 *
 * @param settings Decoded settings object.
 * @param key Setting key.
 * @returns String value, or `null`.
 */
function readStringSetting(settings: Record<string, unknown>, key: string): string | null {
  const value = settings[key];
  return typeof value === "string" ? value : null;
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
