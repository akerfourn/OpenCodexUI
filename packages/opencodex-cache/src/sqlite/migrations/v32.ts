import type { Database } from "better-sqlite3";

/** Stores workspace transitions separately from turn reservations and protects both locations. */
export function applySchemaMigrationV32(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 32").get() !== undefined) {
    return;
  }
  database.transaction(() => {
    database.exec(`
      CREATE TABLE workspace_transitions (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL UNIQUE REFERENCES threads(id) ON DELETE RESTRICT,
        project_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        from_workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE RESTRICT,
        to_workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE RESTRICT,
        from_path TEXT NOT NULL,
        to_path TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('preparing', 'submitting', 'uncertain')),
        expectation_json TEXT,
        CHECK(state = 'preparing' OR expectation_json IS NOT NULL)
      );
      CREATE TRIGGER protect_transition_execution BEFORE INSERT ON workspace_execution_reservations
      WHEN EXISTS (SELECT 1 FROM workspace_transitions WHERE thread_id = NEW.thread_id
        OR from_workspace_id = NEW.workspace_id OR to_workspace_id = NEW.workspace_id)
      BEGIN SELECT RAISE(ABORT, 'Workspace has an unresolved transition.'); END;
      CREATE TRIGGER protect_transition_workspace BEFORE UPDATE OF path, source_id, source_key, project_id, removed_at
      ON project_workspaces
      WHEN (NEW.path IS NOT OLD.path OR NEW.source_id IS NOT OLD.source_id
        OR NEW.source_key IS NOT OLD.source_key OR NEW.project_id IS NOT OLD.project_id
        OR NEW.removed_at IS NOT OLD.removed_at) AND EXISTS
        (SELECT 1 FROM workspace_transitions WHERE from_workspace_id = OLD.id OR to_workspace_id = OLD.id)
      BEGIN SELECT RAISE(ABORT, 'Workspace has an unresolved transition.'); END;
      CREATE TRIGGER protect_transition_thread BEFORE UPDATE OF current_workspace_id, cwd, source_id, project_id
      ON threads
      WHEN (NEW.current_workspace_id IS NOT OLD.current_workspace_id OR NEW.cwd IS NOT OLD.cwd
        OR NEW.source_id IS NOT OLD.source_id OR NEW.project_id IS NOT OLD.project_id)
        AND EXISTS (SELECT 1 FROM workspace_transitions WHERE thread_id = OLD.id)
      BEGIN SELECT RAISE(ABORT, 'Thread has an unresolved workspace transition.'); END;
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (32, ?)").run(new Date().toISOString());
  })();
}
