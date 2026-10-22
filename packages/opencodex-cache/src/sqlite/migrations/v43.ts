import type { Database } from "better-sqlite3";

/** Journals physical removals and prevents conflicting executions or identity changes. */
export function applySchemaMigrationV43(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 43").get() !== undefined) return;
  database.transaction(() => {
    database.exec(`
      ALTER TABLE project_workspaces ADD COLUMN compose_used INTEGER NOT NULL DEFAULT 0 CHECK(compose_used IN (0, 1));
      CREATE TABLE workspace_removals (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL UNIQUE REFERENCES project_workspaces(id) ON DELETE RESTRICT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        source_id TEXT NOT NULL,
        primary_workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE RESTRICT,
        project_path TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        repository_path TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('preparing', 'submitting', 'uncertain')),
        git_exit_code INTEGER,
        UNIQUE(source_id, repository_path)
      );
      CREATE TRIGGER protect_removal_execution BEFORE INSERT ON workspace_execution_reservations
      WHEN EXISTS (SELECT 1 FROM workspace_removals WHERE workspace_id = NEW.workspace_id)
      BEGIN SELECT RAISE(ABORT, 'Workspace has a pending removal.'); END;
      CREATE TRIGGER protect_removal_transition BEFORE INSERT ON workspace_transitions
      WHEN EXISTS (SELECT 1 FROM workspace_removals
        WHERE workspace_id IN (NEW.from_workspace_id, NEW.to_workspace_id))
      BEGIN SELECT RAISE(ABORT, 'Workspace has a pending removal.'); END;
      CREATE TRIGGER protect_removal_creation BEFORE INSERT ON workspace_creations
      WHEN EXISTS (SELECT 1 FROM workspace_removals
        WHERE source_id = NEW.source_id AND repository_path = NEW.repository_path)
      BEGIN SELECT RAISE(ABORT, 'Repository has a pending workspace removal.'); END;
      CREATE TRIGGER protect_creation_removal BEFORE INSERT ON workspace_removals
      WHEN EXISTS (SELECT 1 FROM workspace_creations
        WHERE source_id = NEW.source_id AND repository_path = NEW.repository_path)
      BEGIN SELECT RAISE(ABORT, 'Repository has a pending workspace creation.'); END;
      CREATE TRIGGER protect_removal_workspace BEFORE UPDATE OF path, source_id, source_key, project_id, removed_at
      ON project_workspaces
      WHEN (NEW.path IS NOT OLD.path OR NEW.source_id IS NOT OLD.source_id
        OR NEW.source_key IS NOT OLD.source_key OR NEW.project_id IS NOT OLD.project_id
        OR NEW.removed_at IS NOT OLD.removed_at)
        AND EXISTS (SELECT 1 FROM workspace_removals
          WHERE workspace_id = OLD.id OR primary_workspace_id = OLD.id
            OR (source_id = NEW.source_id AND workspace_path = NEW.path))
      BEGIN SELECT RAISE(ABORT, 'Workspace has a pending removal.'); END;
      CREATE TRIGGER protect_removal_path BEFORE INSERT ON project_workspaces
      WHEN EXISTS (SELECT 1 FROM workspace_removals
        WHERE source_id = NEW.source_id AND workspace_path = NEW.path)
      BEGIN SELECT RAISE(ABORT, 'Workspace path has a pending removal.'); END;
      CREATE TRIGGER protect_removal_thread BEFORE UPDATE OF current_workspace_id ON threads
      WHEN NEW.current_workspace_id IS NOT OLD.current_workspace_id AND EXISTS
        (SELECT 1 FROM workspace_removals WHERE workspace_id IN (NEW.current_workspace_id, OLD.current_workspace_id))
      BEGIN SELECT RAISE(ABORT, 'Workspace has a pending removal.'); END;
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (43, ?)").run(new Date().toISOString());
  })();
}
