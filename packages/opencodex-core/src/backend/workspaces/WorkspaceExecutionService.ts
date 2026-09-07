import type { OpenCodexWorkspaceRoot } from "@open-codex-ui/opencodex-protocol";
import type { v2 } from "@open-codex-ui/codex-rpc";
import { WorkspaceDiscoveryService } from "./WorkspaceDiscoveryService.js";
import { WorkspaceCreationService } from "./WorkspaceCreationService.js";
import { WorkspaceCatalogRecovery, type PersistRecoveredArchive, type PersistRecoveredDeletion } from "./WorkspaceCatalogRecovery.js";
import path from "node:path";
import type { WorkspaceCacheRepository, WorkspaceExecutionReservation } from
  "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectWorkspace, OpenCodexTurnWorkspaceContext, OpenCodexWorkspaceCreateInput, OpenCodexWorkspaceCreation, OpenCodexWorkspaceDiscoveryResult } from
  "@open-codex-ui/opencodex-protocol";
import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import { readObject, readString } from "../../mapping.js";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { readThreadRuntimeStatus } from "../threads/threadRuntimeStatus.js";
import { WorkspaceSelectionService, type WorkspaceSelectionPreparation } from "./WorkspaceSelectionService.js";

/** Explicit input accepted while the transport still supports legacy paths. */
export interface WorkspaceExecutionInput {
  /** Existing thread or null for implicit creation. */
  threadId: string | null;
  /** Caller path, checked against the backend association when supplied. */
  projectPath: string | null;
  /** Caller source, checked against the backend association when supplied. */
  sourceId: string | null;
  /** Optional explicit identity for new clients. */
  workspaceId?: string | null;
}

/** Resolves and reserves source-owned contexts without relying on UI selection. */
export class WorkspaceExecutionService {
  /** Prevents an asynchronous selection/recovery from racing a local start. */
  private readonly busyThreads = new Set<string>();
  /** Counts local operations, including thread creation before an ID is known. */
  private readonly workspaceUsers = new Map<string, number>();
  /** Durable selections share this service's thread gate with turn starts and recovery. */
  private readonly selection: WorkspaceSelectionService;

  /** Discovers external checkouts without changing their ownership. */
  private readonly discovery: WorkspaceDiscoveryService;
  /** Creates managed checkouts through the durable repository journal. */
  private readonly creation: WorkspaceCreationService;
  /** Verifies catalog outcomes independently of turn lifecycle notifications. */
  private readonly catalogRecovery: WorkspaceCatalogRecovery;

  /** Shares persistence and source clients with the thread runtime. */
  constructor(
    private readonly repository: WorkspaceCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly onContext?: (context: OpenCodexTurnWorkspaceContext) => void,
    private readonly preparation?: WorkspaceSelectionPreparation,
    persistRecoveredArchive?: PersistRecoveredArchive,
    persistRecoveredDeletion?: PersistRecoveredDeletion,
    private readonly onSelected?: (threadId: string, cwd: string) => void,
    workspaceRoots: () => OpenCodexWorkspaceRoot[] = () => []
  ) {
    this.discovery = new WorkspaceDiscoveryService(repository, clients);
    this.creation = new WorkspaceCreationService(repository, clients, undefined, workspaceRoots);
    this.selection = new WorkspaceSelectionService(repository, clients, preparation);
    this.catalogRecovery = new WorkspaceCatalogRecovery(
      repository, clients, persistRecoveredArchive, persistRecoveredDeletion);
  }

  /** Validates a new conversation's explicit checkout and returns its primary for policy preparation. */
  async creationContext(workspaceId: string, projectPath: string | null, sourceId: string | null): Promise<{
    target: OpenCodexProjectWorkspace; primary: OpenCodexProjectWorkspace;
  }> {
    const target = await this.repository.get(workspaceId);
    if (target === null || target.removedAt !== null || target.sourceId !== sourceId || sourceId === null
      || (projectPath !== null && target.path !== projectPath)) {
      throw new Error("New conversation workspace does not match its requested source and path.");
    }
    const primary = (await this.repository.list(target.projectId)).find((item) => item.isPrimary);
    if (primary === undefined || primary.removedAt !== null || primary.sourceId !== sourceId) {
      throw new Error("The primary workspace is unavailable for conversation preparation.");
    }
    return { target, primary };
  }

