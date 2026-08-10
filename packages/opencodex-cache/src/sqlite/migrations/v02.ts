import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { addColumnIfMissing } from "./helpers.js";

/**
 * Adds custom and Codex title columns to cached threads.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
export function applySchemaMigrationV2(database: BetterSqliteDatabase): void {
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
