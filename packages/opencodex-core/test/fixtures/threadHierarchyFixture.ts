import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { ThreadTurnCache } from "../../src/ThreadTurnCache";
import { ThreadConversationService } from "../../src/backend/ThreadConversationService";
import type { ThreadCacheService } from "../../src/backend/ThreadCacheService";

/** Configures cache rows and Codex responses for hierarchy tests. */
export type ThreadHierarchyFixtureOptions = {
  activeThreads?: OpenCodexThread[];
  archivedThreads?: OpenCodexThread[];
  listResponses?: unknown[];
  listError?: Error;
};

/** Exposes the service doubles and all observable hierarchy operations. */
export type ThreadHierarchyFixture = {
  service: ThreadConversationService;
  threadTurnCache: ThreadTurnCache;
  client: HierarchyCodexClient;
  calls: string[];
  events: OpenCodexEvent[];
  readThreadsArgs: Array<[
    "currentProject" | "all",
    string | null,
    string | null | undefined,
    string | undefined,
    boolean
  ]>;
  indexedThreads: OpenCodexThread[];
  reconciledDescendants: Array<{
    sourceId: string;
    parentThreadId: string;
    threads: OpenCodexThread[];
  }>;
};

/** Creates a conversation service with narrow, observable hierarchy ports. */
export function createThreadHierarchyFixture(
  options: ThreadHierarchyFixtureOptions = {}
): ThreadHierarchyFixture {
  const calls: string[] = [];
  const events: OpenCodexEvent[] = [];
  const readThreadsArgs: ThreadHierarchyFixture["readThreadsArgs"] = [];
  const indexedThreads: OpenCodexThread[] = [];
  const reconciledDescendants: ThreadHierarchyFixture["reconciledDescendants"] = [];
  const threadTurnCache = new ThreadTurnCache();
  const client = new HierarchyCodexClient({
    calls,
    listResponses: options.listResponses,
    listError: options.listError
  });
  const activeThreads = options.activeThreads ?? [];
  const archivedThreads = options.archivedThreads ?? [];

  const service = new ThreadConversationService({
    backendOptions: { projectPath: "/workspace/project" },
    threadTurnCache,
    threadCacheService: {
      readThreads: async (
        scope: "currentProject" | "all",
        projectPath: string | null,
        sourceId: string | null | undefined,
        searchTerm: string | undefined,
        isArchived: boolean
      ) => {
        calls.push(`readThreads:${isArchived ? "archived" : "active"}`);
        readThreadsArgs.push([scope, projectPath, sourceId, searchTerm, isArchived]);
        return isArchived ? archivedThreads : activeThreads;
      },
      writeIndex: async (threads: OpenCodexThread[]) => {
        calls.push("writeIndex");
        indexedThreads.push(...threads);
      }
    } as unknown as ThreadCacheService,
    settings: {
      getSettings: (): OpenCodexSettings => ({
        defaultModel: "gpt-5.5",
        defaultReasoningEffort: "medium",
        language: "en"
      } as OpenCodexSettings)
    },
    events: {
      emit: (event: OpenCodexEvent) => {
        calls.push(`event:${event.type}`);
        events.push(event);
      }
    },
    clients: {
      ensureClient: async () => {
        calls.push("ensureClient");
        return client.asCodexClient();
      }
    },
    projects: {
      resolveSource: async (sourceId: string | null) => ({ id: sourceId ?? "source-1" }) as never,
      cacheProject: async () => null,
      readCachedProjects: async () => []
    },
    collaborationService: {
      reconcileTurns: async () => undefined,
      reconcileDescendantThreads: async (
        sourceId: string,
        parentThreadId: string,
        threads: readonly OpenCodexThread[]
      ) => {
        calls.push("reconcileDescendantThreads");
        reconciledDescendants.push({ sourceId, parentThreadId, threads: [...threads] });
      }
    },
    handleClientError: () => undefined
  });

  return {
    service,
    threadTurnCache,
    client,
    calls,
    events,
    readThreadsArgs,
    indexedThreads,
    reconciledDescendants
  };
}

/** Implements only the Codex thread-list method needed by hierarchy tests. */
export class HierarchyCodexClient {
  /** Payloads sent to the paginated thread-list RPC. */
  readonly listThreadParams: unknown[] = [];

  /** Shared operation log used by the fixture assertions. */
  private readonly calls: string[];

  /** Remaining responses returned by the thread-list RPC. */
  private readonly listResponses: unknown[];

  /** Optional error raised by every thread-list RPC call. */
  private readonly listError: Error | undefined;

  /** Creates a deterministic paginated or failing Codex client double. */
  constructor(options: {
    calls: string[];
    listResponses?: unknown[];
    listError?: Error;
  }) {
    this.calls = options.calls;
    this.listResponses = [...(options.listResponses ?? [{ data: [] }])];
    this.listError = options.listError;
  }

  /** Returns this double through the production client boundary. */
  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  /** Records a thread-list request and returns the next configured response. */
  async listThreads(params: unknown): Promise<unknown> {
    this.calls.push("rpc:listThreads");
    this.listThreadParams.push(params);

    if (this.listError !== undefined) {
      throw this.listError;
    }

    return this.listResponses.shift() ?? { data: [] };
  }
}

/** Builds complete metadata for a cached hierarchy row. */
export function createHierarchyThread(
  patch: Partial<OpenCodexThread> = {}
): OpenCodexThread {
  return {
    id: "thread-1",
    sessionId: null,
    parentThreadId: null,
    codexTitle: "Thread",
    customTitle: null,
    title: "Thread",
    preview: "",
    model: "gpt-5.5",
    reasoningEffort: "medium",
    projectName: "project",
    projectPath: "/workspace/project",
    sourceId: "source-1",
    branchName: null,
    updatedAt: null,
    isArchived: false,
    threadSource: "subAgentThreadSpawn",
    agentNickname: null,
    agentRole: null,
    subAgentSource: null,
    canAcceptDirectInput: false,
    ...patch
  };
}