  /** Creates directly in the selected checkout after policy preparation, never via an empty-thread resume. */
  async createThread<T extends { id: string }>(
    workspaceId: string, projectPath: string | null, sourceId: string | null,
    create: (parameters: Partial<v2.ThreadStartParams>) => Promise<T>
  ): Promise<T> {
    const context = await this.creationContext(workspaceId, projectPath, sourceId);
    return await this.run({ threadId: null, projectPath, sourceId, workspaceId }, async (reservation) => {
      let parameters: Partial<v2.ThreadStartParams> = {};
      if (!context.target.isPrimary) {
        if (this.preparation?.prepareCreation === undefined) throw new Error("Workspace preparation is unavailable.");
        parameters = await this.preparation.prepareCreation(reservation, context.primary);
      }
      await this.repository.submittingCreation(reservation.id);
      const thread = await create(parameters);
      await this.repository.confirmCreation(reservation.id, thread.id);
      return thread;
    });
  }

  /** Updates local display metadata without changing the source execution context. */
  async rename(projectId: string, workspaceId: string, name: string): Promise<void> {
    await this.repository.rename(projectId, workspaceId, name);
  }

  /** Lists the catalogue independently of source connectivity. */
  async list(projectId: string): Promise<OpenCodexProjectWorkspace[]> {
    return await this.repository.list(projectId);
  }

  /** Refreshes external Git entries under an explicit project and source. */
  async discover(projectId: string, sourceId: string): Promise<OpenCodexWorkspaceDiscoveryResult> {
    return await this.discovery.discover(projectId, sourceId);
  }

  /** Creates a secondary workspace from explicit project/source intent. */
  async create(input: OpenCodexWorkspaceCreateInput): Promise<OpenCodexProjectWorkspace> {
    return await this.creation.create(input);
  }

  /** Lists pending creation operations independently of source connectivity. */
  async pendingCreations(projectId: string): Promise<OpenCodexWorkspaceCreation[]> {
    return await this.creation.pending(projectId);
  }

  /** Verifies a confirmed checkout or cancels undispatched preparation. */
  async reconcileCreation(creationId: string): Promise<OpenCodexProjectWorkspace | null> {
    return await this.creation.reconcile(creationId);
  }

  /** Holds a thread gate and durable workspace reservation through the RPC response. */
  async run<T>(
    input: WorkspaceExecutionInput,
    action: (reservation: WorkspaceExecutionReservation) => Promise<T>,
    operation: WorkspaceExecutionReservation["operation"] = "turn"
  ): Promise<T> {
    return await this.withThread(input.threadId, async () => {
      const workspace = await this.resolve(input);
      this.workspaceUsers.set(workspace.id, (this.workspaceUsers.get(workspace.id) ?? 0) + 1);
      try {
        const reservation = await this.repository.reserve(workspace.id, input.threadId, operation);
        try {
          const client = await this.clients.ensureClient(reservation.sourceId);
          const metadata = await client.getMetadata(reservation.cwd);
          if (!metadata.isDirectory) {
            throw new Error("Workspace path is not an available directory.");
          }
          if (input.threadId !== null) {
            await this.requireIdle(reservation.sourceId, input.threadId);
          }
          return await action(reservation);
        } catch (error) {
          await this.repository.fail(reservation.id);
          throw error;
        }
      } finally {
        const remaining = (this.workspaceUsers.get(workspace.id) ?? 1) - 1;
        if (remaining === 0) {
          this.workspaceUsers.delete(workspace.id);
        } else {
          this.workspaceUsers.set(workspace.id, remaining);
        }
      }
    });
  }

  /** Serializes maintenance with selections and keeps ambiguous/async work durably reserved. */
  async runMaintenance<T>(
    input: WorkspaceExecutionInput,
    operation: "review" | "compact" | "rollback",
    action: (context: WorkspaceExecutionReservation) => Promise<{ value: T; turnId?: string }>
  ): Promise<T> {
    return await this.run(input, async (reservation) => {
      await this.repository.submitting(reservation.id);
      const result = await action(reservation);
      await this.repository.acknowledgeMaintenance(reservation.id, result.turnId);
      return result.value;
    }, operation);
  }

