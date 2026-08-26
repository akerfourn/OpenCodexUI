/**
 * Characterizes Codex turn-page loading through ThreadConversationService.
 */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
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

describe("ThreadConversationService turn-page loading", () => {
  it("should not request item pages when the latest page is already full", async () => {
    const fixture = createFixture({
      latestPage: {
        data: [createTurn("turn-full", {
          itemsView: "full",
          items: [createAgentItem("message-full", "Already complete.")]
        })],
        nextCursor: null
      }
    });

    const result = await fixture.service.openThread("thread-1", "source-1");

    expect(fixture.client.turnPageRequests).toEqual([{
      threadId: "thread-1",
      limit: 20,
      sortDirection: "desc",
      itemsView: "full"
    }]);
    expect(fixture.client.itemPageRequests).toEqual([]);
    expect(result.turns).toMatchObject([{
      id: "turn-full",
      items: [{ id: "message-full", content: "Already complete." }]
    }]);
  });

  it("should load all item pages, unwrap entries, and preserve the older cursor", async () => {
    const fixture = createFixture({
      latestPage: {
        data: [createTurn("turn-paged")],
        nextCursor: "older-page-2"
      },
      itemPages: {
        "turn-paged": [
          {
            data: [{ item: createAgentItem("message-1", "First page.") }],
            nextCursor: "item-page-2"
          },
          {
            data: [{ item: createAgentItem("message-2", "Second page.") }],
            nextCursor: null
          }
        ]
      }
    });

    const result = await fixture.service.openThread("thread-1", "source-1");

    expect(fixture.client.itemPageRequests).toEqual([
      {
        threadId: "thread-1",
        turnId: "turn-paged",
        cursor: null,
        limit: 200,
        sortDirection: "asc"
      },
      {
        threadId: "thread-1",
        turnId: "turn-paged",
        cursor: "item-page-2",
        limit: 200,
        sortDirection: "asc"
      }
    ]);
    expect(result.turns).toMatchObject([{
      id: "turn-paged",
      items: [
        { id: "message-1", content: "First page." },
        { id: "message-2", content: "Second page." }
      ]
    }]);
    expect(fixture.threadTurnCache.get("thread-1")?.olderCursor)
      .toBe("older-page-2");
  });

  it("should keep one original turn when item completion fails and continue with others", async () => {
    const originalItem = createAgentItem("message-original", "Summary payload.");
    const fixture = createFixture({
      latestPage: {
        data: [
          createTurn("turn-failing", { items: [originalItem] }),
          createTurn("turn-success")
        ],
        nextCursor: null
      },
      itemPages: {
        "turn-failing": [new Error("item page unavailable")],
        "turn-success": [{
          data: [{ item: createAgentItem("message-success", "Completed payload.") }],
          nextCursor: null
        }]
      }
    });

    const result = await fixture.service.openThread("thread-1", "source-1");

    expect(fixture.client.itemPageRequests.map(({ turnId }) => turnId))
      .toEqual(["turn-failing", "turn-success"]);
    expect(result.turns).toMatchObject([
      {
        id: "turn-failing",
        items: [{ id: "message-original", content: "Summary payload." }]
      },
      {
        id: "turn-success",
        items: [{ id: "message-success", content: "Completed payload." }]
      }
    ]);
  });

  it("should merge older turns, preserve their cursor, and emit a prepend event", async () => {
    const fixture = createFixture({
      olderPages: {
        "older-page-2": {
          data: [createTurn("turn-old", {
            itemsView: "full",
            startedAt: "2026-08-19T10:00:00.000Z",
            items: [createAgentItem("message-old", "Older payload.")]
          })],
          nextCursor: "older-page-3"
        }
      }
    });
    const entry = fixture.threadTurnCache.getOrCreate(createThread());
    fixture.threadTurnCache.mergeLatestTurns(
      entry,
      [createTurn("turn-latest", {
        itemsView: "full",
        startedAt: "2026-08-20T10:00:00.000Z",
        items: [createAgentItem("message-latest", "Latest payload.")]
      })],
      "older-page-2"
    );

    const result = await fixture.service.loadOlderThreadMessages("thread-1");

    expect(fixture.client.turnPageRequests).toEqual([{
      threadId: "thread-1",
      cursor: "older-page-2",
      limit: 20,
      sortDirection: "desc",
      itemsView: "full"
    }]);
    expect(result).toMatchObject({
      turns: [{ id: "turn-old", items: [{ id: "message-old" }] }],
      hasMoreOlderMessages: true
    });
    expect(entry.olderCursor).toBe("older-page-3");
    expect(fixture.threadTurnCache.toTurns(entry).map(readTurnId))
      .toEqual(["turn-old", "turn-latest"]);
    expect(fixture.events).toContainEqual(expect.objectContaining({
      type: "thread.turns.prepended",
      sourceId: "source-1",
      threadId: "thread-1",
      hasMoreOlderMessages: true
    }));
  });
});

type TurnPage = { data: unknown[]; nextCursor: string | null };
type ItemPage = TurnPage | Error;
type ListThreadTurnsPayload = {
  threadId: string;
  cursor?: string | null;
  limit: number;
  sortDirection: "desc";
  itemsView: "full";
};
type ListThreadTurnItemsPayload = {
  threadId: string;
  turnId: string;
  cursor: string | null;
  limit: number;
  sortDirection: "asc";
};
type FixtureOptions = {
  latestPage?: TurnPage;
  olderPages?: Record<string, TurnPage>;
  itemPages?: Record<string, ItemPage[]>;
};

