/** Source-owned physical context; principal role is independent of Git topology. */
export interface OpenCodexProjectWorkspace {
  /** Opaque stable workspace identifier. */
  id: string;
  /** Logical project owning this workspace. */
  projectId: string;
  /** Owning source, or null when its association has been removed. */
  sourceId: string | null;
  /** Absolute path in the owning source's filesystem. */
  path: string;
  /** Whether this is the project's principal workspace. */
  isPrimary: boolean;
  /** Whether OpenCodexUI created the physical checkout. */
  managed: boolean;
  /** Logical removal timestamp; physical availability is checked in the source. */
  removedAt: string | null;
}

/** Validated context captured before an execution crosses the RPC boundary. */
export interface OpenCodexWorkspaceExecutionContext {
  /** Logical project identifier. */
  projectId: string;
  /** Stable workspace identifier. */
  workspaceId: string;
  /** Explicit execution source. */
  sourceId: string;
  /** Immutable directory snapshot for this operation. */
  cwd: string;
}
