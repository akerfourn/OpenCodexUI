/** Cached Codex activity, distinct from source filesystem modification or verified inactivity. */
export interface OpenCodexWorkspaceActivity {
  workspaceId: string;
  sourceId: string | null;
  workspacePath: string;
  /** Most recent valid cached conversation or correlated turn timestamp, or unknown. */
  lastActivityAt: string | null;
  /** Current associations include archived conversations and sub-agents. */
  conversationCount: number;
  activeConversationCount: number;
  /** Durable executions and transitions remain blockers even when their thread was deleted. */
  pendingOperationCount: number;
  /** Last persisted filesystem observation, readable offline and never implicitly refreshed. */
  changes?: import("./workspaceChanges.js").OpenCodexWorkspaceChanges;
}
