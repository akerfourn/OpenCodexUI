import path from "node:path";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexDiscussion, OpenCodexThread, OpenCodexTurn } from "@open-codex-ui/opencodex-protocol";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { toOpenCodexProject } from "../projects/projectMapping.js";
import { toCachedThreadSummary, toOpenCodexThread } from "./threadCacheMapping.js";
import { filterMainThreads } from "./threadHierarchy.js";
import { THREAD_MAIN_SOURCE_KINDS } from "../shared/constants.js";
import { readThreads } from "../shared/codexReaders.js";
import { readObject, readString } from "../../mapping.js";
import { readThreadRuntimeStatus } from "./threadRuntimeStatus.js";

/** Reuses execution and file ownership while keeping personal chats outside the project catalogue. */
export class DiscussionsService {
  /** Serializes repeat sends of the same local draft before native creation has returned. */
  private readonly pending = new Map<string, Promise<OpenCodexDiscussion>>();

  /** Uses source APIs for directories, including WSL and sources on another filesystem. */
  constructor(
    private readonly cache: OpenCodexCacheRepository | null,
    private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly createThread: (
      cwd: string, sourceId: string, workspaceId: string, clientDraftId: string
    ) => Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }>
  ) {}

  /** Reads all personal chats from cache without starting every configured source. */
  async list(isArchived = false): Promise<OpenCodexDiscussion[]> {
    const cache = this.requireCache();
    const [environments, threads] = await Promise.all([
      cache.listDiscussionEnvironments(),
      cache.listThreads({ scope: "all", currentProjectPath: null, isArchived })
    ]);
    const mainThreads = filterMainThreads(threads.map(toOpenCodexThread));
    const discussions: OpenCodexDiscussion[] = [];
    for (const environment of environments) {
      const clientDraftId = /:(draft:[0-9a-f-]+)$/iu.exec(environment.discussionKey ?? "")?.[1];
      if (environment.discussionThreadId === undefined && environment.discussionCreationCancelled !== true
        && clientDraftId !== undefined && !isArchived) {
        discussions.push({ environment: toOpenCodexProject(environment), threads: [], pendingCreation: { clientDraftId } });
        continue;
      }
      const environmentThreads = mainThreads.filter((thread) => thread.discussionEnvironmentId === environment.id);
      if (environmentThreads.length > 0) {
        discussions.push({ environment: toOpenCodexProject(environment), threads: environmentThreads });
      }
    }
    return discussions;
  }

  /** Abandons only the local setup intent; native history and source directories are retained. */
  async cancelCreation(environmentId: string, sourceId: string | null): Promise<void> {
    const cache = this.requireCache();
    const environment = (await cache.listDiscussionEnvironments()).find((item) => item.id === environmentId);
    if (environment?.discussionKey !== undefined && this.pending.has(environment.discussionKey)) {
      throw new Error("Discussion creation is still in progress; wait for its result before abandoning setup.");
    }
    await cache.cancelDiscussionCreation(environmentId, sourceId);
  }

  /** Allocates the first-send directory once and retains the ordinary durable execution guards. */
  async create(sourceId: string, clientDraftId: string): Promise<OpenCodexDiscussion> {
    if (!/^draft:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(clientDraftId)) {
      throw new Error("Discussion creation requires a valid local draft identifier.");
    }
    const key = `${sourceId}:${clientDraftId}`;
    const pending = this.pending.get(key);
    if (pending !== undefined) return await pending;
    const operation = this.createOnce(sourceId, clientDraftId, key);
    this.pending.set(key, operation);
    try {
      return await operation;
    } finally {
      this.pending.delete(key);
    }
  }

  /** Restores a confirmed identity after a lost reply without replaying thread/start. */
  private async createOnce(sourceId: string, clientDraftId: string, key: string): Promise<OpenCodexDiscussion> {
    const cache = this.requireCache();
    const client = await this.clients.ensureClient(sourceId);
    const home = await client.getCodexHome();
    const paths = pathForSource(home);
    const directory = paths.join(home, "opencodex-ui", "discussions", clientDraftId.slice(6));
    const environment = await cache.createDiscussionEnvironment(directory, sourceId, key);
    const threads = await cache.listThreads({
      scope: "currentProject", currentProjectPath: directory, sourceId
    });
    const workspace = (await cache.workspaces.list(environment.id)).find((item) => item.isPrimary);
    if (workspace === undefined) throw new Error("Discussion execution context is unavailable.");
    const reservations = await cache.workspaces.listReservations(workspace.id);
    if (reservations.length > 0) {
      const threadId = await this.recoverCreation(sourceId, directory, workspace.id);
      await cache.completeDiscussionCreation(environment.id, sourceId, threadId);
      const recovered = (await this.list()).find((item) => item.environment.id === environment.id);
      if (recovered === undefined) throw new Error("Recovered discussion could not be read from storage.");
      return recovered;
    }
    const mainThreads = filterMainThreads(threads.map(toOpenCodexThread));
    if (environment.discussionThreadId === undefined && mainThreads.length > 1) {
      throw new Error("Discussion setup has multiple native identities; explicit reconciliation is required.");
    }
    const existing = mainThreads.find((thread) => environment.discussionThreadId === undefined
      || thread.id === environment.discussionThreadId);
    if (existing !== undefined) {
      await cache.completeDiscussionCreation(environment.id, sourceId, existing.id);
      return { environment: toOpenCodexProject(environment), threads: [existing] };
    }
    if (environment.discussionThreadId !== undefined) {
      throw new Error("This discussion was removed or archived. Start a new discussion or restore it from the archive.");
    }
    await client.createDirectory(directory);
    const result = await this.createThread(directory, sourceId, workspace.id, clientDraftId);
    await cache.completeDiscussionCreation(environment.id, sourceId, result.thread.id);
    return {
      environment: toOpenCodexProject(environment),
      threads: [{ ...result.thread, discussionEnvironmentId: environment.id }]
    };
  }

  /** Recovers a lost creation reply only from a single idle native chat in the exact reserved directory. */
  private async recoverCreation(sourceId: string, directory: string, workspaceId: string): Promise<string> {
    const cache = this.requireCache();
    const reservations = await cache.workspaces.listReservations(workspaceId);
    const reservation = reservations[0];
    const unresolved = "Discussion creation is unresolved; reconcile its execution before retrying.";
    if (reservation === undefined || reservations.length !== 1 || reservation.threadId !== null || reservation.operation !== "turn"
      || reservation.sourceId !== sourceId || reservation.cwd !== directory
      || (reservation.state !== "uncertain" && reservation.state !== "submitting")) {
      throw new Error(unresolved);
    }
    const client = await this.clients.ensureClient(sourceId);
    const response = await client.listThreads({
      cwd: directory, sourceKinds: THREAD_MAIN_SOURCE_KINDS, archived: false, limit: 2
    });
    const candidates = filterMainThreads(readThreads(response));
    const candidate = candidates[0];
    if (candidate === undefined || candidates.length !== 1 || response.nextCursor != null) throw new Error(unresolved);
    const metadata = readObject((await client.readThread(candidate.id, false)).thread);
    const status = readThreadRuntimeStatus(metadata.status);
    const paths = pathForSource(directory);
    if (readString(metadata.id) !== candidate.id || readString(metadata.cwd).length === 0
      || paths.normalize(readString(metadata.cwd)) !== paths.normalize(directory)
      || (status !== "idle" && status !== "notLoaded")) throw new Error(unresolved);
    await cache.upsertThreadIndex([toCachedThreadSummary({ ...candidate, sourceId })]);
    const association = await cache.workspaces.getForThread(candidate.id);
    if (association?.id !== workspaceId || association.sourceId !== sourceId) throw new Error(unresolved);
    await cache.workspaces.release(reservation.id);
    return candidate.id;
  }

  /** Fails explicitly when the host does not persist conversation ownership. */
  private requireCache(): OpenCodexCacheRepository {
    if (this.cache === null) throw new Error("Personal discussions require persistent storage.");
    return this.cache;
  }
}

/** Chooses path syntax from the source-reported absolute home, never from the Electron host. */
function pathForSource(home: string): typeof path.posix {
  if (home.startsWith("/")) return path.posix;
  if (path.win32.isAbsolute(home)) return path.win32;
  throw new Error("Codex returned a relative home directory.");
}
