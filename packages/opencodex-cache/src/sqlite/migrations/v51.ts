import type { Database } from "better-sqlite3";

/** Adds opt-in observation baselines without inventing activity for existing workspaces. */
export function applySchemaMigrationV51(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 51").get() !== undefined) return;
  database.transaction(() => {
    database.exec(`CREATE TABLE IF NOT EXISTS workspace_change_observations (
      workspace_id TEXT PRIMARY KEY REFERENCES project_workspaces(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL, source_id TEXT NOT NULL, workspace_path TEXT NOT NULL,
      fingerprint TEXT NOT NULL CHECK(length(fingerprint) = 64),
      checked_at TEXT NOT NULL, last_changed_at TEXT,
      has_changes INTEGER NOT NULL CHECK(has_changes IN (0, 1))
    )`);
    database.prepare("INSERT INTO schema_migrations VALUES (51, ?)").run(new Date().toISOString());
  })();
}
