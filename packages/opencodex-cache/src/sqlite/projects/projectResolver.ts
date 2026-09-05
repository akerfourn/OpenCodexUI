import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import { createProjectIdentity } from "../../projectIdentity.js";
import { ensureProjectTreeItem } from "./projectGroupQueries.js";

/** Stored identity resolved from an active workspace or a known thread. */
export interface ResolvedProject {
  /** Persisted logical project identity. */
  id: string;
  /** Explicit owner, nullable for orphan projects. */
  sourceId: string | null;
  /** Workspace path retained for legacy callers. */
  path: string;
  /** Stable physical context association. */
  workspaceId: string;
}

/** Resolves stable associations before creating a new project and primary workspace. */
export function resolveProject(
  database: Database,
  projectPath: string,
  sourceId: string | null,
  threadId: string | null = null,
  isHidden = false
): ResolvedProject | null {
  if (threadId !== null) {
    const known = database.prepare(`
      SELECT p.id, w.source_id AS sourceId, w.path, w.id AS workspaceId
      FROM threads t JOIN project_workspaces w ON w.id = t.current_workspace_id
      JOIN projects p ON p.id = w.project_id
      WHERE t.id = ? AND w.source_id IS ?
    `).get(threadId, sourceId) as ResolvedProject | undefined;
    if (known !== undefined) {
      refreshProject(database, known.id, isHidden);
      return known;
    }
  }
  const identity = createProjectIdentity(projectPath, sourceId);
  if (identity === null) {
    return null;
  }
  const matches = database.prepare(`
    SELECT project_id AS id, source_id AS sourceId, path, id AS workspaceId
    FROM project_workspaces
    WHERE (source_id = ? OR (? IS NULL AND source_id IS NULL AND source_key = 'orphan'))
      AND path = ? AND removed_at IS NULL
  `).all(sourceId, sourceId, identity.path) as ResolvedProject[];
  if (matches.length > 1) {
    throw new Error("Multiple projects own this source path; explicit reconciliation is required.");
  }
  const existing = matches[0];
  if (existing !== undefined) {
    refreshProject(database, existing.id, isHidden);
    return existing;
  }
  const id = randomUUID();
  const workspaceId = randomUUID();
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO projects (id, source_id, source_key, path, default_name,
      is_hidden, created_at, updated_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sourceId, identity.sourceKey, identity.path, identity.defaultName,
    Number(isHidden), now, now, now);
  database.prepare(`
    INSERT INTO project_workspaces (id, project_id, source_id, source_key, path, is_primary)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(workspaceId, id, sourceId, identity.sourceKey, identity.path);
  ensureProjectTreeItem(database, id);
  return { id, sourceId, path: identity.path, workspaceId };
}

/** Refreshes observed metadata without replacing the project's stable identity or path. */
function refreshProject(database: Database, projectId: string, isHidden: boolean): void {
  database.prepare(`UPDATE projects SET last_seen_at = ?,
    is_hidden = CASE WHEN ? = 1 THEN 1 ELSE is_hidden END WHERE id = ?`)
    .run(new Date().toISOString(), Number(isHidden), projectId);
}
