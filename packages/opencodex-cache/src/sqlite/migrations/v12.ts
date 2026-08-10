import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { addColumnIfMissing } from "./helpers.js";

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
export function applySchemaMigrationV12(database: BetterSqliteDatabase): void {
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
