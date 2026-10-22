/** Live Git metadata; absence of a fetched state must never be interpreted as unlocked. */
export interface OpenCodexWorkspaceLockState {
  /** Stable workspace identity and source-native path verified by the backend. */
  workspaceId: string;
  /** Source whose Git metadata supplied this snapshot. */
  sourceId: string;
  workspacePath: string;
  /** False for the principal or Git's main checkout, which cannot be locked. */
  supported: boolean;
  /** Null means unlocked; an empty string means locked without a reason. */
  lockedReason: string | null;
}

/** Explicit operation and the exact Git state reviewed by the user. */
export interface OpenCodexWorkspaceLockInput {
  /** Logical owner, stable checkout and filesystem source. */
  projectId: string;
  workspaceId: string;
  sourceId: string;
  /** Prevents a stale dialog from changing a relocated checkout. */
  workspacePath: string;
  /** Requested native Git lock state. */
  locked: boolean;
  /** Exact previous reason, including null and empty-string distinctions. */
  expectedReason: string | null;
  /** Optional new lock reason; never used to replace an existing lock. */
  reason?: string;
}
