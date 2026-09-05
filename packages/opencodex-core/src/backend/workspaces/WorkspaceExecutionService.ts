import path from "node:path";
import type { WorkspaceCacheRepository, WorkspaceExecutionReservation } from
  "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectWorkspace, OpenCodexTurnWorkspaceContext } from
  "@open-codex-ui/opencodex-protocol";
import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import { readObject, readString } from "../../mapping.js";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { readThreadRuntimeStatus } from "../threads/threadRuntimeStatus.js";

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

  /** Shares persistence and source clients with the thread runtime. */
  constructor(
    private readonly repository: WorkspaceCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly onContext?: (context: OpenCodexTurnWorkspaceContext) => void
  ) {}

  /** Lists the catalogue independently of source connectivity. */
  async list(projectId: string): Promise<OpenCodexProjectWorkspace[]> {
    return await this.repository.list(projectId);
  }

  /** Holds a thread gate and durable workspace reservation through the RPC response. */
  async run<T>(
    input: WorkspaceExecutionInput,
    action: (reservation: WorkspaceExecutionReservation) => Promise<T>
  ): Promise<T> {
    return await this.withThread(input.threadId, async () => {
      const workspace = await this.resolve(input);
      this.workspaceUsers.set(workspace.id, (this.workspaceUsers.get(workspace.id) ?? 0) + 1);
      try {
        const reservation = await this.repository.reserve(workspace.id, input.threadId);
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

  /** Validates and serializes an internal selection; UI exposure remains deferred. */
  async select(threadId: string, workspaceId: string): Promise<void> {
    await this.withThread(threadId, async () => {
      const current = await this.repository.getForThread(threadId);
      if (current?.sourceId === null || current === null) {
        throw new Error("Thread has no source-owned workspace.");
      }
      await this.requireIdle(current.sourceId, threadId);
      await this.repository.select(threadId, workspaceId);
    });
  }

  /** Reconciles a persisted blocker explicitly after a failed or interrupted start. */
  async reconcile(threadId: string): Promise<void> {
    await this.withThread(threadId, async () => {
      const workspace = await this.repository.getForThread(threadId);
      if (workspace?.sourceId === null || workspace === null) {
        throw new Error("Thread has no source-owned workspace.");
      }
      await this.requireIdle(workspace.sourceId, threadId);
      const reservations = await this.repository.listReservations(workspace.id);
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
