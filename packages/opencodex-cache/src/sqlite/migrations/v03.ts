import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { DEFAULT_SOURCE_NAME, LEGACY_DEFAULT_SOURCE_ID } from "../constants.js";
import {
  createDefaultLocalSourceSettings,
  serializeSourceSettings
} from "../sourceSettings.js";
import { addColumnIfMissing } from "./helpers.js";

/**
 * Creates the sources table and legacy default source.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
export function applySchemaMigrationV3(database: BetterSqliteDatabase): void {
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
