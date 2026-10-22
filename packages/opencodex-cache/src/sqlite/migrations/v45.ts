import type { Database } from "better-sqlite3";

/** Normalizes Windows source keys without weakening case-sensitive POSIX ownership. */
function pathKey(column: string): string {
  return `(CASE WHEN substr(${column}, 1, 1) = '/' THEN ${column} ELSE lower(replace(${column}, '/', char(92))) END)`;
}

/** Journals physical moves and excludes conflicting use, ownership and repository mutations. */
export function applySchemaMigrationV45(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 45").get() !== undefined) return;
  database.transaction(() => {
    database.exec(`
      CREATE TABLE workspace_moves (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL UNIQUE REFERENCES project_workspaces(id) ON DELETE RESTRICT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        source_id TEXT NOT NULL,
        primary_workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE RESTRICT,
        project_path TEXT NOT NULL, workspace_path TEXT NOT NULL, destination_path TEXT NOT NULL,
        repository_path TEXT NOT NULL, git_directory TEXT NOT NULL, root_path TEXT,
        expected_head TEXT NOT NULL, expected_branch TEXT,
        state TEXT NOT NULL CHECK(state IN ('preparing', 'submitting', 'uncertain')),
        git_exit_code INTEGER,
        UNIQUE(source_id, repository_path), UNIQUE(source_id, destination_path)
      );
      CREATE TRIGGER protect_move_execution BEFORE INSERT ON workspace_execution_reservations
      WHEN EXISTS (SELECT 1 FROM workspace_moves WHERE workspace_id = NEW.workspace_id)
      BEGIN SELECT RAISE(ABORT, 'Workspace has a pending move.'); END;
      CREATE TRIGGER protect_move_transition BEFORE INSERT ON workspace_transitions
      WHEN EXISTS (SELECT 1 FROM workspace_moves WHERE workspace_id IN (NEW.from_workspace_id, NEW.to_workspace_id))
      BEGIN SELECT RAISE(ABORT, 'Workspace has a pending move.'); END;
      CREATE TRIGGER protect_move_thread BEFORE UPDATE OF current_workspace_id ON threads
      WHEN NEW.current_workspace_id IS NOT OLD.current_workspace_id AND EXISTS
        (SELECT 1 FROM workspace_moves WHERE workspace_id IN (NEW.current_workspace_id, OLD.current_workspace_id))
      BEGIN SELECT RAISE(ABORT, 'Workspace has a pending move.'); END;
      CREATE TRIGGER protect_move_workspace BEFORE UPDATE OF path, source_id, source_key, project_id, removed_at ON project_workspaces
      WHEN (NEW.path IS NOT OLD.path OR NEW.source_id IS NOT OLD.source_id OR NEW.source_key IS NOT OLD.source_key
        OR NEW.project_id IS NOT OLD.project_id OR NEW.removed_at IS NOT OLD.removed_at)
        AND EXISTS (SELECT 1 FROM workspace_moves WHERE workspace_id = OLD.id OR primary_workspace_id = OLD.id
          OR (source_id = NEW.source_id AND ${pathKey("NEW.path")} IN (${pathKey("workspace_path")}, ${pathKey("destination_path")})))
      BEGIN SELECT RAISE(ABORT, 'Workspace has a pending move.'); END;
      CREATE TRIGGER protect_move_path BEFORE INSERT ON project_workspaces
      WHEN EXISTS (SELECT 1 FROM workspace_moves WHERE source_id = NEW.source_id
        AND ${pathKey("NEW.path")} IN (${pathKey("workspace_path")}, ${pathKey("destination_path")}))
      BEGIN SELECT RAISE(ABORT, 'Workspace path has a pending move.'); END;
      CREATE TRIGGER protect_move_identity BEFORE INSERT ON workspace_moves
      WHEN NOT EXISTS (SELECT 1 FROM project_workspaces w JOIN project_workspaces p ON p.id = NEW.primary_workspace_id
        WHERE w.id = NEW.workspace_id AND w.project_id = NEW.project_id AND w.source_id = NEW.source_id
          AND w.path = NEW.workspace_path AND w.is_primary = 0 AND w.managed = 1 AND w.removed_at IS NULL
          AND p.project_id = NEW.project_id AND p.source_id = NEW.source_id AND p.path = NEW.project_path
          AND p.is_primary = 1 AND p.removed_at IS NULL)
        OR EXISTS (SELECT 1 FROM workspace_execution_reservations WHERE workspace_id = NEW.workspace_id)
        OR EXISTS (SELECT 1 FROM workspace_transitions WHERE NEW.workspace_id IN (from_workspace_id, to_workspace_id))
        OR EXISTS (SELECT 1 FROM project_workspaces WHERE source_id = NEW.source_id AND removed_at IS NULL
          AND ${pathKey("path")} = ${pathKey("NEW.destination_path")})
      BEGIN SELECT RAISE(ABORT, 'Move identity is unavailable, occupied or reserved.'); END;
      CREATE TRIGGER protect_move_repository BEFORE INSERT ON workspace_moves
      WHEN EXISTS (SELECT 1 FROM workspace_moves WHERE source_id = NEW.source_id
        AND (${pathKey("repository_path")} = ${pathKey("NEW.repository_path")}
          OR ${pathKey("destination_path")} = ${pathKey("NEW.destination_path")}))
        OR EXISTS (SELECT 1 FROM workspace_creations WHERE source_id = NEW.source_id
          AND (project_id = NEW.project_id OR ${pathKey("repository_path")} = ${pathKey("NEW.repository_path")}
            OR ${pathKey("destination_path")} = ${pathKey("NEW.destination_path")}))
        OR EXISTS (SELECT 1 FROM workspace_removals WHERE source_id = NEW.source_id
          AND (project_id = NEW.project_id OR ${pathKey("repository_path")} = ${pathKey("NEW.repository_path")}
            OR ${pathKey("workspace_path")} = ${pathKey("NEW.destination_path")}))
      BEGIN SELECT RAISE(ABORT, 'Repository or destination has a pending lifecycle operation.'); END;
      CREATE TRIGGER protect_move_creation BEFORE INSERT ON workspace_creations
      WHEN EXISTS (SELECT 1 FROM workspace_moves WHERE source_id = NEW.source_id
        AND (project_id = NEW.project_id OR ${pathKey("repository_path")} = ${pathKey("NEW.repository_path")}
          OR ${pathKey("NEW.destination_path")} IN (${pathKey("destination_path")}, ${pathKey("workspace_path")})))
      BEGIN SELECT RAISE(ABORT, 'Repository or destination has a pending move.'); END;
      CREATE TRIGGER protect_move_removal BEFORE INSERT ON workspace_removals
      WHEN EXISTS (SELECT 1 FROM workspace_moves WHERE source_id = NEW.source_id
        AND (project_id = NEW.project_id OR ${pathKey("repository_path")} = ${pathKey("NEW.repository_path")}))
      BEGIN SELECT RAISE(ABORT, 'Repository has a pending move.'); END;
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (45, ?)").run(new Date().toISOString());
  })();
}
