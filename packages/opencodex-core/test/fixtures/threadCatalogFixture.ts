import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { CachedThreadSnapshot } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { ThreadTurnCache } from "../../src/ThreadTurnCache";
import { ThreadConversationService } from "../../src/backend/threads/ThreadConversationService";
import type { ThreadCacheService } from "../../src/backend/threads/ThreadCacheService";

export type FixtureOptions = {
  client?: CatalogCodexClient;
  cachedThreads?: OpenCodexThread[];
  resolvedSourceId?: string;
  snapshot?: CachedThreadSnapshot | null;
  seedThread?: OpenCodexThread;
};

export type Fixture = {
  service: ThreadConversationService;
  threadTurnCache: ThreadTurnCache;
  client: CatalogCodexClient;
  calls: string[];
  events: OpenCodexEvent[];
  ensureSourceIds: Array<string | null>;
  deleteEmptyUnsyncedArgs: Array<[string | null, string | null]>;
  readThreadsArgs: Array<[
    "currentProject" | "all",
    string | null,
    string | null | undefined,
    string | undefined,
    boolean
  ]>;
  indexedThreads: OpenCodexThread[];
  cachedProjectArgs: Array<[string | null, string | null]>;
  archiveStateWrites: Array<[string, boolean]>;
  titleWrites: Array<[string, string]>;
};

