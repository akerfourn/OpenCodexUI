import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import {
  createDefaultCustomSourceSettings,
  createDefaultLocalSourceSettings,
  serializeSourceSettings
} from "../sources/sourceSettings.js";

/**
 * Migrates source command columns into the JSON settings document.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
export function applySchemaMigrationV5(database: BetterSqliteDatabase): void {
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
