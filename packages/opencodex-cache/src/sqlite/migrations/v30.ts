import type { Database } from "better-sqlite3";

/** Retains execution evidence independently of mutable snapshots and workspace paths. */
export function applySchemaMigrationV30(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 30").get() !== undefined) {
    return;
  }
  database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS turn_workspace_contexts (
        source_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        cwd TEXT NOT NULL,
        PRIMARY KEY (thread_id, turn_id)
      );
      CREATE INDEX IF NOT EXISTS turn_workspace_contexts_thread
        ON turn_workspace_contexts(thread_id);
      CREATE TRIGGER IF NOT EXISTS delete_thread_workspace_contexts
        AFTER DELETE ON threads BEGIN
          DELETE FROM turn_workspace_contexts WHERE thread_id = OLD.id;
        END;
      INSERT OR IGNORE INTO turn_workspace_contexts
        (source_id, thread_id, turn_id, project_id, workspace_id, cwd)
        SELECT source_id, thread_id, turn_id, project_id, workspace_id, cwd
        FROM workspace_execution_reservations
        WHERE thread_id IS NOT NULL AND turn_id IS NOT NULL;
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (30, ?)")
      .run(new Date().toISOString());
  })();
}
