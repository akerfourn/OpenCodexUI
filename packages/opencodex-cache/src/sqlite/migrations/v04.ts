import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/**
 * Rebuilds projects to remove implicit legacy default associations.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
export function applySchemaMigrationV4(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(4);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  database.pragma("foreign_keys = OFF");
  const applyMigration = database.transaction(() => {
    database.exec(`
      DROP TABLE IF EXISTS projects_next;

      CREATE TABLE IF NOT EXISTS projects_next (
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

      INSERT INTO projects_next (
        id,
        source_id,
        source_key,
        path,
        default_name,
        display_name,
        is_hidden,
        created_at,
        updated_at,
        last_seen_at
      )
      SELECT
        id,
        CASE WHEN source_id = 'default' THEN NULL ELSE source_id END,
        CASE
          WHEN source_id IS NULL OR source_id = 'default' THEN 'orphan'
          ELSE source_id
        END,
        path,
        default_name,
        display_name,
        0,
        created_at,
        updated_at,
        last_seen_at
      FROM projects;

      DROP TABLE projects;
      ALTER TABLE projects_next RENAME TO projects;
      UPDATE projects SET source_id = NULL WHERE source_id = 'default';
      UPDATE threads SET source_id = NULL WHERE source_id = 'default';
    `);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(4, now);
  });

  applyMigration();
  database.pragma("foreign_keys = ON");
}
