import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/**
 * Creates the initial cache schema.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
export function applySchemaMigrationV1(database: BetterSqliteDatabase): void {
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
}