type Fixture = {
  service: ThreadConversationService;
  threadTurnCache: ThreadTurnCache;
  client: PaginationCodexClient;
  events: OpenCodexEvent[];
};

/** Creates the smallest service boundary needed to exercise turn pagination. */
function createFixture(options: FixtureOptions = {}): Fixture {
  const threadTurnCache = new ThreadTurnCache();
  const events: OpenCodexEvent[] = [];
  const client = new PaginationCodexClient(options);
  const eventPort: Pick<RuntimeEventPort, "emit" | "recordClientRequest"> = {
    emit: (event) => events.push(event),
    recordClientRequest: () => undefined
  };
  const settings: Pick<RuntimeSettingsPort, "getSettings"> = {
    getSettings: () => createSettings()
  };
  const threadCacheService = new ThreadCacheService({
    cacheRepository: null,
    threadTurnCache,
    settings,
    events: eventPort
  });

  const service = new ThreadConversationService({
    backendOptions: { projectPath: "/workspace/project" },
    threadTurnCache,
    threadCacheService,
    settings,
    events: eventPort,
    clients: createClientPort(client),
    projects: createProjectPort(),
    collaborationService: createCollaborationPort(),
    handleClientError: () => undefined
  });

  return { service, threadTurnCache, client, events };
}

/** Creates a fake client with independently controllable turn and item pages. */
class PaginationCodexClient {
  /** Captures complete turn-page RPC payloads in call order. */
  readonly turnPageRequests: ListThreadTurnsPayload[] = [];

  /** Captures complete item-page RPC payloads in call order. */
  readonly itemPageRequests: ListThreadTurnItemsPayload[] = [];

  /** Latest turn page returned when no cursor is provided. */
  private readonly latestPage: TurnPage;

  /** Older turn pages indexed by their request cursor. */
  private readonly olderPages: Record<string, TurnPage>;

  /** Item pages or failures indexed by turn identifier. */
  private readonly itemPages: Record<string, ItemPage[]>;

  /** Tracks the next configured item page for each turn. */
  private readonly itemPageIndexes = new Map<string, number>();

  /** Stores deterministic pages used by the fake RPC methods. */
  constructor(options: FixtureOptions) {
    this.latestPage = options.latestPage ?? { data: [], nextCursor: null };
    this.olderPages = options.olderPages ?? {};
    this.itemPages = options.itemPages ?? {};
  }

  /** Exposes this fake through the production client boundary. */
  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  /** Returns stable metadata for the requested thread. */
  async readThread(threadId: string): Promise<unknown> {
    return {
      thread: {
        id: threadId,
        cwd: "/workspace/project",
        name: "Thread",
        preview: ""
      }
    };
  }

  /** Records and resolves a latest or older turn-page request. */
  async listThreadTurns(params: ListThreadTurnsPayload): Promise<unknown> {
    const cursor = params.cursor ?? null;
    this.turnPageRequests.push(params);
    return cursor === null
      ? this.latestPage
      : this.olderPages[cursor] ?? { data: [], nextCursor: null };
  }

  /** Records and resolves the next configured item page for one turn. */
  async listThreadTurnItems(params: ListThreadTurnItemsPayload): Promise<unknown> {
    const { turnId } = params;
    this.itemPageRequests.push(params);
    const pageIndex = this.itemPageIndexes.get(turnId) ?? 0;
    this.itemPageIndexes.set(turnId, pageIndex + 1);
    const page = this.itemPages[turnId]?.[pageIndex] ?? { data: [], nextCursor: null };

    if (page instanceof Error) {
      throw page;
    }

    return page;
  }
}

/** Creates a raw turn with the fields used by the core turn mapper. */
function createTurn(id: string, patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    status: "completed",
    itemsView: "summary",
    items: [],
    ...patch
  };
}

/** Creates a raw assistant item that maps to a stable OpenCodex turn item. */
function createAgentItem(id: string, text: string): Record<string, unknown> {
  return {
    type: "agentMessage",
    id,
    text,
    phase: "final_answer"
  };
}

/** Reads a raw turn identifier from the shared cache representation. */
function readTurnId(turn: unknown): string {
  return typeof turn === "object" && turn !== null && "id" in turn
    && typeof turn.id === "string"
    ? turn.id
    : "";
}

/** Creates a thread shape suitable for direct cache pagination setup. */
function createThread(): OpenCodexThread {
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
    canAcceptDirectInput: null
  };
}

/** Creates the settings consulted while mapping loaded turns. */
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

/** Creates the client port around the deterministic fake Codex client. */
function createClientPort(client: PaginationCodexClient): Pick<ClientPort, "ensureClient"> {
  return {
    ensureClient: async () => client.asCodexClient()
  };
}

/** Creates the source/project port needed by ThreadConversationService. */
function createProjectPort(): Pick<
  ProjectSourcePort,
  "resolveSource" | "cacheProject" | "readCachedProjects"
> {
  return {
    resolveSource: async (sourceId) => ({ id: sourceId ?? "source-1" }) as never,
    cacheProject: async () => null,
    readCachedProjects: async () => []
  };
}

/** Creates the collaboration adapter used when turns enter the cache. */
function createCollaborationPort(): Pick<
  CollaborationService,
  "reconcileTurns" | "reconcileDescendantThreads"
> {
  return {
    reconcileTurns: async () => undefined,
    reconcileDescendantThreads: async () => undefined
  };
}
