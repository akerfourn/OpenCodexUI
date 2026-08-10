import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { addColumnIfMissing } from "./helpers.js";

/**
 * Adds thread ancestry metadata reported by Codex sub-agent sessions.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
export function applySchemaMigrationV18(database: BetterSqliteDatabase): void {
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
