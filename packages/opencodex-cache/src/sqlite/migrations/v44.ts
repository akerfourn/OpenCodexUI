import type { Database } from "better-sqlite3";

/** Retains required conversation policy reloads across metadata relocation and restarts. */
export function applySchemaMigrationV44(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 44").get() !== undefined) return;
  database.transaction(() => {
    database.exec(`CREATE TABLE workspace_thread_relocations (
      thread_id TEXT PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE CASCADE,
      previous_path TEXT NOT NULL
    );`);
    database.prepare("INSERT INTO schema_migrations VALUES (44, ?)").run(new Date().toISOString());
  })();
}
