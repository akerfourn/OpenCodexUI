import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/**
 * Adds source-aware normalized collaboration event persistence.
 *
 * The table intentionally has no source or thread foreign keys. Collaboration
 * events can arrive before their thread index and must remain readable when a
 * source or parent thread is temporarily unavailable.
 *
 * @param database SQLite database connection.
 * @returns Nothing.
 */
export function applySchemaMigrationV26(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(26);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS collaboration_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        turn_id TEXT,
        call_id TEXT,
        action TEXT NOT NULL,
        tool_name TEXT,
        sender_thread_id TEXT,
        sender_agent_path TEXT,
        receiver_thread_ids_json TEXT NOT NULL,
        receiver_agent_paths_json TEXT NOT NULL,
        prompt TEXT,
        result TEXT,
        task_name TEXT,
        model TEXT,
        reasoning_effort TEXT,
        agent_role TEXT,
        fork_turns_json TEXT,
        status TEXT NOT NULL,
        target_agent_statuses_json TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        first_observed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(source_id, id)
      );

      CREATE INDEX IF NOT EXISTS idx_collaboration_events_source_observed
        ON collaboration_events(source_id, first_observed_at, sequence);
      CREATE INDEX IF NOT EXISTS idx_collaboration_events_source_thread
        ON collaboration_events(source_id, thread_id, first_observed_at, sequence);
      CREATE INDEX IF NOT EXISTS idx_collaboration_events_source_sender
        ON collaboration_events(source_id, sender_thread_id, first_observed_at, sequence);
      CREATE INDEX IF NOT EXISTS idx_collaboration_events_source_call
        ON collaboration_events(source_id, call_id);
    `);

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(26, now);
  });

  applyMigration();
}
