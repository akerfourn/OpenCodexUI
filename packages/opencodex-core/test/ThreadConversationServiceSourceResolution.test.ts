/**
 * Characterizes source ownership resolution through public thread actions.
 */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { CachedThreadSnapshot } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexThread
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

describe("ThreadConversationService source resolution", () => {
  it("should prefer the in-memory source over a request fallback", async () => {
    const fixture = createFixture({
      memoryThread: createThread({ sourceId: "source-memory" })
    });

    await startExistingTurn(fixture, "source-fallback");

    expect(fixture.ensureSourceIds).toEqual(["source-memory"]);
    expect(fixture.resolvedSourceIds).toEqual(["source-memory"]);
  });

  it("should prefer the SQLite source over a request fallback", async () => {
    const fixture = createFixture({
      snapshot: createSnapshot(createThread({ sourceId: "source-sqlite" }))
    });

    await startExistingTurn(fixture, "source-fallback");

    expect(fixture.ensureSourceIds).toEqual(["source-sqlite"]);
    expect(fixture.resolvedSourceIds).toEqual(["source-sqlite"]);
  });

  it("should repair an in-memory thread from the request fallback", async () => {
    const fixture = createFixture({
      memoryThread: createThread({ sourceId: null })
    });

    await startExistingTurn(fixture, "source-fallback");

    expect(fixture.ensureSourceIds).toEqual(["source-fallback"]);
    expect(fixture.resolvedSourceIds).toEqual(["source-fallback"]);
    expect(fixture.threadTurnCache.get("thread-1")?.thread.sourceId)
      .toBe("source-fallback");
    expect(fixture.writtenThreads).toEqual([
      expect.objectContaining({ id: "thread-1", sourceId: "source-fallback" })
    ]);
  });

  it("should repair a SQLite thread from the request fallback", async () => {
    const fixture = createFixture({
      snapshot: createSnapshot(createThread({ sourceId: null }))
    });

    await startExistingTurn(fixture, "source-fallback");

    expect(fixture.ensureSourceIds).toEqual(["source-fallback"]);
    expect(fixture.resolvedSourceIds).toEqual(["source-fallback"]);
    expect(fixture.writtenThreads).toEqual([
      expect.objectContaining({ id: "thread-1", sourceId: "source-fallback" })
    ]);
  });

  it("should reject an interrupt without a source or fallback before ensuring a client", async () => {
    const fixture = createFixture();

    await expect(fixture.service.interruptTurn("thread-1", "turn-1"))
      .rejects.toThrow("Cannot interrupt a thread without a Codex source.");

    expect(fixture.ensureSourceIds).toEqual([]);
    expect(fixture.resolvedSourceIds).toEqual([]);
  });
});

type SourceResolutionFixture = {
  service: ThreadConversationService;
  threadTurnCache: ThreadTurnCache;
  ensureSourceIds: Array<string | null>;
  resolvedSourceIds: string[];
  writtenThreads: OpenCodexThread[];
};

type SourceResolutionFixtureOptions = {
  memoryThread?: OpenCodexThread;
  snapshot?: CachedThreadSnapshot | null;
};

/** Creates a service fixture with observable source and cache boundaries. */
function createFixture(options: SourceResolutionFixtureOptions = {}): SourceResolutionFixture {
  const threadTurnCache = new ThreadTurnCache();

  if (options.memoryThread !== undefined) {
    threadTurnCache.getOrCreate(options.memoryThread);
  }

  const ensureSourceIds: Array<string | null> = [];
  const resolvedSourceIds: string[] = [];
  const writtenThreads: OpenCodexThread[] = [];
  const snapshot = options.snapshot ?? null;
  const service = new ThreadConversationService({
    backendOptions: { projectPath: "/workspace/project" },
    threadTurnCache,
    threadCacheService: {
      readSnapshot: async () => snapshot,
      writeIndex: async (threads: OpenCodexThread[]) => {
        writtenThreads.push(...threads);
      },
      writeTurnExecutionMetadata: async () => undefined
    } as unknown as ThreadCacheService,
    settings: createSettingsPort(createSettings()),
    events: createEventPort(),
    clients: createClientPort(async (sourceId) => {
      ensureSourceIds.push(sourceId);
      return new SourceResolutionCodexClient().asCodexClient();
    }),
    projects: createProjectPort({
      resolveSource: async (sourceId) => {
        if (sourceId !== null) {
          resolvedSourceIds.push(sourceId);
        }

        return { id: sourceId ?? "source-default" } as never;
      }
    }),
    collaborationService: createCollaborationPort(),
    handleClientError: () => undefined
  });

  return {
    service,
    threadTurnCache,
    ensureSourceIds,
    resolvedSourceIds,
    writtenThreads
  };
}

/** Starts an existing thread without involving the unrelated resume path. */
async function startExistingTurn(
  fixture: SourceResolutionFixture,
  fallbackSourceId: string
): Promise<void> {
  await fixture.service.startTurn(
    "thread-1",
    "/workspace/project",
    fallbackSourceId,
    "Hello",
    [],
    [],
    null,
    null,
    null,
    false
  );
}

/** Creates the minimal cached snapshot needed to exercise SQLite resolution. */
function createSnapshot(thread: OpenCodexThread): CachedThreadSnapshot {
  return {
    thread: { ...thread } as CachedThreadSnapshot["thread"],
    turns: [],
    syncState: {
      threadId: thread.id,
      newestTurnId: null,
      oldestTurnId: null,
      olderCursor: null,
      hasLoadedLatest: false,
      hasLoadedAllOlderTurns: false,
      lastSyncedAt: null
    },
    tokenUsage: null
  };
}

/** Creates a thread shape suitable for memory and SQLite fixtures. */
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
    sourceId: "source-default",
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

/** Creates the runtime settings port required by thread service tests. */
function createSettingsPort(settings: OpenCodexSettings): RuntimeSettingsPort {
  return {
    getSettings: () => settings,
    setSettings: () => undefined
  };
}

/** Creates a minimal event port because source resolution does not inspect events. */
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

/** Creates a minimal source/project port around the methods used by this suite. */
function createProjectPort(
  overrides: Partial<ProjectSourcePort>
): ProjectSourcePort {
  return {
    resolveSource: async () => ({ id: "source-default" }) as never,
    resolveRequestedSource: async () => ({ id: "source-default" }) as never,
    cacheProject: async () => null,
    readCachedProjects: async () => [],
    ...overrides
  };
}

/** Creates a minimal collaboration adapter for the service constructor. */
function createCollaborationPort(): Pick<
  CollaborationService,
  "reconcileTurns" | "reconcileDescendantThreads"
> {
  return {
    reconcileTurns: async () => undefined,
    reconcileDescendantThreads: async () => undefined
  };
}

/** Creates the settings consulted while a representative turn starts. */
function createSettings(): OpenCodexSettings {
  return {
    codexCommand: "codex",
    defaultSourceId: "source-default",
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

/** Provides the minimal Codex response needed by startTurn. */
class SourceResolutionCodexClient {
  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  async startTurn(): Promise<unknown> {
    return { turn: { id: "turn-1" } };
  }
}
