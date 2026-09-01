/** Characterizes source-aware thread synchronization through public APIs. */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { CachedThreadSnapshot } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThreadTurnCache } from "../src/ThreadTurnCache";
import type { CollaborationService } from "../src/backend/collaboration/CollaborationService";
import { ThreadConversationService } from "../src/backend/threads/ThreadConversationService";
import type { ThreadCacheService } from "../src/backend/threads/ThreadCacheService";

describe("ThreadConversationService synchronization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits sync events and writes changed turns in order", async () => {
    vi.useFakeTimers();
    const fixture = createFixture({
      seedTurns: [createTurn("turn-1", "before")],
      latestTurns: [createTurn("turn-1", "after")]
    });

    await completeTurn(fixture.service, "thread-1", "source-1");

    expect(fixture.calls).toEqual([
      "ensureClient",
      "event:thread.sync.started",
      "rpc:readThread",
      "rpc:listThreadTurns",
      "reconcileTurns",
      "writeIndex",
      "writeDelta",
      "event:thread.turns.synced",
      "event:thread.sync.completed"
    ]);
    expect(fixture.events.map((event) => event.type)).toEqual([
      "thread.sync.started",
      "thread.turns.synced",
      "thread.sync.completed"
    ]);
    expect(fixture.events.every((event) => event.sourceId === "source-1")).toBe(true);
    expect(fixture.reconciledThreads).toEqual([{
      sourceId: "source-1",
      threadId: "thread-1"
    }]);
    expect(fixture.indexedThreads).toEqual([
      expect.objectContaining({ id: "thread-1", sourceId: "source-1" })
    ]);
    expect(fixture.deltaTurns).toEqual([
      expect.objectContaining({ id: "turn-1" })
    ]);
  });

  it("emits completion without writes when the turn signature is unchanged", async () => {
    vi.useFakeTimers();
    const turn = createTurn("turn-1", "same");
    const fixture = createFixture({
      seedTurns: [turn],
      latestTurns: [turn]
    });

    await completeTurn(fixture.service, "thread-1", "source-1");

    expect(fixture.events.map((event) => event.type)).toEqual([
      "thread.sync.started",
      "thread.sync.completed"
    ]);
    expect(fixture.indexedThreads).toEqual([]);
    expect(fixture.deltaTurns).toEqual([]);
    expect(fixture.calls).not.toContain("event:thread.turns.synced");
  });

  it("always emits sync completion when loading the latest turns fails", async () => {
    vi.useFakeTimers();
    const error = new Error("latest turns unavailable");
    const fixture = createFixture({ latestTurnsError: error, seedThread: true });

    let rejectedError: unknown = null;

    try {
      await completeTurn(fixture.service, "thread-1", "source-1");
    } catch (caughtError) {
      rejectedError = caughtError;
    }

    expect(rejectedError).toBe(error);

    expect(fixture.events.map((event) => event.type)).toEqual([
      "thread.sync.started",
      "thread.sync.completed"
    ]);
    expect(fixture.indexedThreads).toEqual([]);
    expect(fixture.deltaTurns).toEqual([]);
  });

  it("should discard a sync result that started before a destructive turn replacement", async () => {
    vi.useFakeTimers();
    let resolveLatestTurns: ((turns: unknown[]) => void) | null = null;
    const latestTurns = new Promise<unknown[]>((resolve) => {
      resolveLatestTurns = resolve;
    });
    const fixture = createFixture({
      seedTurns: [createTurn("turn-old", "old")],
      latestTurnsPromise: latestTurns
    });

    const synchronization = fixture.service.syncCompletedTurn("thread-1", "source-1");
    await vi.advanceTimersByTimeAsync(500);
    fixture.threadTurnCache.replaceThreadTurns(
      createThread(),
      [createTurn("turn-new", "new")]
    );
    resolveLatestTurns?.([createTurn("turn-old", "stale")]);

    await synchronization;

    const cacheEntry = fixture.threadTurnCache.get("thread-1");

    expect(cacheEntry).not.toBeNull();
    expect(cacheEntry === null ? [] : fixture.threadTurnCache.toTurns(cacheEntry)).toEqual([
      expect.objectContaining({ id: "turn-new" })
    ]);
    expect(fixture.events.map((event) => event.type)).toEqual([
      "thread.sync.started",
      "thread.sync.completed"
    ]);
    expect(fixture.deltaTurns).toEqual([]);
  });

  it("returns without a client or events when no source is known", async () => {
    vi.useFakeTimers();
    const fixture = createFixture({
      snapshot: createSnapshot(createThread({ sourceId: null }))
    });

    await completeTurn(fixture.service, "thread-1", null);

    expect(fixture.ensureSourceIds).toEqual([]);
    expect(fixture.events).toEqual([]);
    expect(fixture.indexedThreads).toEqual([]);
    expect(fixture.deltaTurns).toEqual([]);
  });

  it("emits started and completed without a client for a non-materialized refresh", async () => {
    const populatedSnapshot = createSnapshot(
      createThread({ sourceId: "source-1" }),
      [createTurn("turn-1", "cached")],
      true
    );
    const nonMaterializedSnapshot = createSnapshot(
      createThread({ sourceId: "source-1" }),
      [],
      false
    );
    const fixture = createFixture({ snapshots: [populatedSnapshot, nonMaterializedSnapshot] });
    const backgroundCompletion = fixture.waitForEvent("thread.sync.completed");

    const result = await fixture.service.openThread("thread-1");
    await backgroundCompletion;

    expect(result.turns).toHaveLength(1);
    expect(fixture.ensureSourceIds).toEqual([]);
    expect(fixture.events.map((event) => event.type)).toEqual([
      "thread.opened",
      "thread.sync.started",
      "thread.sync.completed"
    ]);
    expect(fixture.calls).not.toContain("event:thread.turns.synced");
  });
});

