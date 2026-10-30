import type { Database } from "better-sqlite3";

/** Allows explicit movement of imported secondaries without changing ownership or other lifecycle guards. */
export function applySchemaMigrationV50(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 50").get() !== undefined) return;
  database.transaction(() => {
    database.exec(`
      DROP TRIGGER protect_move_identity;
      CREATE TRIGGER protect_move_identity BEFORE INSERT ON workspace_moves
      WHEN NOT EXISTS (SELECT 1 FROM project_workspaces w JOIN project_workspaces p ON p.id = NEW.primary_workspace_id
        WHERE w.id = NEW.workspace_id AND w.project_id = NEW.project_id AND w.source_id = NEW.source_id
          AND w.path = NEW.workspace_path AND w.removed_at IS NULL
          AND ((NEW.primary_snapshot IS NULL AND w.is_primary = 0)
            OR (NEW.primary_snapshot IS NOT NULL AND w.is_primary = 1 AND w.id = p.id))
          AND p.project_id = NEW.project_id AND p.source_id = NEW.source_id AND p.path = NEW.project_path
          AND p.is_primary = 1 AND p.removed_at IS NULL)
        OR EXISTS (SELECT 1 FROM workspace_execution_reservations r JOIN project_workspaces w ON w.id = r.workspace_id
          WHERE w.id = NEW.workspace_id OR (NEW.primary_snapshot IS NOT NULL AND w.project_id = NEW.project_id))
        OR EXISTS (SELECT 1 FROM workspace_transitions t JOIN project_workspaces w
          ON w.id IN (t.from_workspace_id, t.to_workspace_id)
          WHERE w.id = NEW.workspace_id OR (NEW.primary_snapshot IS NOT NULL AND w.project_id = NEW.project_id))
        OR EXISTS (SELECT 1 FROM project_workspaces WHERE source_id = NEW.source_id AND removed_at IS NULL
          AND (CASE WHEN substr(path,1,1)='/' THEN path ELSE lower(replace(path,'/',char(92))) END)
            = (CASE WHEN substr(NEW.destination_path,1,1)='/' THEN NEW.destination_path ELSE lower(replace(NEW.destination_path,'/',char(92))) END))
      BEGIN SELECT RAISE(ABORT, 'Move identity is unavailable, occupied or reserved.'); END;
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (50, ?)").run(new Date().toISOString());
  })();
}