/** Creates a service with narrow observable ports for catalog operations. */
export function createFixture(options: FixtureOptions = {}): Fixture {
  const calls: string[] = [];
  const events: OpenCodexEvent[] = [];
  const ensureSourceIds: Array<string | null> = [];
  const deleteEmptyUnsyncedArgs: Array<[string | null, string | null]> = [];
  const readThreadsArgs: Array<[
    "currentProject" | "all",
    string | null,
    string | null | undefined,
    string | undefined,
    boolean
  ]> = [];
  const indexedThreads: OpenCodexThread[] = [];
  const cachedProjectArgs: Array<[string | null, string | null]> = [];
  const archiveStateWrites: Array<[string, boolean]> = [];
  const titleWrites: Array<[string, string]> = [];
  const threadTurnCache = new ThreadTurnCache();
  const client = options.client ?? new CatalogCodexClient();
  client.calls = calls;
  const readThreads = options.cachedThreads ?? [];

  if (options.seedThread !== undefined) {
    threadTurnCache.getOrCreate(options.seedThread);
  }

  const service = new ThreadConversationService({
    backendOptions: { projectPath: "/workspace/backend" },
    threadTurnCache,
    threadCacheService: {
      deleteEmptyUnsyncedThreads: async (projectPath: string | null, sourceId: string | null) => {
        calls.push("deleteEmptyUnsyncedThreads");
        deleteEmptyUnsyncedArgs.push([projectPath, sourceId]);
      },
      readThreads: async (
        scope: "currentProject" | "all",
        projectPath: string | null,
        sourceId: string | null | undefined,
        searchTerm: string | undefined,
        isArchived: boolean
      ) => {
        calls.push("readThreads");
        readThreadsArgs.push([scope, projectPath, sourceId, searchTerm, isArchived]);
        return readThreads;
      },
      readSnapshot: async () => {
        calls.push("readSnapshot");
        return options.snapshot ?? null;
      },
      writeIndex: async (threads: OpenCodexThread[]) => {
        calls.push("writeIndex");
        indexedThreads.push(...threads);
      },
      writeTitle: async (threadId: string, title: string) => {
        calls.push("writeTitle");
        titleWrites.push([threadId, title]);
      },
      writeArchiveState: async (threadId: string, isArchived: boolean) => {
        calls.push("writeArchiveState");
        archiveStateWrites.push([threadId, isArchived]);
      },
      deleteThread: async () => {
        calls.push("deleteThread");
      }
    } as unknown as ThreadCacheService,
    settings: {
      getSettings: (): OpenCodexSettings => ({
        defaultModel: "model-default",
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
      ensureClient: async (sourceId: string | null) => {
        calls.push("ensureClient");
        ensureSourceIds.push(sourceId);
        return client.asCodexClient();
      }
    },
    projects: {
      resolveSource: async () => {
        calls.push("resolveSource");
        return { id: options.resolvedSourceId ?? "source-1" } as never;
      },
      cacheProject: async (projectPath: string | null, sourceId: string | null) => {
        calls.push("cacheProject");
        cachedProjectArgs.push([projectPath, sourceId]);
        return null;
      },
      readCachedProjects: async () => {
        calls.push("readCachedProjects");
        return [];
      }
    },
    collaborationService: {
      reconcileTurns: async () => undefined,
      reconcileDescendantThreads: async () => undefined
    },
    handleClientError: () => undefined
  });

  return {
    service,
    threadTurnCache,
    client,
    calls,
    events,
    ensureSourceIds,
    deleteEmptyUnsyncedArgs,
    readThreadsArgs,
    indexedThreads,
    cachedProjectArgs,
    archiveStateWrites,
    titleWrites
  };
}

/** Builds the smallest valid protocol thread used by cache-facing tests. */
export function createThread(patch: Partial<OpenCodexThread> = {}): OpenCodexThread {
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

/** Builds a complete cache snapshot for source-aware mutations. */
export function createSnapshot(thread: OpenCodexThread): CachedThreadSnapshot {
  return {
    thread,
    turns: [],
    syncState: {
      threadId: thread.id,
      newestTurnId: null,
      oldestTurnId: null,
      olderCursor: null,
      hasLoadedLatest: false,
      hasLoadedAllOlderTurns: true,
      lastSyncedAt: null
    },
    tokenUsage: null
  };
}

/** Strict fake for the Codex methods used by the six catalog operations. */
export class CatalogCodexClient {
  /** Ordered RPC and fixture operations observed by the test. */
  calls: string[] = [];
  /** Payloads sent to thread/list. */
  readonly listThreadParams: unknown[] = [];
  /** Thread identifiers sent to thread/archive. */
  readonly archiveThreadIds: string[] = [];
  /** Thread identifiers sent to thread/unarchive. */
  readonly unarchiveThreadIds: string[] = [];
  /** Thread identifiers sent to thread/delete. */
  readonly deleteThreadIds: string[] = [];
  /** Payloads sent to thread/name/set. */
  readonly renameCalls: Array<{ threadId: string; name: string }> = [];
  /** Payload sent to thread/start. */
  startThreadParams: unknown = null;
  /** Responses returned by thread/list. */
  private readonly listResponses: unknown[];
  /** Response returned by thread/start. */
  private readonly startResponse: unknown;

  /** Creates a deterministic fake client with optional RPC responses. */
  constructor(options: { listResponses?: unknown[]; startResponse?: unknown } = {}) {
    this.listResponses = options.listResponses ?? [{ data: [] }];
    this.startResponse = options.startResponse ?? {
      thread: {
        id: "thread-created",
        cwd: "/workspace/project",
        name: "Created",
        preview: ""
      }
    };
  }

  /** Returns the fake through the production client boundary. */
  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  /** Records a thread-list request and returns one paginated response. */
  async listThreads(params: unknown): Promise<unknown> {
    this.calls.push("rpc:listThreads");
    this.listThreadParams.push(params);
    return this.listResponses.shift() ?? { data: [] };
  }

  /** Records a thread-start request and returns the configured response. */
  async startThread(params: unknown): Promise<unknown> {
    this.calls.push("rpc:startThread");
    this.startThreadParams = params;
    return this.startResponse;
  }

  /** Records an archive request. */
  async archiveThread(threadId: string): Promise<void> {
    this.calls.push("rpc:archiveThread");
    this.archiveThreadIds.push(threadId);
  }

  /** Records an unarchive request. */
  async unarchiveThread(threadId: string): Promise<void> {
    this.calls.push("rpc:unarchiveThread");
    this.unarchiveThreadIds.push(threadId);
  }

  /** Records a deletion request. */
  async deleteThread(threadId: string): Promise<void> {
    this.calls.push("rpc:deleteThread");
    this.deleteThreadIds.push(threadId);
  }

  /** Records a rename request. */
  async renameThread(threadId: string, name: string): Promise<void> {
    this.calls.push("rpc:renameThread");
    this.renameCalls.push({ threadId, name });
  }
}
