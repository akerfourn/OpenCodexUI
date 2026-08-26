/** Characterizes the Codex-facing turn action boundary. */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexThread,
  OpenCodexThreadEventLogRequestType,
  OpenCodexThreadEventLogValue,
  OpenCodexTurnExecutionMetadata
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it } from "vitest";

import { ThreadTurnCache } from "../src/ThreadTurnCache";
import type { CollaborationService } from "../src/backend/collaboration/CollaborationService";
import { ThreadConversationService } from "../src/backend/threads/ThreadConversationService";
import type { ThreadCacheService } from "../src/backend/threads/ThreadCacheService";

describe("ThreadConversationService turn actions", () => {
  it("starts a new thread with the stable cache and event order", async () => {
    const client = new StrictTurnActionsCodexClient();
    const fixture = createFixture(client);

    const result = await fixture.service.startTurn(
      null,
      "/workspace/project",
      "source-1",
      " hello ",
      [],
      [],
      "gpt-requested",
      "high",
      "priority"
    );

    expect(result).toEqual({ threadId: "thread-new", turnId: "turn-new" });
    expect(fixture.ensureSourceIds).toEqual(["source-1"]);
    expect(client.startThreadParams).toEqual({
      cwd: "/workspace/project",
      model: "gpt-default"
    });
    expect(client.startTurnParams).toEqual({
      threadId: "thread-new",
      input: [{ type: "text", text: "hello", text_elements: [] }],
      model: "gpt-requested",
      serviceTier: "priority",
      effort: "high"
    });
    expect(fixture.indexedThreads).toEqual([
      expect.objectContaining({ id: "thread-new", sourceId: "source-1" })
    ]);
    expect(fixture.events).toContainEqual(expect.objectContaining({
      type: "thread.created",
      thread: expect.objectContaining({ id: "thread-new", sourceId: "source-1" }),
      turns: []
    }));
    expect(fixture.events).toContainEqual(expect.objectContaining({
      type: "message.started",
      sourceId: "source-1",
      threadId: "thread-new",
      message: expect.objectContaining({ role: "user", content: "hello" })
    }));
    expect(fixture.calls).toEqual([
      "resolveSource",
      "ensureClient",
      "cacheProject",
      "startThread",
      "writeIndex",
      "thread.created",
      "message.started",
      "startTurn",
      "writeMetadata",
      "turn.started"
    ]);
    expect(fixture.executionMetadata).toEqual([{
      requestedModel: "gpt-requested",
      effectiveModel: "gpt-requested",
      requestedReasoningEffort: "high",
      effectiveReasoningEffort: "high",
      serviceTier: "priority"
    }]);
    expect(fixture.clientRequests).toEqual([{
      sourceId: "source-1",
      threadId: "thread-new",
      requestType: "turn.start",
      turnId: null,
      details: {
        inputTextLength: 5,
        attachmentCount: 0,
        referenceCount: 0,
        model: "gpt-requested",
        reasoningEffort: "high",
        serviceTier: "priority"
      }
    }]);
  });

  it("resumes an existing thread before starting its next turn", async () => {
    const client = new StrictTurnActionsCodexClient();
    const fixture = createFixture(client, { thread: createThread() });
    fixture.threadTurnCache.replaceThreadTurns(fixture.thread, [{ id: "turn-old", items: [] }]);

    await fixture.service.startTurn(
      "thread-1",
      null,
      null,
      "continue",
      [],
      [],
      "gpt-requested",
      "medium",
      null
    );

    expect(client.resumeThreadParams).toEqual({
      threadId: "thread-1",
      params: {
        cwd: "/workspace/backend",
        excludeTurns: true,
        model: "gpt-requested"
      }
    });
    expect(fixture.ensureSourceIds).toEqual(["source-1"]);
    expect(fixture.calls).toEqual([
      "resolveSource",
      "ensureClient",
      "resumeThread",
      "message.started",
      "startTurn",
      "writeMetadata",
      "turn.started"
    ]);
  });

  it("steers with the expected turn and falls back when Codex returns no id", async () => {
    const client = new StrictTurnActionsCodexClient();
    client.steerTurnResponse = { turnId: "" };
    const fixture = createFixture(client, { thread: createThread() });
    fixture.threadTurnCache.replaceThreadTurns(
      fixture.thread,
      [{ id: "turn-active", items: [], status: "running" }]
    );

    const result = await fixture.service.steerTurn(
      "thread-1",
      "turn-active",
      " steer ",
      [],
      []
    );

    expect(result).toEqual({ threadId: "thread-1", turnId: "turn-active" });
    expect(fixture.ensureSourceIds).toEqual(["source-1"]);
    expect(client.steerTurnParams).toEqual({
      threadId: "thread-1",
      input: [{ type: "text", text: "steer", text_elements: [] }],
      expectedTurnId: "turn-active"
    });
    expect(fixture.calls).toEqual(["ensureClient", "steerTurn", "writeDelta"]);
    expect(fixture.clientRequests).toEqual([{
      sourceId: "source-1",
      threadId: "thread-1",
      requestType: "turn.steer",
      turnId: "turn-active",
      details: {
        inputTextLength: 5,
        attachmentCount: 0,
        referenceCount: 0
      }
    }]);
    expect(fixture.deltaTurns).toEqual([expect.objectContaining({
      id: "turn-active",
      items: [expect.objectContaining({
        type: "userMessage",
        kind: "steer",
        content: [{ type: "text", text: "steer", text_elements: [] }]
      })]
    })]);
  });

  it("rolls back an edit using the historical source fallback before snapshot write", async () => {
    const client = new StrictTurnActionsCodexClient();
    const thread = createThread({ sourceId: null });
    const fixture = createFixture(client, { thread });
    fixture.threadTurnCache.replaceThreadTurns(thread, [{ id: "turn-old", items: [] }]);

    const result = await fixture.service.editLastTurn(
      "thread-1",
      "/workspace/project",
      "source-history",
      "replacement",
      [],
      [],
      "gpt-edit",
      "high",
      "priority"
    );

    expect(result).toEqual({ threadId: "thread-1" });
    expect(fixture.ensureSourceIds).toEqual(["source-history"]);
    expect(client.resumeThreadParams).toEqual({
      threadId: "thread-1",
      params: {
        cwd: "/workspace/project",
        excludeTurns: true,
        model: "gpt-edit"
      }
    });
    expect(client.rollbackThreadParams).toEqual({
      threadId: "thread-1",
      numTurns: 1
    });
    expect(fixture.reconciledTurns).toEqual([[{ id: "turn-remaining", items: [] }]]);
    expect(fixture.openedThreads).toHaveLength(1);
    expect(fixture.snapshotEntries[0]?.thread.sourceId).toBe("source-history");
    expect(fixture.calls).toEqual([
      "readSnapshot",
      "ensureClient",
      "resumeThread",
      "rollbackThread",
      "reconcile",
      "thread.opened",
      "writeSnapshot"
    ]);
  });

  it("interrupts, reviews, and compacts with source-aware Codex payloads", async () => {
    const client = new StrictTurnActionsCodexClient();
    const fixture = createFixture(client, { thread: createThread() });

    await fixture.service.interruptTurn("thread-1", "turn-active");
    await fixture.service.startReview("thread-1", null);
    await fixture.service.compactThread("thread-1", null);

    expect(client.interruptParams).toEqual({ threadId: "thread-1", turnId: "turn-active" });
    expect(client.startReviewThreadId).toBe("thread-1");
    expect(client.compactThreadId).toBe("thread-1");
    expect(fixture.ensureSourceIds).toEqual(["source-1", "source-1", "source-1"]);
    expect(client.resumeThreadParamsList).toEqual([
      {
        threadId: "thread-1",
        params: { cwd: "/workspace/backend", excludeTurns: true, model: null }
      },
      {
        threadId: "thread-1",
        params: { cwd: "/workspace/backend", excludeTurns: true, model: null }
      }
    ]);
    expect(fixture.calls).toEqual([
      "ensureClient",
      "interruptTurn",
      "ensureClient",
      "resumeThread",
      "startReview",
      "turn.started",
      "ensureClient",
      "resumeThread",
      "compactThread"
    ]);
    expect(fixture.events).toContainEqual({
      type: "turn.started",
      sourceId: "source-1",
      threadId: "thread-1",
      turnId: "turn-review"
    });
  });
});
type Fixture = {
  service: ThreadConversationService;
  threadTurnCache: ThreadTurnCache;
  thread: OpenCodexThread;
  calls: string[];
  events: OpenCodexEvent[];
  clientRequests: Array<{
    sourceId: string;
    threadId: string;
    requestType: OpenCodexThreadEventLogRequestType;
    turnId: string | null;
    details: Record<string, OpenCodexThreadEventLogValue>;
  }>;
  openedThreads: OpenCodexEvent[];
  indexedThreads: OpenCodexThread[];
  ensureSourceIds: Array<string | null>;
  executionMetadata: OpenCodexTurnExecutionMetadata[];
  deltaTurns: unknown[];
  reconciledTurns: unknown[][];
  snapshotEntries: Array<{ thread: OpenCodexThread }>;
};
type FixtureOptions = {
  thread?: OpenCodexThread;
};
/** Creates a service fixture with strict, observable action boundaries. */
function createFixture(
  client: StrictTurnActionsCodexClient,
  options: FixtureOptions = {}
): Fixture {
  const threadTurnCache = new ThreadTurnCache();
  const thread = options.thread ?? createThread();
  const calls: string[] = [];
  const events: OpenCodexEvent[] = [];
  const clientRequests: Fixture["clientRequests"] = [];
  const openedThreads: OpenCodexEvent[] = [];
  const indexedThreads: OpenCodexThread[] = [];
  const ensureSourceIds: Array<string | null> = [];
  const deltaTurns: unknown[] = [];
  const reconciledTurns: unknown[][] = [];
  const snapshotEntries: Array<{ thread: OpenCodexThread }> = [];
  const executionMetadata: OpenCodexTurnExecutionMetadata[] = [];
  client.calls = calls;

  if (options.thread !== undefined) {
    threadTurnCache.getOrCreate(thread);
  }
  const service = new ThreadConversationService({
    backendOptions: { projectPath: "/workspace/backend" },
    threadTurnCache,
    threadCacheService: {
      readSnapshot: async () => {
        calls.push("readSnapshot");
        return null;
      },
      readTurns: () => [],
      writeIndex: async (threads: OpenCodexThread[]) => {
        calls.push("writeIndex");
        indexedThreads.push(...threads);
      },
      writeDelta: async (_entry: unknown, turns: unknown[]) => {
        calls.push("writeDelta");
        deltaTurns.push(...turns);
      },
      writeSnapshot: async (entry: { thread: OpenCodexThread }) => {
        calls.push("writeSnapshot");
        snapshotEntries.push(entry);
      },
      writeTurnExecutionMetadata: async (
        _sourceId: string,
        _threadId: string,
        _turnId: string,
        metadata: OpenCodexTurnExecutionMetadata
      ) => {
        calls.push("writeMetadata");
        executionMetadata.push(metadata);
      }
    } as unknown as ThreadCacheService,
    settings: {
      getSettings: () => createSettings()
    },
    events: {
      emit: (event: OpenCodexEvent) => {
        calls.push(event.type);
        events.push(event);
        if (event.type === "thread.opened") {
          openedThreads.push(event);
        }
      },
      recordClientRequest: (
        sourceId: string,
        threadId: string,
        requestType: OpenCodexThreadEventLogRequestType,
        turnId: string | null,
        details: Record<string, OpenCodexThreadEventLogValue> = {}
      ) => {
        clientRequests.push({ sourceId, threadId, requestType, turnId, details });
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
      resolveSource: async (sourceId: string | null) => {
        calls.push("resolveSource");
        return { id: sourceId ?? "source-1" } as never;
      },
      cacheProject: async () => {
        calls.push("cacheProject");
        return null;
      },
      readCachedProjects: async () => []
    },
    collaborationService: {
      reconcileTurns: async (_sourceId: string, _threadId: string, turns: readonly unknown[]) => {
        calls.push("reconcile");
        reconciledTurns.push([...turns]);
      },
      reconcileDescendantThreads: async () => undefined
    } as Pick<CollaborationService, "reconcileTurns" | "reconcileDescendantThreads">,
    handleClientError: () => undefined
  });

  return {
    service,
    threadTurnCache,
    thread,
    calls,
    events,
    clientRequests,
    openedThreads,
    indexedThreads,
    ensureSourceIds,
    executionMetadata,
    deltaTurns,
    reconciledTurns,
    snapshotEntries
  };
}

/** Creates the minimum settings snapshot consumed by turn actions. */
function createSettings(): OpenCodexSettings {
  return {
    defaultModel: "gpt-default",
    defaultReasoningEffort: "medium",
    language: "en"
  } as OpenCodexSettings;
}

/** Creates a thread fixture with an explicit source association. */
function createThread(patch: Partial<OpenCodexThread> = {}): OpenCodexThread {
  return {
    id: "thread-1",
    codexTitle: "Thread",
    customTitle: null,
    title: "Thread",
    preview: "",
    model: "gpt-thread",
    reasoningEffort: "medium",
    projectName: "project",
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
    canAcceptDirectInput: true,
    ...patch
  };
}

/** Provides a deterministic fake client that records characterized calls. */
class StrictTurnActionsCodexClient {
  /** Ordered calls observed by the fixture. */
  calls: string[] = [];
  /** Payload sent to `thread/start`. */
  startThreadParams: unknown = null;
  /** Payload sent to `turn/start`. */
  startTurnParams: unknown = null;
  /** Most recent payload sent to `thread/resume`. */
  resumeThreadParams: unknown = null;
  /** All payloads sent to `thread/resume`. */
  resumeThreadParamsList: unknown[] = [];
  /** Payload sent to `turn/steer`. */
  steerTurnParams: unknown = null;
  /** Payload sent to `thread/rollback`. */
  rollbackThreadParams: unknown = null;
  /** Payload sent to `turn/interrupt`. */
  interruptParams: unknown = null;
  /** Thread identifier sent to `review/start`. */
  startReviewThreadId: string | null = null;
  /** Thread identifier sent to `thread/compact/start`. */
  compactThreadId: string | null = null;
  /** Configurable response returned by `turn/steer`. */
  steerTurnResponse: unknown = { turnId: "turn-steered" };

  /** Returns this strict fake through the production client boundary. */
  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  /** Records a new-thread request and returns a stable thread payload. */
  async startThread(params: unknown): Promise<unknown> {
    this.calls.push("startThread");
    this.startThreadParams = params;
    return {
      thread: { id: "thread-new", cwd: "/workspace/project", name: "New thread", preview: "" },
      model: "gpt-default",
      reasoningEffort: "medium"
    };
  }

  /** Records a conditional resume request. */
  async resumeThread(threadId: string, params: unknown): Promise<unknown> {
    this.calls.push("resumeThread");
    this.resumeThreadParams = { threadId, params };
    this.resumeThreadParamsList.push({ threadId, params });
    return {};
  }

  /** Records a turn-start request and returns a stable turn identifier. */
  async startTurn(params: unknown): Promise<unknown> {
    this.calls.push("startTurn");
    this.startTurnParams = params;
    return { turn: { id: "turn-new" } };
  }

  /** Records a steering request and returns its configured response. */
  async steerTurn(params: unknown): Promise<unknown> {
    this.calls.push("steerTurn");
    this.steerTurnParams = params;
    return this.steerTurnResponse;
  }

  /** Records the rollback request and returns one remaining turn. */
  async rollbackThread(params: unknown): Promise<unknown> {
    this.calls.push("rollbackThread");
    this.rollbackThreadParams = params;
    return {
      thread: {
        id: "thread-1",
        cwd: "/workspace/project",
        name: "Edited thread",
        preview: "",
        turns: [{ id: "turn-remaining", items: [] }]
      }
    };
  }

  /** Records an interrupt request. */
  async interruptTurn(threadId: string, turnId: string): Promise<unknown> {
    this.calls.push("interruptTurn");
    this.interruptParams = { threadId, turnId };
    return {};
  }

  /** Records an inline review request and returns its turn identifier. */
  async startReview(threadId: string): Promise<unknown> {
    this.calls.push("startReview");
    this.startReviewThreadId = threadId;
    return { turn: { id: "turn-review" } };
  }

  /** Records a compaction request. */
  async compactThread(threadId: string): Promise<unknown> {
    this.calls.push("compactThread");
    this.compactThreadId = threadId;
    return {};
  }
}
