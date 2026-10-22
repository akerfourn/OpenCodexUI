/** User-declared work progress, independent of Git locks and physical availability. */
export type OpenCodexWorkspaceWorkStatus = "active" | "completed";

/** Fixed metadata snapshot used to reject updates from an obsolete workspace view. */
export interface OpenCodexWorkspaceWorkStatusInput {
  projectId: string;
  workspaceId: string;
  sourceId: string | null;
  workspacePath: string;
  workStatus: OpenCodexWorkspaceWorkStatus;
  expectedWorkStatus: OpenCodexWorkspaceWorkStatus;
  expectedCompletedAt: string | null;
}
