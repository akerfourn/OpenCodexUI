import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/**
 * Creates the source-scoped model capability cache.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
export function applySchemaMigrationV19(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(19);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS model_catalogs (
        source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
        models_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(19, now);
  });

  applyMigration();
}
