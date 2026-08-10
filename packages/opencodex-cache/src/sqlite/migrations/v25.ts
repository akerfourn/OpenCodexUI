import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/**
 * Adds the source-wide index needed by usage history queries.
 *
 * @param database SQLite database connection.
 * @returns Nothing.
 */
export function applySchemaMigrationV25(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(25);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_token_usage_snapshots_source_time
        ON thread_token_usage_snapshots(source_id, observed_at, id);
    `);

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(25, now);
  });

  applyMigration();
}
