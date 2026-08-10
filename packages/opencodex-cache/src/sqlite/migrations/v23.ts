import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/**
 * Adds historical token usage snapshots and per-turn execution metadata.
 *
 * Both tables intentionally avoid cascading foreign keys. Turn and thread
 * cache rows can be replaced or deleted while usage history remains useful
 * for future statistics and deleted-chat accounting.
 *
 * @param database SQLite database connection.
 * @returns Nothing.
 */
export function applySchemaMigrationV23(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(23);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS thread_token_usage_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        total_total_tokens INTEGER NOT NULL,
        total_input_tokens INTEGER NOT NULL,
        total_cached_input_tokens INTEGER NOT NULL,
        total_output_tokens INTEGER NOT NULL,
        total_reasoning_output_tokens INTEGER NOT NULL,
        last_total_tokens INTEGER NOT NULL,
        last_input_tokens INTEGER NOT NULL,
        last_cached_input_tokens INTEGER NOT NULL,
        last_output_tokens INTEGER NOT NULL,
        last_reasoning_output_tokens INTEGER NOT NULL,
        model_context_window INTEGER,
        model TEXT,
        reasoning_effort TEXT,
        service_tier TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_token_usage_snapshots_thread_time
        ON thread_token_usage_snapshots(source_id, thread_id, observed_at, id);
      CREATE INDEX IF NOT EXISTS idx_token_usage_snapshots_turn_time
        ON thread_token_usage_snapshots(source_id, thread_id, turn_id, observed_at, id);

      CREATE TABLE IF NOT EXISTS turn_execution_metadata (
        source_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        requested_model TEXT,
        effective_model TEXT,
        requested_reasoning_effort TEXT,
        effective_reasoning_effort TEXT,
        service_tier TEXT,
        first_observed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(source_id, thread_id, turn_id)
      );

      CREATE INDEX IF NOT EXISTS idx_turn_execution_metadata_thread
        ON turn_execution_metadata(source_id, thread_id, turn_id);
    `);

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(23, now);
  });

  applyMigration();
}
