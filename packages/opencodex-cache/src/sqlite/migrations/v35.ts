import type { Database } from "better-sqlite3";

/** Reserves repository creation and destination ownership before Git mutates them. */
export function applySchemaMigrationV35(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 35").get() !== undefined) {
    return;
  }
  database.transaction(() => {
    database.exec(`
      CREATE TABLE workspace_creations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        source_id TEXT NOT NULL,
        primary_workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE RESTRICT,
        project_path TEXT NOT NULL,
        repository_path TEXT NOT NULL,
        destination_path TEXT NOT NULL,
        start_json TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('preparing', 'submitting', 'uncertain')),
        expected_head TEXT,
        expected_branch TEXT,
        git_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(git_confirmed IN (0, 1)),
        UNIQUE(source_id, repository_path),
        UNIQUE(source_id, destination_path),
        CHECK(state = 'preparing' OR expected_head IS NOT NULL)
      );
      CREATE TRIGGER protect_creation_destination BEFORE INSERT ON project_workspaces
      WHEN EXISTS (SELECT 1 FROM workspace_creations
        WHERE source_id = NEW.source_id AND destination_path = NEW.path)
      BEGIN SELECT RAISE(ABORT, 'Workspace path has a pending creation.'); END;
      CREATE TRIGGER protect_creation_workspace BEFORE UPDATE OF path, source_id, source_key, project_id, removed_at
      ON project_workspaces
      WHEN (NEW.path IS NOT OLD.path OR NEW.source_id IS NOT OLD.source_id
        OR NEW.source_key IS NOT OLD.source_key OR NEW.project_id IS NOT OLD.project_id
        OR NEW.removed_at IS NOT OLD.removed_at) AND EXISTS
        (SELECT 1 FROM workspace_creations WHERE primary_workspace_id = OLD.id
          OR (source_id = NEW.source_id AND destination_path = NEW.path))
      BEGIN SELECT RAISE(ABORT, 'Workspace has a pending creation.'); END;
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (35, ?)").run(new Date().toISOString());
  })();
}