  /** Prevents catalog mutations from overtaking local work or persisted recovery. */
  async runCatalogMutation<T>(
    threadId: string,
    operation: "archive" | "unarchive" | "delete",
    action: (beforeDispatch: () => Promise<void>, confirmDeletion: () => Promise<void>) => Promise<T>
  ): Promise<T> {
    return await this.withThread(threadId, async () => {
      if (await this.repository.transitions.getForThread(threadId) !== null) {
        throw new Error("Reconcile the workspace transition before changing the thread catalog.");
      }
      const workspace = await this.repository.getForThread(threadId);
      if (workspace !== null) {
        const reservations = await this.repository.listReservations(workspace.id);
        if (reservations.some((reservation) => reservation.threadId === threadId)) {
          throw new Error("Thread has a pending workspace execution; wait or reconcile it first.");
        }
      }
      if (workspace === null) {
        throw new Error("Synchronize the thread before changing its catalog state.");
      }
      const reservation = await this.repository.reserve(workspace.id, threadId, operation);
      try {
        const result = await action(
          () => this.repository.submitting(reservation.id),
          () => this.repository.confirmDeletion(reservation.id));
        await this.repository.release(reservation.id);
        return result;
      } catch (error) {
        await this.repository.fail(reservation.id);
        throw error;
      }
    });
  }

  /** Binds an implicitly created thread before any turn-start effect. */
  async bind(reservation: WorkspaceExecutionReservation, threadId: string): Promise<void> {
    await this.repository.bindThread(reservation.id, threadId);
    reservation.threadId = threadId;
  }

  /** Records dispatch before sending a start request. */
  async submitting(reservation: WorkspaceExecutionReservation): Promise<void> {
    await this.repository.submitting(reservation.id);
  }

  /** Confirms the response while preserving any earlier completion event. */
  async acknowledge(reservation: WorkspaceExecutionReservation, turnId: string): Promise<void> {
    if (turnId.length === 0) {
      throw new Error("Codex returned no turn id; workspace execution requires reconciliation.");
    }
    await this.repository.acknowledge(reservation.id, turnId);
    const contexts = await this.repository.listTurnContexts(reservation.threadId ?? "");
    for (const context of contexts) {
      if (context.turnId === turnId) {
        this.onContext?.(context);
      }
    }
  }

  /** Refreshes loaded metadata only after the durable association is committed. */
  private async publishSelection(threadId: string): Promise<void> {
    const workspace = await this.repository.getForThread(threadId);
    if (workspace !== null) this.onSelected?.(threadId, workspace.path);
  }

  /** Validates and serializes an internal selection; UI exposure remains deferred. */
  async select(threadId: string, workspaceId: string): Promise<void> {
    await this.withThread(threadId, async () => {
      const current = await this.repository.getForThread(threadId);
      if (current?.sourceId === null || current === null) {
        throw new Error("Thread has no source-owned workspace.");
      }
      await this.requireIdle(current.sourceId, threadId);
      await this.selection.select(threadId, workspaceId);
      await this.publishSelection(threadId);
    });
  }

  /** Reconciles a persisted blocker explicitly after a failed or interrupted start. */
  async reconcile(threadId: string): Promise<void> {
    await this.withThread(threadId, async () => {
      if (await this.selection.reconcile(threadId)) {
        await this.publishSelection(threadId);
        return;
      }
      const pending = await this.repository.getReservationForThread(threadId);
      if (pending !== null && await this.catalogRecovery.recover(pending)) {
        return;
      }
      const workspace = await this.repository.getForThread(threadId);
      if (workspace?.sourceId === null || workspace === null) {
        throw new Error("Thread has no source-owned workspace.");
      }
      const reservations = await this.repository.listReservations(workspace.id);
      await this.requireIdle(workspace.sourceId, threadId);
      for (const reservation of reservations) {
        if (reservation.threadId === threadId && reservation.sourceId === workspace.sourceId) {
          await this.repository.release(reservation.id);
        }
      }
    });
  }

