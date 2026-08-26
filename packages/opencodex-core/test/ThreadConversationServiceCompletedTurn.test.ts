/**
 * Covers source-aware synchronization after Codex reports a completed turn.
 */
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
import { ThreadCacheService } from "../src/backend/threads/ThreadCacheService";
import type {
  ClientPort,
  ProjectSourcePort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "../src/backend/runtime/runtimePorts";

describe("ThreadConversationService completed-turn synchronization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should repair and persist the event source for an in-memory thread without a source", async () => {
    vi.useFakeTimers();
    const fixture = createCompletionFixture();
    const thread = createThread({
      id: "child-1",
      sourceId: null,
      parentThreadId: "parent-1"
    });

    fixture.threadTurnCache.getOrCreate(thread);
    await completeTurn(fixture.service, thread.id, "source-event");

    expect(fixture.ensureSourceIds).toEqual(["source-event"]);
    expect(fixture.threadTurnCache.get(thread.id)?.thread.sourceId).toBe("source-event");
    expect(fixture.writtenThreads).toEqual([
      expect.objectContaining({ id: thread.id, sourceId: "source-event" })
    ]);
  });

  it("should restore and persist the event source for a cached snapshot without a source", async () => {
    vi.useFakeTimers();
    const thread = createThread({
      id: "child-1",
      sourceId: null,
      parentThreadId: "parent-1"
    });
    const fixture = createCompletionFixture({
      snapshot: createSnapshot(thread, false)
    });

    await completeTurn(fixture.service, thread.id, "source-event");

    expect(fixture.ensureSourceIds).toEqual(["source-event"]);
    expect(fixture.threadTurnCache.get(thread.id)?.thread.sourceId).toBe("source-event");
    expect(fixture.writtenThreads).toEqual([
      expect.objectContaining({ id: thread.id, sourceId: "source-event" })
    ]);
  });

  it("should load an absent thread from the event source without searching for its parent", async () => {
    vi.useFakeTimers();
    const fixture = createCompletionFixture();

    await completeTurn(fixture.service, "child-1", "source-event");

    expect(fixture.ensureSourceIds).toEqual(["source-event"]);
    expect(fixture.client.readThreadIds.length).toBeGreaterThan(0);
    expect(fixture.client.readThreadIds.every((threadId) => threadId === "child-1")).toBe(true);
    expect(fixture.readThreads).not.toHaveBeenCalled();
    expect(fixture.threadTurnCache.get("child-1")?.thread.sourceId).toBe("source-event");
    expect(fixture.writtenThreads).toEqual([
      expect.objectContaining({ id: "child-1", sourceId: "source-event" })
    ]);
  });

  it.each(["memory", "snapshot"] as const)(
    "should prioritize the event source over a cached source in the %s cache",
    async (cacheKind) => {
      vi.useFakeTimers();
      const cachedThread = createThread({
        id: "child-1",
        sourceId: "source-cache",
        parentThreadId: "parent-1"
      });
      const fixture = createCompletionFixture({
        snapshot: cacheKind === "snapshot" ? createSnapshot(cachedThread) : null
      });

      if (cacheKind === "memory") {
        fixture.threadTurnCache.getOrCreate(cachedThread);
      }

      await completeTurn(fixture.service, cachedThread.id, "source-event");

      expect(fixture.ensureSourceIds).toEqual(["source-event"]);
      expect(fixture.ensureSourceIds).not.toContain("source-cache");
      expect(fixture.writtenThreads).toEqual([
        expect.objectContaining({ id: cachedThread.id, sourceId: "source-event" })
      ]);
    }
  );
});

type CompletionFixture = {
  service: ThreadConversationService;
  threadTurnCache: ThreadTurnCache;
  client: CompletedTurnCodexClient;
  ensureSourceIds: Array<string | null>;
  writtenThreads: OpenCodexThread[];
  readThreads: ReturnType<typeof vi.fn>;
};

/** Creates a source-aware fixture for completed-turn synchronization tests. */
function createCompletionFixture(
  options: { snapshot?: CachedThreadSnapshot | null } = {}
): CompletionFixture {
  const threadTurnCache = new ThreadTurnCache();
  const client = new CompletedTurnCodexClient();
  const ensureSourceIds: Array<string | null> = [];
  const writtenThreads: OpenCodexThread[] = [];
  const readThreads = vi.fn(async () => []);
  const snapshot = options.snapshot ?? null;

  const service = new ThreadConversationService({
    backendOptions: { projectPath: "/workspace/project" },
    threadTurnCache,
    threadCacheService: {
      readSnapshot: async () => snapshot,
      readThreads,
      readTurns: () => [],
      writeDelta: async () => undefined,
      writeIndex: async (threads: OpenCodexThread[]) => {
        writtenThreads.push(...threads);
      }
    } as unknown as ThreadCacheService,
    settings: createSettingsPort(createSettings()),
    events: createEventPort(),
    clients: createClientPort(async (sourceId) => {
      ensureSourceIds.push(sourceId);
      return client.asCodexClient();
    }),
    projects: createProjectPort({
      resolveSource: async () => {
        throw new Error("Completed-turn synchronization must use the event source directly.");
      }
    }),
    collaborationService: createCollaborationPort(),
    handleClientError: () => undefined
  });

  return {
    service,
    threadTurnCache,
    client,
    ensureSourceIds,
    writtenThreads,
    readThreads
  };
}

