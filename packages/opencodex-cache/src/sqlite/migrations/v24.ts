import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/**
 * Adds source-scoped historical Codex rate-limit snapshots.
 *
 * Payloads remain serialized JSON so fields added by Codex can be retained
 * without requiring a migration for every upstream response change.
 *
 * @param database SQLite database connection.
 * @returns Nothing.
 */
export function applySchemaMigrationV24(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(24);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS usage_rate_limit_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        origin TEXT NOT NULL,
        reason TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_usage_rate_limit_snapshots_source_time
        ON usage_rate_limit_snapshots(source_id, observed_at, id);
    `);

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(24, now);
  });

  applyMigration();
}