  /** Recovers interrupted thread creation as well as bound thread reservations. */
  async reconcileWorkspace(workspaceId: string): Promise<void> {
    if (this.workspaceUsers.has(workspaceId)) {
      throw new Error("Workspace has a local execution operation in progress.");
    }
    for (const transition of await this.repository.transitions.list(workspaceId)) {
      await this.reconcile(transition.threadId);
    }
    const reservations = await this.repository.listReservations(workspaceId);
    for (const reservation of reservations) {
      if (reservation.threadId === null && reservation.state === "preparing") {
        await this.repository.release(reservation.id);
      } else if (reservation.threadId !== null) {
        await this.reconcile(reservation.threadId);
      } else {
        throw new Error("Unbound dispatched execution cannot be reconciled automatically.");
      }
    }
  }

  /** Processes lifecycle notifications with the source identity supplied by transport. */
  async observe(notification: CodexNotification, sourceId: string): Promise<void> {
    if (notification.method !== "turn/started" && notification.method !== "turn/completed") {
      return;
    }
    const params = readObject(notification.params);
    const threadId = readString(params.threadId);
    const turnId = readString(readObject(params.turn).id);
    if (threadId.length > 0 && turnId.length > 0) {
      await this.repository.observeTurn(sourceId, threadId, turnId,
        notification.method === "turn/completed");
      for (const context of await this.repository.listTurnContexts(threadId)) {
        if (context.sourceId === sourceId && context.turnId === turnId) {
          this.onContext?.(context);
        }
      }
    }
  }

  /** Validates caller hints against persisted identity and rejects silent reassignment. */
  private async resolve(input: WorkspaceExecutionInput): Promise<OpenCodexProjectWorkspace> {
    let workspace = input.threadId === null ? null : await this.repository.getForThread(input.threadId);
    if (input.threadId !== null && workspace === null) {
      throw new Error("Open and synchronize the thread before starting a workspace execution.");
    }
    if (input.workspaceId !== undefined && input.workspaceId !== null) {
      if (workspace !== null && workspace.id !== input.workspaceId) {
        throw new Error("Select the thread workspace before starting a turn.");
      }
      workspace = await this.repository.get(input.workspaceId);
      if (workspace === null) {
        throw new Error("Workspace does not exist.");
      }
    }
    const requestedPath = input.projectPath === null ? null : normalizeSourcePath(input.projectPath);
    if (workspace === null) {
      if (requestedPath === null || input.sourceId === null) {
        throw new Error("New workspace executions require an explicit path and source.");
      }
      workspace = await this.repository.resolvePath(requestedPath, input.sourceId);
    }
    if (workspace.sourceId === null || workspace.removedAt !== null) {
      throw new Error("Workspace has no execution source or has been removed.");
    }
    if (input.sourceId !== null && workspace.sourceId !== input.sourceId) {
      throw new Error("Requested source does not own this workspace.");
    }
    if (requestedPath !== null && requestedPath !== normalizeSourcePath(workspace.path)) {
      throw new Error("Requested path does not match the thread workspace; refresh the project.");
    }
    return workspace;
  }

  /** Checks live status; unavailable or unknown sources never imply inactivity. */
  private async requireIdle(sourceId: string, threadId: string): Promise<void> {
    const client = await this.clients.ensureClient(sourceId);
    const response = await client.readThread(threadId, false);
    const status = readThreadRuntimeStatus(readObject(response.thread).status);
    if (status !== "idle" && status !== "notLoaded") {
      throw new Error("Thread is active or its execution status is unknown.");
    }
  }

  /** Rejects concurrent local operations before their first asynchronous boundary. */
  private async withThread<T>(threadId: string | null, action: () => Promise<T>): Promise<T> {
    if (threadId === null) {
      return await action();
    }
    if (this.busyThreads.has(threadId)) {
      throw new Error("Thread already has a workspace operation in progress.");
    }
    this.busyThreads.add(threadId);
    try {
      return await action();
    } finally {
      this.busyThreads.delete(threadId);
    }
  }
}

/** Normalizes absolute source paths without resolving relative paths on the host. */
function normalizeSourcePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) {
    return path.posix.normalize(trimmed);
  }
  if (/^[a-zA-Z]:[\\/]/u.test(trimmed) || trimmed.startsWith("\\\\")) {
    return path.win32.normalize(trimmed);
  }
  throw new Error("Workspace path must be absolute in its source filesystem.");
}
