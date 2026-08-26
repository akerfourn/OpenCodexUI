/** Characterizes source-aware thread read operations through the public service API. */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { JsonRpcError as JsonRpcErrorClass } from "@open-codex-ui/codex-rpc";
import type { CachedThreadSnapshot } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexThread,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it } from "vitest";

import { ThreadTurnCache } from "../src/ThreadTurnCache";
import type { CollaborationService } from "../src/backend/collaboration/CollaborationService";
import { ThreadConversationService } from "../src/backend/threads/ThreadConversationService";
import { ThreadCacheService } from "../src/backend/threads/ThreadCacheService";
import type {
  ClientPort,
  ProjectSourcePort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "../src/backend/runtime/runtimePorts";

describe("ThreadConversationService read operations", () => {
  it("should read a recognized runtime status with the cached source and read-only RPC", async () => {
    const fixture = createReadFixture({
      snapshots: [createSnapshot(createThread({ sourceId: "source-status" }))],
      threadReadResponse: {
        thread: {
          status: {
            type: "active",
            activeFlags: ["waiting", 42, "streaming"]
          }
        }
      }
    });

    const result = await fixture.service.readThreadRuntimeStatus("thread-1");

    expect(result).toEqual({
      threadId: "thread-1",
      status: "active",
      isActive: true,
      activeFlags: ["waiting", "streaming"]
    });
    expect(fixture.ensureSourceIds).toEqual(["source-status"]);
    expect(fixture.client.readThreadCalls).toEqual([["thread-1", false]]);
  });

  it("should open an orphan snapshot without starting Codex", async () => {
    const fixture = createReadFixture({
      snapshots: [createSnapshot(
        createThread({ sourceId: null }),
        [{ id: "cached-turn" }],
        { hasLoadedLatest: true }
      )]
    });

    const result = await fixture.service.openThread("thread-1");

    expect(result.thread.sourceId).toBeNull();
    expect(result.turns.map((turn) => turn.id)).toEqual(["cached-turn"]);
    expect(fixture.ensureSourceIds).toEqual([]);
    expect(fixture.events.map((event) => event.type)).toEqual(["thread.opened"]);
  });

  it("should persist an override for an unmaterialized shell without an RPC", async () => {
    const fixture = createReadFixture({
      snapshots: [createSnapshot(
        createThread({ sourceId: null }),
        [],
        { hasLoadedLatest: false }
      )]
    });

    const result = await fixture.service.openThread("thread-1", "source-override");

    expect(result.thread.sourceId).toBe("source-override");
    expect(fixture.ensureSourceIds).toEqual([]);
    expect(fixture.indexedThreads).toEqual([
      expect.objectContaining({ id: "thread-1", sourceId: "source-override" })
    ]);
    expect(fixture.client.readThreadCalls).toEqual([]);
    expect(fixture.events.map((event) => event.type)).toEqual(["thread.opened"]);
  });

  it("should remove a cached thread and rethrow a missing rollout during initial open", async () => {
    const rolloutError = new JsonRpcErrorClass("no rollout found for thread id thread-1");
    const fixture = createReadFixture({
      snapshots: [null, null],
      readThreadError: rolloutError
    });

    await expect(fixture.service.openThread("thread-1", "source-1"))
      .rejects.toBe(rolloutError);

    expect(fixture.deletedThreadIds).toEqual(["thread-1"]);
    expect(fixture.client.readThreadCalls).toEqual([["thread-1", false]]);
    expect(fixture.events.some((event) => event.type === "thread.opened")).toBe(false);
  });

  it("should force the explicit source for a mismatched readonly snapshot and persist the result", async () => {
    const fixture = createReadFixture({
      snapshots: [createSnapshot(
        createThread({ sourceId: "source-cache" }),
        [{ id: "stale-turn" }],
        { hasLoadedLatest: true }
      )],
      threadReadResponse: {
        thread: {
          id: "thread-1",
          cwd: "/workspace/project",
          name: "Remote thread",
          preview: ""
        }
      },
      latestTurns: []
    });

    const result = await fixture.service.readThreadReadonly("thread-1", "source-explicit");

    expect(result.thread.sourceId).toBe("source-explicit");
    expect(result.turns).toEqual([]);
    expect(fixture.ensureSourceIds).toEqual(["source-explicit"]);
    expect(fixture.indexedThreads).toEqual([
      expect.objectContaining({ id: "thread-1", sourceId: "source-explicit" })
    ]);
    expect(fixture.deltaTurns).toEqual([]);
    expect(fixture.events).toEqual([]);
  });

  it("should reject a readonly orphan without a source or client", async () => {
    const fixture = createReadFixture({ snapshots: [null] });

    await expect(fixture.service.readThreadReadonly("thread-1", null))
      .rejects.toThrow("Cannot read a sub-agent thread without a Codex source.");

    expect(fixture.ensureSourceIds).toEqual([]);
  });

  it("should serve a cache older cursor without starting Codex", async () => {
    const cachedResult = {
      turns: [createUiTurn("cached-old")],
      hasMoreOlderMessages: true
    };
    const fixture = createReadFixture({
      cachedOlderResult: cachedResult
    });
    const entry = fixture.threadTurnCache.getOrCreate(createThread());

    fixture.threadTurnCache.mergeLatestTurns(
      entry,
      [{ id: "latest-turn", items: [] }],
      "cache:cached-old"
    );

    await expect(fixture.service.loadOlderThreadMessages("thread-1"))
      .resolves.toEqual(cachedResult);

    expect(fixture.ensureSourceIds).toEqual([]);
    expect(fixture.client.turnPageCalls).toEqual([]);
  });
});

type ReadFixtureOptions = {
  /** Snapshots returned in order by cache reads. */
  snapshots?: Array<CachedThreadSnapshot | null>;
  /** Raw response returned by thread/read. */
  threadReadResponse?: unknown;
  /** Error thrown by thread/read. */
  readThreadError?: Error;
  /** Raw latest page returned by thread/turns/list. */
  latestTurns?: unknown[];
  /** Result returned by the cache older-turn boundary. */
  cachedOlderResult?: { turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean };
};

type ReadFixture = {
  /** Public service under test. */
  service: ThreadConversationService;
  /** In-memory turn cache used to seed pagination state. */
  threadTurnCache: ThreadTurnCache;
  /** Deterministic Codex client double. */
  client: ReadCodexClient;
  /** Events emitted by the service. */
  events: OpenCodexEvent[];
  /** Sources passed to the client factory. */
  ensureSourceIds: Array<string | null>;
  /** Threads passed to index writes. */
  indexedThreads: OpenCodexThread[];
  /** Raw turns passed to cache delta writes. */
  deltaTurns: unknown[];
  /** Thread ids removed during rollout cleanup. */
  deletedThreadIds: string[];
};

/** Creates a deterministic service boundary for read-operation tests. */
function createReadFixture(options: ReadFixtureOptions = {}): ReadFixture {
  const threadTurnCache = new ThreadTurnCache();
  const events: OpenCodexEvent[] = [];
  const ensureSourceIds: Array<string | null> = [];
  const indexedThreads: OpenCodexThread[] = [];
  const deltaTurns: unknown[] = [];
  const deletedThreadIds: string[] = [];
  const snapshots = [...(options.snapshots ?? [null])];
  const client = new ReadCodexClient(options);
  const cachedOlderResult = options.cachedOlderResult ?? null;
  const threadCacheService = {
    readSnapshot: async () => snapshots.shift() ?? null,
    readTurns: (entry: { orderedTurnIds: string[] }) => (
      entry.orderedTurnIds.map((id) => createUiTurn(id))
    ),
    loadOlderTurns: async () => cachedOlderResult,
    writeIndex: async (threads: OpenCodexThread[]) => {
      indexedThreads.push(...threads);
    },
    writeDelta: async (_entry: unknown, turns: unknown[]) => {
      deltaTurns.push(...turns);
    },
    deleteThread: async (threadId: string) => {
      deletedThreadIds.push(threadId);
    },
    readThreads: async () => []
  } as unknown as ThreadCacheService;
  const eventsPort: Pick<RuntimeEventPort, "emit" | "recordClientRequest"> = {
    emit: (event) => events.push(event),
    recordClientRequest: () => undefined
  };
  const settings: Pick<RuntimeSettingsPort, "getSettings"> = {
    getSettings: () => ({ language: "en" } as OpenCodexSettings)
  };

  const service = new ThreadConversationService({
    backendOptions: { projectPath: "/workspace/project" },
    threadTurnCache,
    threadCacheService,
    settings,
    events: eventsPort,
    clients: {
      ensureClient: async (sourceId) => {
        ensureSourceIds.push(sourceId);
        return client.asCodexClient();
      },
      getClient: () => undefined,
      restartClient: async () => undefined
    },
    projects: createProjectPort(),
    collaborationService: createCollaborationPort(),
    handleClientError: () => undefined
  });

  return {
    service,
    threadTurnCache,
    client,
    events,
    ensureSourceIds,
    indexedThreads,
    deltaTurns,
    deletedThreadIds
  };
}

/** Provides deterministic source and project callbacks for the service. */
function createProjectPort(): ProjectSourcePort {
  return {
    resolveSource: async (sourceId) => ({ id: sourceId ?? "source-1" }) as never,
    resolveRequestedSource: async (sourceId) => ({ id: sourceId ?? "source-1" }) as never,
    cacheProject: async () => null,
    readCachedProjects: async () => []
  };
}

/** Provides no-op collaboration callbacks for read-only characterization. */
function createCollaborationPort(): Pick<
  CollaborationService,
  "reconcileTurns" | "reconcileDescendantThreads"
> {
  return {
    reconcileTurns: async () => undefined,
    reconcileDescendantThreads: async () => undefined
  };
}

/** Creates a deterministic client with controllable read responses. */
class ReadCodexClient {
  /** Captures thread/read arguments. */
  readonly readThreadCalls: Array<[string, boolean | undefined]> = [];

  /** Captures older turn-page calls. */
  readonly turnPageCalls: unknown[] = [];

  /** Client options for one test. */
  private readonly options: ReadFixtureOptions;

  /** Creates a client double from one fixture configuration. */
  constructor(options: ReadFixtureOptions) {
    this.options = options;
  }

  /** Exposes this double through the app-server client interface. */
  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  /** Returns thread metadata or the configured RPC failure. */
  async readThread(threadId: string, includeTurns?: boolean): Promise<unknown> {
    this.readThreadCalls.push([threadId, includeTurns]);

    if (this.options.readThreadError !== undefined) {
      throw this.options.readThreadError;
    }

    return this.options.threadReadResponse ?? {
      thread: {
        id: threadId,
        cwd: "/workspace/project",
        name: "Thread",
        preview: ""
      }
    };
  }

  /** Returns the configured latest turn page. */
  async listThreadTurns(): Promise<unknown> {
    return {
      data: this.options.latestTurns ?? [],
      nextCursor: null
    };
  }

  /** Records an older page request if a test unexpectedly reaches Codex. */
  async listThreadTurnItems(): Promise<unknown> {
    return { data: [], nextCursor: null };
  }
}

/** Creates a complete thread DTO for cache and source tests. */
function createThread(patch: Partial<OpenCodexThread> = {}): OpenCodexThread {
  return {
    id: "thread-1",
    sessionId: null,
    parentThreadId: null,
    codexTitle: "Thread",
    customTitle: null,
    title: "Thread",
    preview: "",
    model: null,
    reasoningEffort: null,
    projectName: "Project",
    projectPath: "/workspace/project",
    sourceId: "source-1",
    branchName: null,
    updatedAt: null,
    isArchived: false,
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    subAgentSource: null,
    canAcceptDirectInput: null,
    ...patch
  };
}

/** Creates a cache snapshot with explicit materialization state. */
function createSnapshot(
  thread: OpenCodexThread,
  turns: unknown[] = [],
  syncStatePatch: Partial<CachedThreadSnapshot["syncState"]> = {}
): CachedThreadSnapshot {
  return {
    thread: { ...thread } as CachedThreadSnapshot["thread"],
    turns,
    syncState: {
      threadId: thread.id,
      newestTurnId: turns.length > 0 ? "newest-turn" : null,
      oldestTurnId: turns.length > 0 ? "oldest-turn" : null,
      olderCursor: null,
      hasLoadedLatest: turns.length > 0,
      hasLoadedAllOlderTurns: true,
      lastSyncedAt: null,
      ...syncStatePatch
    },
    tokenUsage: null
  };
}

/** Creates the smallest UI turn shape needed by cache-read assertions. */
function createUiTurn(id: string): OpenCodexTurn {
  return {
    id,
    threadId: "thread-1",
    status: "completed",
    startedAt: null,
    completedAt: null,
    durationMs: null,
    items: []
  };
}
