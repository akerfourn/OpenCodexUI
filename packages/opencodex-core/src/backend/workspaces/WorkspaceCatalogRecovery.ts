import type { WorkspaceCacheRepository, WorkspaceExecutionReservation } from
  "@open-codex-ui/opencodex-cache";
import type { v2 } from "@open-codex-ui/codex-rpc";
import type { ClientPort } from "../runtime/runtimePorts.js";

/** Persists verified archive state before releasing its durable reservation. */
export type PersistRecoveredArchive = (threadId: string, isArchived: boolean) => Promise<void>;

/** Repeats only local cleanup after a persisted successful deletion response. */
export type PersistRecoveredDeletion = (threadId: string, sourceId: string) => Promise<void>;

/** Explicit source kinds avoid Codex's default interactive-only listing filter. */
const sourceKinds: v2.ThreadSourceKind[] = [
  "cli", "vscode", "exec", "appServer", "subAgent", "subAgentReview",
  "subAgentCompact", "subAgentThreadSpawn", "subAgentOther", "unknown"
];

/** Recovers catalog outcomes from positive source evidence, never by replaying mutations. */
export class WorkspaceCatalogRecovery {
  /** Shares reservations, source clients and the runtime's archive persistence boundary. */
  constructor(
    private readonly repository: WorkspaceCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly persistArchive?: PersistRecoveredArchive,
    private readonly persistDeletion?: PersistRecoveredDeletion
  ) {}

  /** Returns false for execution reservations; unresolved catalog outcomes remain blocked. */
  async recover(reservation: WorkspaceExecutionReservation): Promise<boolean> {
    const { operation, threadId } = reservation;
    if (operation !== "archive" && operation !== "unarchive" && operation !== "delete") {
      return false;
    }
    if (reservation.state === "preparing") {
      await this.repository.release(reservation.id);
      return true;
    }
    if (operation === "delete" && threadId !== null && this.persistDeletion !== undefined
      && await this.repository.isDeletionConfirmed(reservation.id)) {
      await this.persistDeletion(threadId, reservation.sourceId);
      await this.repository.release(reservation.id);
      return true;
    }
    if (operation === "delete" || this.persistArchive === undefined || threadId === null) {
      throw new Error("Catalog mutation outcome is uncertain; idle status cannot reconcile it.");
    }
    const isArchived = operation === "archive";
    await this.verifyArchive(reservation, isArchived);
    await this.persistArchive(threadId, isArchived);
    await this.repository.release(reservation.id);
    return true;
  }

  /** Searches bounded pages for positive identity, location and inactivity evidence. */
  private async verifyArchive(
    reservation: WorkspaceExecutionReservation, isArchived: boolean
  ): Promise<void> {
    const client = await this.clients.ensureClient(reservation.sourceId);
    let cursor: string | null = null;
    const seenCursors = new Set<string>();
    for (let page = 0; page < 100; page += 1) {
      const response = await client.listThreads({
        archived: isArchived, modelProviders: [], sourceKinds: [...sourceKinds],
        limit: 100, cursor
      });
      const thread = response.data.find((item) => item.id === reservation.threadId);
      if (thread !== undefined) {
        if (thread.cwd !== reservation.cwd) {
          throw new Error("Recovered catalog thread has a different workspace path.");
        }
        const live = await client.readThread(thread.id, false);
        if (live.thread.id !== thread.id || live.thread.cwd !== reservation.cwd
          || (live.thread.status.type !== "idle" && live.thread.status.type !== "notLoaded")) {
          throw new Error("Recovered catalog thread identity or inactivity could not be verified.");
        }
        return;
      }
      cursor = response.nextCursor;
      if (cursor === null) {
        break;
      }
      if (seenCursors.has(cursor)) {
        throw new Error("Codex repeated a catalog pagination cursor; recovery remains blocked.");
      }
      seenCursors.add(cursor);
    }
    throw new Error("Expected catalog state was not confirmed by Codex; recovery remains blocked.");
  }
}
