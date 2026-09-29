import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/** Retains presentation choices across message refreshes and deletes them with their thread. */
export function applySchemaMigrationV42(database: BetterSqliteDatabase): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 42").get() !== undefined) return;
  database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS message_rendering (
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        source_key TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        markdown INTEGER CHECK (markdown IN (0, 1)),
        math INTEGER CHECK (math IN (0, 1)),
        PRIMARY KEY (thread_id, source_key, turn_id, item_id)
      );
    `);
    database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (42, ?)")
      .run(new Date().toISOString());
  })();
}
