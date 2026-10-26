/** User-declared secondary work progress, independent of Git locks and physical availability. */
export type OpenCodexWorkspaceWorkStatus = "active" | "completed";

/** Reviewed secondary metadata; primary workspaces reject status updates. */
export interface OpenCodexWorkspaceWorkStatusInput {
  projectId: string;
  workspaceId: string;
  sourceId: string | null;
  workspacePath: string;
  workStatus: OpenCodexWorkspaceWorkStatus;
  expectedWorkStatus: OpenCodexWorkspaceWorkStatus;
  expectedCompletedAt: string | null;
}
