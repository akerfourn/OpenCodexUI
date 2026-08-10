import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { addColumnIfMissing } from "./helpers.js";

/**
 * Adds persisted project group colors to databases created before the color
 * setting was introduced.
 *
 * @param database SQLite database connection.
 * @returns Nothing.
 */
export function applySchemaMigrationV22(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(22);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    addColumnIfMissing(database, "project_groups", "color", "TEXT NOT NULL DEFAULT 'blue'");

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(22, now);
  });

  applyMigration();
}
