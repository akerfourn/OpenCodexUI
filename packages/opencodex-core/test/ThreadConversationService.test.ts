/**
 * Covers thread conversation source fallback behavior.
 */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexThread,
  OpenCodexTurnExecutionMetadata
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it } from "vitest";

import { ThreadTurnCache } from "../src/ThreadTurnCache";
import type { CollaborationService } from "../src/backend/CollaborationService";
import { ThreadConversationService } from "../src/backend/ThreadConversationService";
import { ThreadCacheService } from "../src/backend/ThreadCacheService";
import type {
  ClientPort,
  ProjectSourcePort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "../src/backend/runtime/runtimePorts";

describe("ThreadConversationService", () => {
  it("should use the request source when an existing cached thread has no source", async () => {
    const threadTurnCache = new ThreadTurnCache();
    const thread = createThread({ sourceId: null });
    threadTurnCache.getOrCreate(thread);
    const writtenThreads: OpenCodexThread[] = [];
    let executionMetadata: OpenCodexTurnExecutionMetadata | null = null;
    const client = new FakeCodexClient();
    const events: OpenCodexEvent[] = [];
    const service = new ThreadConversationService({
      backendOptions: { projectPath: "/workspace/project" },
      threadTurnCache,
      threadCacheService: {
        readSnapshot: async () => null,
        writeIndex: async (threads: OpenCodexThread[]) => {
          writtenThreads.push(...threads);
        },
        writeTurnExecutionMetadata: async (
          _sourceId: string,
          _threadId: string,
          _turnId: string,
          metadata: OpenCodexTurnExecutionMetadata
        ) => {
          executionMetadata = metadata;
        }
      } as unknown as ThreadCacheService,
      settings: createSettingsPort(createSettings()),
      events: createEventPort((event) => {
        events.push(event);
      }),
      clients: createClientPort(async (sourceId) => {
        expect(sourceId).toBe("source-1");
        return client.asCodexClient();
      }),
      projects: createProjectPort({
        resolveSource: async (sourceId) => ({
        id: sourceId ?? "source-1"
        }) as never,
        cacheProject: async () => null,
        readCachedProjects: async () => []
      }),
      collaborationService: createCollaborationPort(),
      handleClientError: () => {}
    });

    const result = await service.startTurn(
      "thread-1",
      "/workspace/project",
      "source-1",
      "Hello",
      [],
      [],
      "gpt-5.5",
      "medium",
      "fast"
    );

    expect(result).toEqual({ threadId: "thread-1", turnId: "turn-1" });
    expect(threadTurnCache.get("thread-1")?.thread.sourceId).toBe("source-1");
    expect(writtenThreads).toMatchObject([{ id: "thread-1", sourceId: "source-1" }]);
    expect(client.startedTurns).toHaveLength(1);
    expect(executionMetadata).toEqual({
      requestedModel: "gpt-5.5",
      effectiveModel: "gpt-5.5",
      requestedReasoningEffort: "medium",
      effectiveReasoningEffort: "medium",
      serviceTier: "fast"
    });
    expect(events.some((event) => event.type === "message.started")).toBe(true);
  });

  it("should unwrap paginated thread item entries returned by Codex 0.147", async () => {
    const threadTurnCache = new ThreadTurnCache();
    const settings = createSettings();
    const threadCacheService = new ThreadCacheService({
      cacheRepository: null,
      threadTurnCache,
      settings: createSettingsPort(settings),
      events: createEventPort()
    });
    const client = new PaginatedItemsCodexClient();
    const reconciledTurns: unknown[] = [];
    const service = new ThreadConversationService({
      backendOptions: { projectPath: "/workspace/project" },
      threadTurnCache,
      threadCacheService,
      settings: createSettingsPort(settings),
      events: createEventPort(),
      clients: createClientPort(async () => client.asCodexClient()),
      projects: createProjectPort({
        resolveSource: async (sourceId) => ({
        id: sourceId ?? "source-1"
        }) as never,
        cacheProject: async () => null,
        readCachedProjects: async () => []
      }),
      collaborationService: createCollaborationPort({
        reconcileTurns: async (_sourceId, _threadId, turns) => {
        reconciledTurns.push(...turns);
        }
      }),
      handleClientError: () => {}
    });

    const result = await service.openThread("thread-1", "source-1");

    expect(client.listedItemTurns).toEqual(["turn-1"]);
    expect(result.turns).toMatchObject([{
      id: "turn-1",
      items: [{
        id: "message-1",
        role: "assistant",
        content: "Completed by the sub-agent."
      }]
    }]);
    expect(reconciledTurns).toMatchObject([{
      id: "turn-1",
      items: [{ id: "message-1", type: "agentMessage" }]
    }]);
  });

  it("should publish a started sub-agent without selecting it as a created chat", async () => {
    const threadTurnCache = new ThreadTurnCache();
    const events: OpenCodexEvent[] = [];
    const writtenThreads: OpenCodexThread[] = [];
    const service = new ThreadConversationService({
      backendOptions: { projectPath: "/workspace/project" },
      threadTurnCache,
      threadCacheService: {
        writeIndex: async (threads: OpenCodexThread[]) => {
          writtenThreads.push(...threads);
        }
      } as unknown as ThreadCacheService,
      settings: createSettingsPort(createSettings()),
      events: createEventPort((event) => events.push(event)),
      clients: createClientPort(async () => new FakeCodexClient().asCodexClient()),
      projects: createProjectPort({
        resolveSource: async () => ({ id: "source-1" }) as never,
        cacheProject: async () => null,
        readCachedProjects: async () => []
      }),
      collaborationService: createCollaborationPort(),
      handleClientError: () => undefined
    });

    await service.recordStartedThread({
      id: "child-1",
      cwd: "/workspace/project",
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "parent-1",
            depth: 1,
            agent_path: "/root/reviewer",
            agent_nickname: "Luna",
            agent_role: "reviewer"
          }
        }
      },
      canAcceptDirectInput: false,
      status: { type: "active" }
    }, "source-1");

    expect(events).toEqual([
      expect.objectContaining({
        type: "thread.discovered",
        thread: expect.objectContaining({
          id: "child-1",
          parentThreadId: "parent-1",
          sourceId: "source-1",
          canAcceptDirectInput: false
        })
      })
    ]);
    expect(events.some((event) => event.type === "thread.created")).toBe(false);
    expect(writtenThreads).toMatchObject([{ id: "child-1", sourceId: "source-1" }]);
    expect(threadTurnCache.get("child-1")?.thread.parentThreadId).toBe("parent-1");
  });

  it("should restore active and archived sub-agent descendants for an orphan source", async () => {
    const threadTurnCache = new ThreadTurnCache();
    const activeChild = createThread({
      id: "child-1",
      sourceId: null,
      parentThreadId: "parent-1"
    });
    const archivedGrandchild = createThread({
      id: "grandchild-1",
      sourceId: null,
      parentThreadId: "child-1",
      isArchived: true
    });
    const unrelatedThread = createThread({
      id: "unrelated",
      sourceId: null,
      parentThreadId: "other-root"
    });
    const service = new ThreadConversationService({
      backendOptions: { projectPath: "/workspace/project" },
      threadTurnCache,
      threadCacheService: {
        readThreads: async (
          _scope: string,
          _projectPath: string | null,
          _sourceId: string | null,
          _searchTerm: string | undefined,
          isArchived: boolean
        ) => isArchived ? [archivedGrandchild] : [activeChild, unrelatedThread]
      } as unknown as ThreadCacheService,
      settings: createSettingsPort(createSettings()),
      events: createEventPort(),
      clients: createClientPort(async () => {
        throw new Error("An orphan hierarchy must not start Codex.");
      }),
      projects: createProjectPort({
        resolveSource: async () => ({ id: "source-1" }) as never,
        cacheProject: async () => null,
        readCachedProjects: async () => []
      }),
      collaborationService: createCollaborationPort(),
      handleClientError: () => undefined
    });

    const descendants = await service.listSubAgentThreads("parent-1", null);

    expect(descendants.map((thread) => thread.id)).toEqual(["child-1", "grandchild-1"]);
  });
});