/** Advances the delayed synchronization and waits for all source-aware work. */
async function completeTurn(
  service: ThreadConversationService,
  threadId: string,
  sourceId: string
): Promise<void> {
  const synchronization = service.syncCompletedTurn(threadId, sourceId);
  await vi.advanceTimersByTimeAsync(500);
  await synchronization;
}

/** Creates the minimal cached snapshot needed to exercise SQLite restoration. */
function createSnapshot(
  thread: OpenCodexThread,
  hasLoadedLatest = true
): CachedThreadSnapshot {
  return {
    thread: { ...thread } as CachedThreadSnapshot["thread"],
    turns: [],
    syncState: {
      threadId: thread.id,
      newestTurnId: null,
      oldestTurnId: null,
      olderCursor: null,
      hasLoadedLatest,
      hasLoadedAllOlderTurns: hasLoadedLatest,
      lastSyncedAt: null
    },
    tokenUsage: null
  };
}

/** Provides only the Codex reads needed by completed-turn synchronization. */
class CompletedTurnCodexClient {
  readonly readThreadIds: string[] = [];

  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  async readThread(threadId: string): Promise<unknown> {
    this.readThreadIds.push(threadId);
    return {
      thread: {
        id: threadId,
        cwd: "/workspace/project",
        name: "Sub-agent",
        preview: ""
      }
    };
  }

  async listThreadTurns(): Promise<unknown> {
    return {
      data: [],
      nextCursor: null
    };
  }
}

/** Creates the runtime settings port required by the completed-turn tests. */
function createSettingsPort(settings: OpenCodexSettings): RuntimeSettingsPort {
  return {
    getSettings: () => settings,
    setSettings: () => undefined
  };
}

/** Creates the runtime event port required by the completed-turn tests. */
function createEventPort(
  emit: (event: OpenCodexEvent) => void = () => undefined
): RuntimeEventPort {
  return {
    emit,
    recordRawNotification: () => undefined,
    recordClientRequest: () => undefined,
    readThreadEventLog: () => ({ entries: [], truncated: false })
  };
}

/** Creates a minimal client port around one test client factory. */
function createClientPort(
  ensureClient: ClientPort["ensureClient"]
): ClientPort {
  return {
    ensureClient,
    getClient: () => undefined,
    restartClient: async () => undefined
  };
}

/** Creates a minimal source/project port around the methods used by these tests. */
function createProjectPort(
  overrides: Partial<ProjectSourcePort>
): ProjectSourcePort {
  return {
    resolveSource: async () => ({ id: "source-1" }) as never,
    resolveRequestedSource: async () => ({ id: "source-1" }) as never,
    cacheProject: async () => null,
    readCachedProjects: async () => [],
    ...overrides
  };
}

/** Creates a minimal collaboration adapter for synchronization tests. */
function createCollaborationPort(
  overrides: Partial<Pick<
    CollaborationService,
    "reconcileTurns" | "reconcileDescendantThreads"
  >> = {}
): Pick<
  CollaborationService,
  "reconcileTurns" | "reconcileDescendantThreads"
> {
  return {
    reconcileTurns: async () => undefined,
    reconcileDescendantThreads: async () => undefined,
    ...overrides
  };
}

/** Creates a thread shape suitable for memory and snapshot fixtures. */
function createThread(patch: Partial<OpenCodexThread> = {}): OpenCodexThread {
  return {
    id: "thread-1",
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
    sessionId: null,
    parentThreadId: null,
    isArchived: false,
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    subAgentSource: null,
    canAcceptDirectInput: null,
    ...patch
  };
}

/** Creates the settings fields consulted by thread synchronization. */
function createSettings(): OpenCodexSettings {
  return {
    codexCommand: "codex",
    defaultSourceId: "source-1",
    defaultModel: "gpt-5.5",
    defaultReasoningEffort: "medium",
    commitMessageModel: null,
    commitMessageReasoningEffort: null,
    commitMessageLanguage: "en",
    showActivityPanel: true,
    experimentalApi: false,
    allowTurnSteering: true,
    language: "en",
    colorScheme: "system",
    enterKeyBehavior: "newline",
    versioningVocabulary: "simple",
    discordRichPresenceEnabled: true,
    onboardingCompleted: true,
    allowOutdatedCodex: false,
    developerMode: false,
    performanceMonitoringEnabled: true,
    advancedPerformanceMonitoringEnabled: false
  };
}
