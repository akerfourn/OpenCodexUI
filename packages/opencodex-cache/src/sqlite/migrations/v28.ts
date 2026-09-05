import type { Database } from "better-sqlite3";
import { addColumnIfMissing } from "./helpers.js";

/** Adds primary workspaces without rewriting historical project identifiers. */
export function applySchemaMigrationV28(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 28").get() !== undefined) {
    return;
  }
  database.transaction(() => {
    database.exec(`
      CREATE TABLE project_workspaces (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_id TEXT,
        source_key TEXT NOT NULL,
        path TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0, 1)),
        managed INTEGER NOT NULL DEFAULT 0 CHECK(managed IN (0, 1)),
        removed_at TEXT
      );
      CREATE UNIQUE INDEX idx_workspace_active_path
        ON project_workspaces(source_key, path) WHERE removed_at IS NULL;
      CREATE UNIQUE INDEX idx_workspace_primary
        ON project_workspaces(project_id) WHERE is_primary = 1 AND removed_at IS NULL;
      CREATE TABLE workspace_path_aliases (
        id INTEGER PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        valid_until TEXT NOT NULL
      );
      INSERT INTO project_workspaces (id, project_id, source_id, source_key, path, is_primary)
        SELECT 'primary:' || id, id, source_id, source_key, path, 1 FROM projects;
    `);
    addColumnIfMissing(database, "threads", "current_workspace_id",
      "TEXT REFERENCES project_workspaces(id) ON DELETE SET NULL");
    database.exec(`
      UPDATE threads SET current_workspace_id = (
        SELECT id FROM project_workspaces AS w
        WHERE w.project_id = threads.project_id AND w.path = threads.cwd
          AND w.source_id IS threads.source_id AND w.is_primary = 1
      );
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (28, ?)")
      .run(new Date().toISOString());
  })();
}
