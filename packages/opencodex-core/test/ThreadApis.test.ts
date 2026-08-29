import { describe, expect, it, vi } from "vitest";

import {
  CollaborationApi,
  EventLogApi,
  ThreadsApi,
  type CollaborationHandler,
  type EventLogHandler,
  type ThreadsHandler
} from "../src/backend/runtime/api/ThreadApis";

describe("thread runtime APIs", () => {
  it("exposes the service-oriented thread method names", () => {
    const api = new ThreadsApi(createThreadsHandler());

    for (const methodName of [
      "list",
      "archive",
      "delete",
      "restore",
      "open",
      "readGoal",
      "setGoal",
      "clearGoal",
      "listSubAgents",
      "readReadonly",
      "loadOlderMessages",
      "recover",
      "create",
      "updateComposerSettings",
      "startTurn",
      "steerTurn",
      "editLastTurn",
      "interruptTurn",
      "readRuntimeStatus",
      "startReview",
      "compact",
      "rename"
    ]) {
      expect(api).toHaveProperty(methodName, expect.any(Function));
    }
  });

  it("forwards list, restore, and readonly reads without changing arguments", async () => {
    const handler = createThreadsHandler();
    const api = new ThreadsApi(handler);

    await api.list("currentProject", "/workspace/project", "source-1", "needle", true);
    await api.restore("thread-1");
    await api.readReadonly("thread-1", "source-1");
    await api.readGoal("thread-1", "source-1");
    await api.setGoal("thread-1", "source-1", { objective: "Finish the task" });
    await api.clearGoal("thread-1", "source-1");

    expect(handler.listThreads).toHaveBeenCalledWith(
      "currentProject",
      "/workspace/project",
      "source-1",
      "needle",
      true
    );
    expect(handler.unarchiveThread).toHaveBeenCalledWith("thread-1");
    expect(handler.readThreadReadonly).toHaveBeenCalledWith("thread-1", "source-1");
    expect(handler.readThreadGoal).toHaveBeenCalledWith("thread-1", "source-1");
    expect(handler.setThreadGoal).toHaveBeenCalledWith(
      "thread-1",
      "source-1",
      { objective: "Finish the task" }
    );
    expect(handler.clearThreadGoal).toHaveBeenCalledWith("thread-1", "source-1");
  });

  it("forwards collaboration and event-log reads through their focused APIs", async () => {
    const collaborationHandler: CollaborationHandler = {
      listCollaborationEvents: vi.fn(async () => [])
    };
    const eventLogHandler: EventLogHandler = {
      readThreadEventLog: vi.fn(() => ({ entries: [], truncated: false }))
    };

    await new CollaborationApi(collaborationHandler).list({ sourceId: "source-1" });
    new EventLogApi(eventLogHandler).read("thread-1", "source-1", 25);

    expect(collaborationHandler.listCollaborationEvents).toHaveBeenCalledWith({
      sourceId: "source-1"
    });
    expect(eventLogHandler.readThreadEventLog).toHaveBeenCalledWith("thread-1", "source-1", 25);
  });
});

/** Creates a complete handler double while keeping each operation observable. */
function createThreadsHandler(): ThreadsHandler {
  return {
    listThreads: vi.fn(async () => []),
    archiveThread: vi.fn(async () => ({ ok: true as const })),
    deleteThread: vi.fn(async () => ({ ok: true as const })),
    unarchiveThread: vi.fn(async () => ({ ok: true as const })),
    openThread: vi.fn(async () => ({ thread: {} as never, turns: [] })),
    listSubAgentThreads: vi.fn(async () => []),
    readThreadReadonly: vi.fn(async () => ({ thread: {} as never, turns: [] })),
    readThreadGoal: vi.fn(async () => null),
    setThreadGoal: vi.fn(async () => ({
      threadId: "thread-1",
      objective: "Finish the task",
      status: "active",
      tokenBudget: null,
      tokensUsed: 0,
      timeUsedSeconds: 0,
      createdAt: 0,
      updatedAt: 0
    })),
    clearThreadGoal: vi.fn(async () => ({ cleared: true })),
    loadOlderThreadMessages: vi.fn(async () => ({ turns: [], hasMoreOlderMessages: false })),
    recoverThread: vi.fn(async () => ({ ok: true as const })),
    createThread: vi.fn(async () => ({ thread: {} as never, turns: [] })),
    updateThreadComposerSettings: vi.fn(async () => undefined),
    startTurn: vi.fn(async () => ({ threadId: "thread-1", turnId: "turn-1" })),
    steerTurn: vi.fn(async () => ({ threadId: "thread-1", turnId: "turn-1" })),
    editLastTurn: vi.fn(async () => ({ threadId: "thread-1" })),
    interruptTurn: vi.fn(async () => undefined),
    readThreadRuntimeStatus: vi.fn(async () => ({ status: "idle" } as never)),
    startThreadReview: vi.fn(async () => ({ ok: true as const })),
    compactThread: vi.fn(async () => ({ ok: true as const })),
    renameThread: vi.fn(async () => undefined)
  };
}
