import type { Database } from "better-sqlite3";
import { addColumnIfMissing } from "./helpers.js";

/** Canonicalizes source paths only for comparison, preserving case sensitivity on POSIX sources. */
function key(value: string): string {
  return `(CASE WHEN substr(${value},1,1)='/' THEN rtrim(${value},'/') ELSE lower(rtrim(replace(${value},'/',char(92)),char(92))) END)`;
}

/** Reserves whole endpoint subtrees in both directions, without SQL wildcard interpretation. */
function overlaps(value: string, root: string): string {
  const separator = `(CASE WHEN substr(${root},1,1)='/' THEN '/' ELSE char(92) END)`;
  return `(${key(value)} = ${key(root)} OR instr(${key(value)}, ${key(root)} || ${separator}) = 1
    OR instr(${key(root)}, ${key(value)} || ${separator}) = 1)`;
}

/** Extends the existing move journal with project-wide reservations for principal-directory moves. */
export function applySchemaMigrationV48(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 48").get() !== undefined) return;
  database.transaction(() => {
    addColumnIfMissing(database, "workspace_moves", "primary_snapshot", "TEXT CHECK(primary_snapshot IS NULL OR json_valid(primary_snapshot))");
    database.exec(`
      DROP TRIGGER protect_move_identity;
      CREATE TRIGGER protect_move_identity BEFORE INSERT ON workspace_moves
      WHEN NOT EXISTS (SELECT 1 FROM project_workspaces w JOIN project_workspaces p ON p.id = NEW.primary_workspace_id
        WHERE w.id = NEW.workspace_id AND w.project_id = NEW.project_id AND w.source_id = NEW.source_id
          AND w.path = NEW.workspace_path AND w.removed_at IS NULL
          AND ((NEW.primary_snapshot IS NULL AND w.is_primary = 0 AND w.managed = 1)
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

      CREATE TRIGGER IF NOT EXISTS protect_primary_move_execution BEFORE INSERT ON workspace_execution_reservations
      WHEN EXISTS (SELECT 1 FROM workspace_moves m JOIN project_workspaces w ON w.project_id = m.project_id
        WHERE m.primary_snapshot IS NOT NULL AND w.id = NEW.workspace_id)
      BEGIN SELECT RAISE(ABORT, 'Project has a pending primary move.'); END;
      CREATE TRIGGER IF NOT EXISTS protect_primary_move_transition BEFORE INSERT ON workspace_transitions
      WHEN EXISTS (SELECT 1 FROM workspace_moves m JOIN project_workspaces w ON w.project_id = m.project_id
        WHERE m.primary_snapshot IS NOT NULL AND w.id IN (NEW.from_workspace_id, NEW.to_workspace_id))
      BEGIN SELECT RAISE(ABORT, 'Project has a pending primary move.'); END;
      CREATE TRIGGER IF NOT EXISTS protect_primary_move_thread BEFORE UPDATE OF current_workspace_id ON threads
      WHEN NEW.current_workspace_id IS NOT OLD.current_workspace_id AND EXISTS
        (SELECT 1 FROM workspace_moves m JOIN project_workspaces w ON w.project_id = m.project_id
          WHERE m.primary_snapshot IS NOT NULL AND w.id IN (OLD.current_workspace_id, NEW.current_workspace_id))
      BEGIN SELECT RAISE(ABORT, 'Project has a pending primary move.'); END;
      CREATE TRIGGER IF NOT EXISTS protect_primary_move_workspace BEFORE UPDATE OF path, source_id, source_key, project_id, removed_at ON project_workspaces
      WHEN EXISTS (SELECT 1 FROM workspace_moves WHERE primary_snapshot IS NOT NULL AND project_id = OLD.project_id)
        AND (NEW.path IS NOT OLD.path OR NEW.source_id IS NOT OLD.source_id OR NEW.project_id IS NOT OLD.project_id
          OR NEW.source_key IS NOT OLD.source_key OR NEW.removed_at IS NOT OLD.removed_at)
      BEGIN SELECT RAISE(ABORT, 'Project has a pending primary move.'); END;
      CREATE TRIGGER IF NOT EXISTS protect_primary_move_catalog BEFORE INSERT ON project_workspaces
      WHEN EXISTS (SELECT 1 FROM workspace_moves WHERE primary_snapshot IS NOT NULL
        AND (project_id = NEW.project_id OR (source_id = NEW.source_id
          AND (${overlaps("NEW.path", "workspace_path")} OR ${overlaps("NEW.path", "destination_path")}))))
      BEGIN SELECT RAISE(ABORT, 'Project has a pending primary move.'); END;
      CREATE TRIGGER IF NOT EXISTS protect_primary_move_foreign_path BEFORE UPDATE OF path, source_id ON project_workspaces
      WHEN (NEW.path IS NOT OLD.path OR NEW.source_id IS NOT OLD.source_id) AND EXISTS
        (SELECT 1 FROM workspace_moves WHERE primary_snapshot IS NOT NULL AND source_id = NEW.source_id
          AND (${overlaps("NEW.path", "workspace_path")} OR ${overlaps("NEW.path", "destination_path")}))
      BEGIN SELECT RAISE(ABORT, 'Project path has a pending primary move.'); END;
      CREATE TRIGGER IF NOT EXISTS protect_primary_move_delete BEFORE DELETE ON project_workspaces
      WHEN EXISTS (SELECT 1 FROM workspace_moves WHERE primary_snapshot IS NOT NULL AND project_id = OLD.project_id)
      BEGIN SELECT RAISE(ABORT, 'Project has a pending primary move.'); END;
      CREATE TRIGGER IF NOT EXISTS protect_primary_move_operation BEFORE INSERT ON workspace_moves
      WHEN EXISTS (SELECT 1 FROM workspace_moves WHERE project_id = NEW.project_id
        AND (NEW.primary_snapshot IS NOT NULL OR primary_snapshot IS NOT NULL))
      BEGIN SELECT RAISE(ABORT, 'Project has a pending move.'); END;
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (48, ?)").run(new Date().toISOString());
  })();
}
