import type { Database } from "better-sqlite3";
import type { OpenCodexWorkspaceActivity } from "@open-codex-ui/opencodex-protocol";

/** Includes historical turn locations without attributing a moved thread's later turns to its old checkout. */
export function readWorkspaceActivity(database: Database, projectId: string): OpenCodexWorkspaceActivity[] {
  return database.prepare(`
    WITH owned AS (
      SELECT id, project_id, source_id, path FROM project_workspaces WHERE project_id = ?
    ), conversations AS (
      SELECT t.id, t.current_workspace_id AS workspace_id, t.updated_at, t.status
      FROM threads t JOIN owned w ON w.id = t.current_workspace_id
      WHERE t.project_id = w.project_id AND t.source_id IS w.source_id
    ), events AS (
      SELECT workspace_id, updated_at AS happened_at FROM conversations
      UNION ALL
      SELECT c.workspace_id, t.started_at FROM turn_workspace_contexts c
      JOIN owned w ON w.id = c.workspace_id AND w.project_id = c.project_id
      JOIN turns t ON t.thread_id = c.thread_id AND t.id = c.turn_id
      UNION ALL
      SELECT c.workspace_id, t.completed_at FROM turn_workspace_contexts c
      JOIN owned w ON w.id = c.workspace_id AND w.project_id = c.project_id
      JOIN turns t ON t.thread_id = c.thread_id AND t.id = c.turn_id
    ), activity AS (
      SELECT workspace_id, MAX(julianday(happened_at)) AS last_activity FROM events GROUP BY workspace_id
    ), counts AS (
      SELECT workspace_id, COUNT(*) AS conversation_count,
        SUM(CASE WHEN status IN ('active', 'running', 'inProgress', 'in_progress') THEN 1 ELSE 0 END) AS active_count
      FROM conversations GROUP BY workspace_id
    )
    SELECT w.id AS workspaceId, w.source_id AS sourceId, w.path AS workspacePath,
      strftime('%Y-%m-%dT%H:%M:%fZ', a.last_activity) AS lastActivityAt,
      COALESCE(c.conversation_count, 0) AS conversationCount,
      COALESCE(c.active_count, 0) AS activeConversationCount,
      (SELECT COUNT(*) FROM workspace_execution_reservations r WHERE r.workspace_id = w.id)
        + (SELECT COUNT(*) FROM workspace_transitions x WHERE x.from_workspace_id = w.id OR x.to_workspace_id = w.id)
        AS pendingOperationCount
    FROM owned w LEFT JOIN activity a ON a.workspace_id = w.id
      LEFT JOIN counts c ON c.workspace_id = w.id ORDER BY w.id
  `).all(projectId) as OpenCodexWorkspaceActivity[];
}