type SynchronizationFixtureOptions = {
  /** Snapshot sequence returned by cache reads. */
  snapshots?: CachedThreadSnapshot[];
  /** One snapshot returned by every cache read. */
  snapshot?: CachedThreadSnapshot | null;
  /** Existing turns seeded into the in-memory cache. */
  seedTurns?: unknown[];
  /** Whether to seed an empty in-memory thread entry. */
  seedThread?: boolean;
  /** Latest turns returned by Codex. */
  latestTurns?: unknown[];
  /** Deferred latest turns used to reproduce a replacement race. */
  latestTurnsPromise?: Promise<unknown[]>;
  /** Error raised while reading the latest turns. */
  latestTurnsError?: Error;
};

type SynchronizationFixture = {
  /** Public service under test. */
  service: ThreadConversationService;
  /** Ordered operations crossing the test fixture boundary. */
  calls: string[];
  /** Events emitted by the service. */
  events: OpenCodexEvent[];
  /** Source identifiers passed to the client factory. */
  ensureSourceIds: Array<string | null>;
  /** Threads passed to cache index writes. */
  indexedThreads: OpenCodexThread[];
  /** Turns passed to cache delta writes. */
  deltaTurns: unknown[];
  /** Source and thread identifiers passed to collaboration reconciliation. */
  reconciledThreads: Array<{ sourceId: string; threadId: string }>;
  /** Waits for a service event without polling or real timers. */
  waitForEvent(eventType: OpenCodexEvent["type"]): Promise<void>;
  /** In-memory cache used to inspect replacement invalidation. */
  threadTurnCache: ThreadTurnCache;
};

/** Creates a deterministic service with observable sync boundaries. */
function createFixture(
  options: SynchronizationFixtureOptions = {}
): SynchronizationFixture {
  const calls: string[] = [];
  const events: OpenCodexEvent[] = [];
  const ensureSourceIds: Array<string | null> = [];
  const indexedThreads: OpenCodexThread[] = [];
  const deltaTurns: unknown[] = [];
  const reconciledThreads: Array<{ sourceId: string; threadId: string }> = [];
  /** Event waiters resolved directly by the event emitter. */
  const eventWaiters = new Map<OpenCodexEvent["type"], Array<() => void>>();
  const threadTurnCache = new ThreadTurnCache();
  const thread = createThread();
  const seedTurns = options.seedTurns ?? [];
  const snapshots = [...(options.snapshots ?? [])];
  const snapshot = options.snapshot ?? null;
  const client = new SynchronizationCodexClient(options, calls);

  if (seedTurns.length > 0) {
    threadTurnCache.replaceThreadTurns(thread, seedTurns);
  } else if (options.seedThread === true) {
    threadTurnCache.getOrCreate(thread);
  }

  const service = new ThreadConversationService({
    backendOptions: { projectPath: "/workspace/project" },
    threadTurnCache,
    threadCacheService: {
      readSnapshot: async () => snapshots.shift() ?? snapshot,
      readTurns: (entry: { orderedTurnIds: string[] }) => (
        entry.orderedTurnIds.map((id) => ({ id }))
      ),
      writeIndex: async (threads: OpenCodexThread[]) => {
        calls.push("writeIndex");
        indexedThreads.push(...threads);
      },
      writeDelta: async (_entry: unknown, turns: unknown[]) => {
        calls.push("writeDelta");
        deltaTurns.push(...turns);
      }
    } as unknown as ThreadCacheService,
    settings: createSettingsPort(),
    events: {
      emit: (event: OpenCodexEvent) => {
        calls.push(`event:${event.type}`);
        events.push(event);
        const waiters = eventWaiters.get(event.type) ?? [];
        eventWaiters.delete(event.type);
        waiters.forEach((resolve) => resolve());
      }
    },
    clients: {
      ensureClient: async (sourceId: string | null) => {
        calls.push("ensureClient");
        ensureSourceIds.push(sourceId);
        return client.asCodexClient();
      }
    },
    projects: {
      resolveSource: async (sourceId) => ({ id: sourceId ?? "source-1" }) as never,
      cacheProject: async () => null,
      readCachedProjects: async () => []
    },
    collaborationService: {
      reconcileTurns: async (sourceId: string, threadId: string) => {
        calls.push("reconcileTurns");
        reconciledThreads.push({ sourceId, threadId });
      },
      reconcileDescendantThreads: async () => undefined
    } as Pick<CollaborationService, "reconcileTurns" | "reconcileDescendantThreads">,
    handleClientError: () => undefined
  });

  return {
    service,
    calls,
    events,
    ensureSourceIds,
    indexedThreads,
    deltaTurns,
    reconciledThreads,
    waitForEvent: (eventType) => registerEventWaiter(events, eventWaiters, eventType),
    threadTurnCache
  };
}

