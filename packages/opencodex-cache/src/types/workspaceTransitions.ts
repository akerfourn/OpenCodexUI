/** Durable transition snapshots; expectationJson belongs to the backend RPC adapter. */
export interface WorkspaceTransitionRecord {
  /** Opaque operation identity. */
  id: string;
  /** Thread whose association remains unchanged until commit. */
  threadId: string;
  /** Logical project shared by both workspaces. */
  projectId: string;
  /** Source owning both physical paths. */
  sourceId: string;
  /** Original workspace protected until resolution. */
  fromWorkspaceId: string;
  /** Requested workspace protected until resolution. */
  toWorkspaceId: string;
  /** Captured original source-local path. */
  fromPath: string;
  /** Captured destination source-local path. */
  toPath: string;
  /** Preparation is cancellable; other states require verified remote recovery. */
  state: "preparing" | "submitting" | "uncertain";
  /** Frozen expected remote context, absent before first dispatch. */
  expectationJson: string | null;
}

/** Atomic transition lifecycle, isolated from turn notification handling. */
export interface WorkspaceTransitionRepository {
  /** Reserves both locations and retains the original thread association. */
  begin(threadId: string, workspaceId: string): Promise<WorkspaceTransitionRecord>;
  /** Reads the unresolved operation for explicit recovery. */
  getForThread(threadId: string): Promise<WorkspaceTransitionRecord | null>;
  /** Lists transitions touching a location for workspace-level recovery. */
  list(workspaceId: string): Promise<WorkspaceTransitionRecord[]>;
  /** Freezes the expectation before first dispatch or retries the identical contract explicitly. */
  submitting(id: string, expectationJson: string): Promise<void>;
  /** Cancels preparation or retains uncertainty after dispatch. */
  fail(id: string): Promise<void>;
  /** Atomically selects the verified destination and removes the blocker. */
  commit(id: string): Promise<void>;
}