class FakeCodexClient {
  readonly startedTurns: unknown[] = [];

  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  async startTurn(params: unknown): Promise<unknown> {
    this.startedTurns.push(params);
    return { turn: { id: "turn-1" } };
  }
}

class PaginatedItemsCodexClient {
  readonly listedItemTurns: string[] = [];

  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  async readThread(): Promise<unknown> {
    return {
      thread: {
        id: "thread-1",
        cwd: "/workspace/project",
        name: "Sub-agent",
        preview: "",
        turns: []
      }
    };
  }

  async listThreadTurns(): Promise<unknown> {
    return {
      data: [{
        id: "turn-1",
        status: "completed",
        itemsView: "summary",
        items: []
      }],
      nextCursor: null
    };
  }

  async listThreadTurnItems(params: { turnId?: string | null }): Promise<unknown> {
    this.listedItemTurns.push(params.turnId ?? "");
    return {
      data: [{
        turnId: "turn-1",
        item: {
          type: "agentMessage",
          id: "message-1",
          text: "Completed by the sub-agent.",
          phase: "final_answer",
          memoryCitation: null
        }
      }],
      nextCursor: null,
      backwardsCursor: null
    };
  }
}

/** Creates the runtime settings port required by thread service tests. */
function createSettingsPort(settings: OpenCodexSettings): RuntimeSettingsPort {
  return {
    getSettings: () => settings,
    setSettings: () => undefined
  };
}

/** Creates the runtime event port required by thread service tests. */
function createEventPort(
  emit: (event: OpenCodexEvent) => void = () => undefined
): RuntimeEventPort {
  return {
    emit,
    recordRawNotification: () => undefined,
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

/** Creates a minimal source/project port around the methods used by a test. */
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

/** Creates a minimal collaboration adapter for thread reconciliation tests. */
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