/** Advances the delayed completion refresh and waits for its result. */
async function completeTurn(
  service: ThreadConversationService,
  threadId: string,
  sourceId: string | null
): Promise<void> {
  const synchronization = service.syncCompletedTurn(threadId, sourceId).then(
    () => null,
    (error: unknown) => error
  );
  await vi.advanceTimersByTimeAsync(500);
  const error = await synchronization;

  if (error !== null) {
    throw error;
  }
}

/** Registers a waiter resolved directly by the fixture event emitter. */
function registerEventWaiter(
  events: readonly OpenCodexEvent[],
  eventWaiters: Map<OpenCodexEvent["type"], Array<() => void>>,
  eventType: OpenCodexEvent["type"]
): Promise<void> {
  if (events.some((event) => event.type === eventType)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const waiters = eventWaiters.get(eventType) ?? [];
    waiters.push(resolve);
    eventWaiters.set(eventType, waiters);
  });
}

/** Creates a minimal source-aware thread used by synchronization tests. */
function createThread(patch: Partial<OpenCodexThread> = {}): OpenCodexThread {
  return {
    id: "thread-1",
    sessionId: null,
    parentThreadId: null,
    codexTitle: "Thread",
    customTitle: null,
    title: "Thread",
    preview: "",
    model: "model-thread",
    reasoningEffort: "medium",
    projectName: "project",
    projectPath: "/workspace/project",
    sourceId: "source-1",
    branchName: null,
    updatedAt: null,
    isArchived: false,
    threadSource: "appServer",
    agentNickname: null,
    agentRole: null,
    subAgentSource: null,
    canAcceptDirectInput: true,
    ...patch
  };
}

/** Creates a cache snapshot with explicit materialization state. */
function createSnapshot(
  thread: OpenCodexThread,
  turns: unknown[] = [],
  hasLoadedLatest = false
): CachedThreadSnapshot {
  return {
    thread: { ...thread } as CachedThreadSnapshot["thread"],
    turns,
    syncState: {
      threadId: thread.id,
      newestTurnId: turns.length > 0 ? "turn-1" : null,
      oldestTurnId: turns.length > 0 ? "turn-1" : null,
      olderCursor: null,
      hasLoadedLatest,
      hasLoadedAllOlderTurns: true,
      lastSyncedAt: null
    },
    tokenUsage: null
  };
}

/** Creates one raw turn whose item text controls its cache signature. */
function createTurn(id: string, text: string): Record<string, unknown> {
  return {
    id,
    status: "completed",
    itemsView: "full",
    items: [{ type: "agentMessage", id: `${id}-message`, text }]
  };
}

/** Creates the settings port needed while mapping synchronized turns. */
function createSettingsPort(): { getSettings: () => OpenCodexSettings } {
  return {
    getSettings: () => ({ language: "en" } as OpenCodexSettings)
  };
}

/** Provides deterministic Codex metadata and latest-turn responses. */
class SynchronizationCodexClient {
  /** Configured synchronization responses. */
  private readonly options: SynchronizationFixtureOptions;

  /** Shared ordered operation log. */
  private readonly calls: string[];

  /** Creates a Codex client double for one synchronization scenario. */
  constructor(options: SynchronizationFixtureOptions, calls: string[]) {
    this.options = options;
    this.calls = calls;
  }

  /** Exposes the deterministic double through the RPC client boundary. */
  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  /** Records metadata reads and returns stable thread data. */
  async readThread(threadId: string): Promise<unknown> {
    this.calls.push("rpc:readThread");
    return {
      thread: {
        id: threadId,
        cwd: "/workspace/project",
        name: "Thread",
        preview: ""
      }
    };
  }

  /** Records turn-list reads and returns configured turns or an error. */
  async listThreadTurns(): Promise<unknown> {
    this.calls.push("rpc:listThreadTurns");

    if (this.options.latestTurnsError !== undefined) {
      throw this.options.latestTurnsError;
    }

    const configuredTurns = this.options.latestTurnsPromise === undefined
      ? this.options.latestTurns ?? []
      : await this.options.latestTurnsPromise;

    return {
      data: configuredTurns,
      nextCursor: null
    };
  }
}
