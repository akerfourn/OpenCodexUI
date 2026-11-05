/** Workspace label and source-local path captured when a transition is confirmed. */
export interface OpenCodexWorkspaceHistoryEndpoint {
  workspaceId: string;
  name: string | null;
  isPrimary: boolean;
  path: string;
}

/** A confirmed transition; older history is never inferred from changing paths. */
export interface OpenCodexWorkspaceTransitionEvent {
  id: string;
  threadId: string;
  projectId: string;
  sourceId: string;
  from: OpenCodexWorkspaceHistoryEndpoint;
  to: OpenCodexWorkspaceHistoryEndpoint;
  afterTurnId: string | null;
  occurredAt: string;
}
