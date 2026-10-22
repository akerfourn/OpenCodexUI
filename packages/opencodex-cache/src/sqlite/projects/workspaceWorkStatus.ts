import type { Database } from "better-sqlite3";
import type { OpenCodexWorkspaceWorkStatusInput } from "@open-codex-ui/opencodex-protocol";

/** Updates only the reviewed work progress, preserving dates on repeated confirmations. */
export function updateWorkspaceWorkStatus(database: Database, input: OpenCodexWorkspaceWorkStatusInput): void {
  if ((input.workStatus !== "active" && input.workStatus !== "completed")
    || (input.expectedWorkStatus !== "active" && input.expectedWorkStatus !== "completed")) {
    throw new Error("Unsupported workspace work status.");
  }
  const row = database.prepare(`SELECT work_status AS workStatus, completed_at AS completedAt
    FROM project_workspaces w WHERE id = ? AND project_id = ? AND source_id IS ? AND path = ?
      AND removed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM workspace_removals WHERE workspace_id = w.id)
      AND NOT EXISTS (SELECT 1 FROM workspace_moves WHERE workspace_id = w.id)`)
    .get(input.workspaceId, input.projectId, input.sourceId, input.workspacePath) as
      { workStatus: string; completedAt: string | null } | undefined;
  if (row === undefined) throw new Error("Workspace context changed, was removed or has pending maintenance. Refresh the workspace.");
  // A lost response may be retried without moving the completion date forward.
  if (row.workStatus === input.workStatus) return;
  if (row.workStatus !== input.expectedWorkStatus || row.completedAt !== input.expectedCompletedAt) {
    throw new Error("Workspace work status changed. Refresh it before trying again.");
  }
  let completedAt: string | null = null;
  if (input.workStatus === "completed") completedAt = new Date().toISOString();
  database.prepare("UPDATE project_workspaces SET work_status = ?, completed_at = ? WHERE id = ?")
    .run(input.workStatus, completedAt, input.workspaceId);
}
