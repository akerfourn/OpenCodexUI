import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceExecutionContext } from
  "@open-codex-ui/opencodex-protocol";

/** Durable reservation retained across transport failures and application restarts. */
export interface WorkspaceExecutionReservation extends OpenCodexWorkspaceExecutionContext {
  /** Opaque request identifier for completion and failure correlation. */
  id: string;
  /** Bound thread, null while creating a new thread. */
  threadId: string | null;
  /** Server turn identifier once observed. */
  turnId: string | null;
  /** Preparing can be cancelled safely; uncertain must be reconciled explicitly. */
  state: "preparing" | "submitting" | "running" | "uncertain" | "completed";
}

/** Workspace identity and execution persistence; no filesystem operations. */
export interface WorkspaceCacheRepository {
  /** Lists a project's catalogue, including logically removed workspaces. */
  list(projectId: string): Promise<OpenCodexProjectWorkspace[]>;
  /** Reads a workspace by opaque identity. */
  get(workspaceId: string): Promise<OpenCodexProjectWorkspace | null>;
  /** Finds the current stable association of a known thread. */
  getForThread(threadId: string): Promise<OpenCodexProjectWorkspace | null>;
  /** Resolves or creates a primary workspace at an explicitly source-local path. */
  resolvePath(path: string, sourceId: string): Promise<OpenCodexProjectWorkspace>;
  /** Selects a same-project/source workspace when no execution is reserved. */
  select(threadId: string, workspaceId: string): Promise<void>;
  /** Updates a verified physical location and compatibility paths atomically. */
  relocate(workspaceId: string, path: string): Promise<void>;
  /** Reserves an execution atomically against selection and relocation. */
  reserve(workspaceId: string, threadId: string | null): Promise<WorkspaceExecutionReservation>;
  /** Binds a newly created thread before submitting its first turn. */
  bindThread(reservationId: string, threadId: string): Promise<void>;
  /** Records the start of a potentially ambiguous external effect. */
  submitting(reservationId: string): Promise<void>;
  /** Acknowledges the turn response without losing early completion notifications. */
  acknowledge(reservationId: string, turnId: string): Promise<void>;
  /** Records started/completed notifications only for the reserved source and thread. */
  observeTurn(sourceId: string, threadId: string, turnId: string, completed: boolean): Promise<void>;
  /** Cancels preparation or preserves an uncertain dispatched operation. */
  fail(reservationId: string): Promise<void>;
  /** Lists unresolved executions for recovery and lifecycle guards. */
  listReservations(workspaceId: string): Promise<WorkspaceExecutionReservation[]>;
  /** Releases a reservation only after the caller has reconciled the source state. */
  release(reservationId: string): Promise<void>;
}
