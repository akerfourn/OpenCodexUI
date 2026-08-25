/** Characterizes thread recovery orchestration through the public service API. */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
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
  ProjectSourcePort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "../src/backend/runtime/runtimePorts";

describe("ThreadConversationService recovery", () => {
  it("should recover a loaded snapshot in order and deduplicate an active recovery", async () => {
    const snapshot = createSnapshot(createThread(), [], {
      hasLoadedLatest: true,
      hasLoadedAllOlderTurns: true
    });
    const fixture = createRecoveryFixture([snapshot, snapshot]);
    const firstRecovery = fixture.service.recoverThread("thread-1");

    await fixture.readThreadStarted;

    await expect(fixture.service.recoverThread("thread-1"))
      .resolves.toEqual({ ok: true });
    expect(fixture.events.map((event) => event.type)).toEqual([
      "thread.recovery.started",
      "thread.opened",
      "thread.sync.started"
    ]);

    fixture.releaseReadThread();
    await firstRecovery;

    expect(fixture.events.map((event) => event.type)).toEqual([
      "thread.recovery.started",
      "thread.opened",
      "thread.sync.started",
      "thread.sync.completed",
      "thread.recovery.completed"
    ]);
    expect(fixture.ensureSourceIds).toEqual(["source-1"]);
    expect(fixture.client.readThreadCalls).toEqual([["thread-1", false]]);
  });

  it("should release the recovery guard when snapshot loading fails", async () => {
    const snapshot = createSnapshot(createThread(), [], {
      hasLoadedLatest: true,
      hasLoadedAllOlderTurns: true
    });
    const snapshotError = new Error("snapshot unavailable");
    const fixture = createRecoveryFixture([snapshot, snapshot], [snapshotError]);

    await expect(fixture.service.recoverThread("thread-1"))
      .rejects.toBe(snapshotError);

    fixture.releaseReadThread();
    await expect(fixture.service.recoverThread("thread-1"))
      .resolves.toEqual({ ok: true });

    expect(fixture.events.filter((event) => event.type === "thread.recovery.started"))
      .toHaveLength(2);
  });
});

type RecoveryFixture = {
  /** Public service under test. */
  service: ThreadConversationService;
  /** Events emitted during recovery. */
  events: OpenCodexEvent[];
  /** Sources passed to the client factory. */
  ensureSourceIds: Array<string | null>;
  /** Deterministic Codex client double. */
  client: RecoveryCodexClient;
  /** Resolves when the synchronization RPC is in flight. */
  readThreadStarted: Promise<void>;
  /** Releases the blocked synchronization RPC. */
  releaseReadThread(): void;
};

/** Creates a loaded recovery fixture with a deterministic RPC barrier. */
function createRecoveryFixture(
  snapshots: CachedThreadSnapshot[],
  readSnapshotErrors: Error[] = []
): RecoveryFixture {
  const threadTurnCache = new ThreadTurnCache();
  threadTurnCache.getOrCreate(createThread());
  const events: OpenCodexEvent[] = [];
  const ensureSourceIds: Array<string | null> = [];
  const snapshotQueue = [...snapshots];
  const snapshotErrorQueue = [...readSnapshotErrors];
  let signalReadThread: (() => void) | null = null;
  let releaseReadThread: (() => void) | null = null;
  const readThreadStarted = new Promise<void>((resolve) => {
    signalReadThread = resolve;
  });
  const readThreadRelease = new Promise<void>((resolve) => {
    releaseReadThread = resolve;
  });
  const client = new RecoveryCodexClient(
    () => signalReadThread?.(),
    () => readThreadRelease
  );
  const threadCacheService = {
    readSnapshot: async () => {
      const snapshotError = snapshotErrorQueue.shift();

      if (snapshotError !== undefined) {
        throw snapshotError;
      }

      return snapshotQueue.shift() ?? null;
    },
    readTurns: () => [] as OpenCodexTurn[],
    writeIndex: async () => undefined,
    writeDelta: async () => undefined,
    readThreads: async () => []
  } as unknown as ThreadCacheService;
  const eventsPort: Pick<RuntimeEventPort, "emit"> = {
    emit: (event) => events.push(event)
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
    events,
    ensureSourceIds,
    client,
    readThreadStarted,
    releaseReadThread: () => releaseReadThread?.()
  };
}

/** Provides deterministic source and project callbacks for recovery. */
function createProjectPort(): ProjectSourcePort {
  return {
    resolveSource: async (sourceId) => ({ id: sourceId ?? "source-1" }) as never,
    resolveRequestedSource: async (sourceId) => ({ id: sourceId ?? "source-1" }) as never,
    cacheProject: async () => null,
    readCachedProjects: async () => []
  };
}

/** Provides no-op collaboration callbacks for recovery characterization. */
function createCollaborationPort(): Pick<
  CollaborationService,
  "reconcileTurns" | "reconcileDescendantThreads"
> {
  return {
    reconcileTurns: async () => undefined,
    reconcileDescendantThreads: async () => undefined
  };
}

/** Creates a deterministic client whose first read waits on a test barrier. */
class RecoveryCodexClient {
  /** Captures thread/read arguments. */
  readonly readThreadCalls: Array<[string, boolean | undefined]> = [];

  /** Signals that the synchronization read has started. */
  private readonly signalReadThread: () => void;

  /** Supplies the promise that releases the synchronization read. */
  private readonly readThreadRelease: () => Promise<void>;

  /** Creates a client double with explicit synchronization barriers. */
  constructor(
    signalReadThread: () => void,
    readThreadRelease: () => Promise<void>
  ) {
    this.signalReadThread = signalReadThread;
    this.readThreadRelease = readThreadRelease;
  }

  /** Exposes this double through the app-server client interface. */
  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  /** Blocks and returns stable metadata for the synchronization read. */
  async readThread(threadId: string, includeTurns?: boolean): Promise<unknown> {
    this.readThreadCalls.push([threadId, includeTurns]);
    this.signalReadThread();
    await this.readThreadRelease();
    return {
      thread: {
        id: threadId,
        cwd: "/workspace/project",
        name: "Thread",
        preview: ""
      }
    };
  }

  /** Returns an empty latest page so synchronization emits no turn delta. */
  async listThreadTurns(): Promise<unknown> {
    return { data: [], nextCursor: null };
  }
}

/** Creates a complete thread DTO for source resolution and cache state. */
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

/** Creates a cached snapshot with the requested recovery state. */
function createSnapshot(
  thread: OpenCodexThread,
  turns: unknown[],
  syncStatePatch: Partial<CachedThreadSnapshot["syncState"]>
): CachedThreadSnapshot {
  return {
    thread: { ...thread } as CachedThreadSnapshot["thread"],
    turns,
    syncState: {
      threadId: thread.id,
      newestTurnId: null,
      oldestTurnId: null,
      olderCursor: null,
      hasLoadedLatest: false,
      hasLoadedAllOlderTurns: true,
      lastSyncedAt: null,
      ...syncStatePatch
    },
    tokenUsage: null
  };
}
