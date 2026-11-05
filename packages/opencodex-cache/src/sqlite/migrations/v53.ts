import type { Database } from "better-sqlite3";

/** Retains only future verified transitions; no historical changes are guessed during migration. */
export function applySchemaMigrationV53(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 53").get() !== undefined) return;
  database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS workspace_transition_history (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        event_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS workspace_transition_history_thread
        ON workspace_transition_history(thread_id, sequence);
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (53, ?)").run(new Date().toISOString());
  })();
}
