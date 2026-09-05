import type { Database } from "better-sqlite3";

/** Persists execution reservations independently of turn snapshot synchronization. */
export function applySchemaMigrationV29(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 29").get() !== undefined) {
    return;
  }
  database.transaction(() => {
    database.exec(`
      CREATE TABLE workspace_execution_reservations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE RESTRICT,
        project_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        cwd TEXT NOT NULL,
        thread_id TEXT,
        turn_id TEXT,
        state TEXT NOT NULL CHECK(state IN
          ('preparing', 'submitting', 'running', 'uncertain', 'completed')),
        acknowledged INTEGER NOT NULL DEFAULT 0,
        UNIQUE(source_id, thread_id)
      );
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (29, ?)")
      .run(new Date().toISOString());
  })();
}
