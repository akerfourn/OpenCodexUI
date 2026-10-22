import type { Database } from "better-sqlite3";
import { normalizeProjectPath } from "../../projectIdentity.js";

/** Retained fields needed by atomic path publication, independently of filesystem validation. */
interface RelocationWorkspace { path: string; projectId: string; sourceId: string | null; isPrimary: number }

/** Shares alias, compatibility-path and conversation-reload updates with verified physical moves. */
export function relocateWorkspace(database: Database, workspaceId: string, path: string, expectedPath?: string): void {
  const normalizedPath = normalizeProjectPath(path);
  if (normalizedPath === null) {
    throw new Error("Workspace path is required.");
  }
  database.transaction(() => {
    const workspace = readAvailableWorkspace(database, workspaceId);
    if (database.prepare("SELECT id FROM workspace_execution_reservations WHERE workspace_id = ?")
      .get(workspaceId) !== undefined) throw new Error("Workspace has a reserved or active execution.");
    if (expectedPath !== undefined && workspace.path !== expectedPath) {
      throw new Error("Workspace path changed during relocation. Reload before retrying.");
    }
    if (database.prepare(`SELECT id FROM workspace_transitions
      WHERE from_workspace_id = ? OR to_workspace_id = ?`).get(workspaceId, workspaceId) !== undefined) {
      throw new Error("Workspace has an unresolved transition.");
    }
    if (database.prepare(`SELECT id FROM workspace_creations WHERE project_id = ?`)
      .get(workspace.projectId) !== undefined) {
      throw new Error("Project has a pending creation. Reconcile it before relocation.");
    }
    const owners = database.prepare(`SELECT id, path FROM project_workspaces
      WHERE source_id IS ? AND removed_at IS NULL AND id != ?`)
      .all(workspace.sourceId, workspaceId) as { id: string; path: string }[];
    const key = (value: string): string => value.startsWith("/") ? value : value.toLowerCase();
    if (owners.some(owner => key(owner.path) === key(normalizedPath))) {
      throw new Error("Another workspace already owns this source path.");
    }
    if (workspace.path === normalizedPath) {
      return;
    }
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO workspace_path_aliases
      (workspace_id, path, valid_from, valid_until)
      VALUES (?, ?, COALESCE((SELECT MAX(valid_until) FROM workspace_path_aliases
        WHERE workspace_id = ?), (SELECT created_at FROM projects WHERE id = ?)), ?)`)
      .run(workspaceId, workspace.path, workspaceId, workspace.projectId, now);
    database.prepare("UPDATE project_workspaces SET path = ? WHERE id = ?")
      .run(normalizedPath, workspaceId);
    if (workspace.isPrimary) {
      database.prepare("UPDATE projects SET path = ?, updated_at = ? WHERE id = ?")
        .run(normalizedPath, now, workspace.projectId);
    }
    database.prepare(`INSERT INTO workspace_thread_relocations (thread_id, workspace_id, previous_path)
      SELECT id, current_workspace_id, ? FROM threads WHERE current_workspace_id = ?
      ON CONFLICT(thread_id) DO UPDATE SET workspace_id = excluded.workspace_id,
        previous_path = excluded.previous_path`).run(workspace.path, workspaceId);
    database.prepare("UPDATE threads SET cwd = ? WHERE current_workspace_id = ?")
      .run(normalizedPath, workspaceId);
  })();
}

/** Requires a live identity without an outstanding physical lifecycle operation. */
function readAvailableWorkspace(database: Database, workspaceId: string): RelocationWorkspace {
  const workspace = database.prepare(`SELECT path, project_id AS projectId, source_id AS sourceId, is_primary AS isPrimary
    FROM project_workspaces WHERE id = ? AND removed_at IS NULL`).get(workspaceId) as RelocationWorkspace | undefined;
  if (workspace === undefined) throw new Error("Workspace is unavailable.");
  if (workspace.sourceId === null) throw new Error("Workspace has no execution source or has been removed.");
  if (database.prepare("SELECT id FROM workspace_removals WHERE workspace_id = ?").get(workspaceId) !== undefined) {
    throw new Error("Workspace has a pending removal.");
  }
  if (database.prepare("SELECT id FROM workspace_moves WHERE workspace_id = ?").get(workspaceId) !== undefined) {
    throw new Error("Workspace has a pending move.");
  }
  return workspace;
}
