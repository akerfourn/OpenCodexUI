import type { Database } from "better-sqlite3";

/** Extends durable reservations to catalog mutations without rewriting their identities. */
export function applySchemaMigrationV34(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 34").get() !== undefined) {
    return;
  }
  database.transaction(() => {
    database.exec(`
      CREATE TABLE workspace_execution_reservations_v34 (
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
        operation TEXT NOT NULL DEFAULT 'turn' CHECK(operation IN
          ('turn', 'review', 'compact', 'rollback', 'archive', 'unarchive', 'delete')),
        UNIQUE(source_id, thread_id)
      );
      INSERT INTO workspace_execution_reservations_v34
        SELECT id, workspace_id, project_id, source_id, cwd, thread_id,
          turn_id, state, acknowledged, operation FROM workspace_execution_reservations;
      DROP TABLE workspace_execution_reservations;
      ALTER TABLE workspace_execution_reservations_v34 RENAME TO workspace_execution_reservations;
      CREATE TRIGGER protect_transition_execution BEFORE INSERT ON workspace_execution_reservations
      WHEN EXISTS (SELECT 1 FROM workspace_transitions WHERE thread_id = NEW.thread_id
        OR from_workspace_id = NEW.workspace_id OR to_workspace_id = NEW.workspace_id)
      BEGIN SELECT RAISE(ABORT, 'Workspace has an unresolved transition.'); END;
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (34, ?)").run(new Date().toISOString());
  })();
}
