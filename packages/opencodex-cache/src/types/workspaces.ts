import type { WorkspaceCreationRepository } from "./workspaceCreations.js";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceExecutionContext, OpenCodexTurnWorkspaceContext, OpenCodexWorkspaceDiscoverySkipped } from
  "@open-codex-ui/opencodex-protocol";
import type { WorkspaceTransitionRepository } from "./workspaceTransitions.js";

/** Durable reservation retained across transport failures and application restarts. */
export interface WorkspaceExecutionReservation extends OpenCodexWorkspaceExecutionContext {
  /** Maintenance guards do not establish immutable user-turn execution evidence. */
  operation: "turn" | "review" | "compact" | "rollback" | "archive" | "unarchive" | "delete";
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
  /** Durable creation journal and publication of secondary workspaces. */
  readonly creations: WorkspaceCreationRepository;
  /** Registers verified external paths atomically, without taking ownership or merging projects. */
  registerDiscovered(primaryWorkspaceId: string, sourceId: string, primaryPath: string,
    paths: string[]): Promise<OpenCodexWorkspaceDiscoverySkipped[]>;
  /** Separate durable state for changes of a thread's execution context. */
  readonly transitions: WorkspaceTransitionRepository;
  /** Reads immutable execution evidence, including turns removed by rollback. */
  listTurnContexts(threadId: string): Promise<OpenCodexTurnWorkspaceContext[]>;
  /** Lists a project's catalogue, including logically removed workspaces. */
  list(projectId: string): Promise<OpenCodexProjectWorkspace[]>;
  /** Renames an available secondary workspace of the explicit project. */
  rename(projectId: string, workspaceId: string, name: string): Promise<void>;
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
  reserve(workspaceId: string, threadId: string | null,
    operation?: WorkspaceExecutionReservation["operation"]): Promise<WorkspaceExecutionReservation>;
  /** Acknowledges maintenance acceptance; async work remains reserved through matching completion. */
  acknowledgeMaintenance(reservationId: string, turnId?: string): Promise<void>;
  /** Binds a newly created thread before submitting its first turn. */
  bindThread(reservationId: string, threadId: string): Promise<void>;
  /** Journals a new-thread dispatch before Codex has returned its identity. */
  submittingCreation(reservationId: string): Promise<void>;
  /** Releases creation only after its returned thread is persisted in the reserved checkout. */
  confirmCreation(reservationId: string, threadId: string): Promise<void>;
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
  /** Finds a blocker even after deletion of its cached thread. */
  getReservationForThread(threadId: string): Promise<WorkspaceExecutionReservation | null>;
  /** Records a successful delete response before local cleanup. */
  confirmDeletion(reservationId: string): Promise<void>;
  /** Reads durable positive deletion evidence, never inferred from absence. */
  isDeletionConfirmed(reservationId: string): Promise<boolean>;
  /** Releases a reservation only after the caller has reconciled the source state. */
  release(reservationId: string): Promise<void>;
}
