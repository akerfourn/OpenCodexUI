import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { addColumnIfMissing } from "./helpers.js";

/**
 * Persists structured Codex sub-agent source metadata on thread summaries.
 *
 * @param database SQLite database connection.
 * @returns Nothing.
 */
export function applySchemaMigrationV27(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(27);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    addColumnIfMissing(database, "threads", "sub_agent_source_json", "TEXT");
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(27, now);
  });

  applyMigration();
}
