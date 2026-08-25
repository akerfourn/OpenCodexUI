/** Covers direct routing contracts for live project thread events. */
import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexActivity,
  OpenCodexMessage,
  OpenCodexThreadTokenUsage
} from "@open-codex-ui/opencodex-protocol";

import { ProjectThreadEventsStore } from "../src/stores/project/threads/ProjectThreadEventsStore";
import type { ProjectsStore } from "../src/stores/project/ProjectsStore";
import type { RootStore } from "../src/stores/RootStore";

describe("ProjectThreadEventsStore", () => {
  it("should route a live delta only to the chat owned by its source", () => {
    const fixture = createFixture();

    fixture.addChat("source-a", "shared-thread");
    const secondChat = fixture.addChat("source-b", "shared-thread");

    fixture.router.handleEvent({
      type: "message.delta",
      sourceId: "source-b",
      threadId: "shared-thread",
      turnId: "turn-b",
      messageId: "message-b",
      delta: "Only source B",
      phase: "commentary"
    });

    expect(secondChat.timeline.appendAssistantDelta).toHaveBeenCalledWith(
      "turn-b",
      "message-b",
      "Only source B",
      "commentary"
    );
    expect(fixture.chat("source-a", "shared-thread").timeline.appendAssistantDelta)
      .not.toHaveBeenCalled();
  });

  it("should route token usage only to the chat owned by its source", () => {
    const fixture = createFixture();

    const firstChat = fixture.addChat("source-a", "shared-thread");
    const secondChat = fixture.addChat("source-b", "shared-thread");
    const usage = createTokenUsage("shared-thread", "turn-b");

    fixture.router.handleEvent({
      type: "thread.tokenUsage.updated",
      sourceId: "source-b",
      usage
    });

    expect(secondChat.timeline.applyTokenUsage).toHaveBeenCalledWith(usage);
    expect(firstChat.timeline.applyTokenUsage).not.toHaveBeenCalled();
  });

  it("should clear recovery loading only for the matching source project", () => {
    const fixture = createFixture();
    const firstChat = fixture.addChat("source-a", "shared-thread");
    const secondChat = fixture.addChat("source-b", "shared-thread");
    const firstProject = fixture.project("source-a", "shared-thread");
    const secondProject = fixture.project("source-b", "shared-thread");

    fixture.router.handleEvent({
      type: "thread.recovery.started",
      sourceId: "source-b",
      threadId: "shared-thread"
    });

    expect(secondChat.runtime.setRecovering).toHaveBeenCalledWith(true);
    expect(firstChat.runtime.setRecovering).not.toHaveBeenCalled();
    expect(secondProject.threadListStore.loadingThreadId).toBeNull();
    expect(firstProject.threadListStore.loadingThreadId).toBe("shared-thread");
  });

  it("should apply a representative live event sequence in protocol order", () => {
    const callOrder: string[] = [];
    const fixture = createFixture(callOrder);
    const chat = fixture.addChat("source-a", "thread-a", "turn-a");

    fixture.router.handleEvent({
      type: "message.started",
      sourceId: "source-a",
      threadId: "thread-a",
      message: createMessage("thread-a", "user-message", "turn-a")
    });
    fixture.router.handleEvent({
      type: "turn.started",
      sourceId: "source-a",
      threadId: "thread-a",
      turnId: "turn-a"
    });
    fixture.router.handleEvent({
      type: "message.delta",
      sourceId: "source-a",
      threadId: "thread-a",
      turnId: "turn-a",
      messageId: "assistant-message",
      delta: "Hello",
      phase: "final_answer"
    });
    fixture.router.handleEvent({
      type: "activity.updated",
      sourceId: "source-a",
      threadId: "thread-a",
      activity: createActivity("thread-a", "activity-a")
    });
    fixture.router.handleEvent({
      type: "turn.completed",
      sourceId: "source-a",
      threadId: "thread-a",
      turnId: "turn-a",
      durationMs: 1200,
      turnStatus: "completed"
    });

    expect(callOrder).toEqual([
      "message.started",
      "turn.started",
      "message.delta",
      "activity.updated",
      "turn.completed",
      "git.refresh"
    ]);
    expect(chat.applyMessageStarted).toHaveBeenCalledWith(
      createMessage("thread-a", "user-message", "turn-a")
    );
    expect(chat.timeline.appendAssistantDelta).toHaveBeenCalledWith(
      "turn-a",
      "assistant-message",
      "Hello",
      "final_answer"
    );
    expect(chat.timeline.applyActivityUpdated).toHaveBeenCalledWith(
      createActivity("thread-a", "activity-a"),
      "turn-a",
      null
    );
    expect(chat.applyTurnCompleted).toHaveBeenCalledWith(
      "turn-a",
      1200,
      "completed",
      undefined
    );
  });

  it("should not refresh Git for an obsolete completed turn", () => {
    const fixture = createFixture();
    const chat = fixture.addChat("source-a", "thread-a", "turn-active");
    const project = fixture.project("source-a", "thread-a");

    fixture.router.handleEvent({
      type: "turn.completed",
      sourceId: "source-a",
      threadId: "thread-a",
      turnId: "turn-obsolete",
      durationMs: 500,
      turnStatus: "completed"
    });

    expect(chat.applyTurnCompleted).toHaveBeenCalledWith(
      "turn-obsolete",
      500,
      "completed",
      undefined
    );
    expect(project.gitStore.statusStore.refresh).not.toHaveBeenCalled();
  });

  it("should refresh only the active turn's source project Git store", () => {
    const callOrder: string[] = [];
    const fixture = createFixture(callOrder);
    fixture.addChat("source-a", "shared-thread", "turn-a");
    const secondChat = fixture.addChat("source-b", "shared-thread", "turn-b");
    const firstProject = fixture.project("source-a", "shared-thread");
    const secondProject = fixture.project("source-b", "shared-thread");

    fixture.router.handleEvent({
      type: "turn.completed",
      sourceId: "source-b",
      threadId: "shared-thread",
      turnId: "turn-b",
      durationMs: 800,
      turnStatus: "completed"
    });

    expect(secondChat.applyTurnCompleted).toHaveBeenCalledWith(
      "turn-b",
      800,
      "completed",
      undefined
    );
    expect(secondChat.runtime.activeTurnId).toBeNull();
    expect(callOrder).toEqual(["turn.completed", "git.refresh"]);
    expect(secondProject.gitStore.statusStore.refresh).toHaveBeenCalledTimes(1);
    expect(firstProject.gitStore.statusStore.refresh).not.toHaveBeenCalled();
  });
});

type FakeChat = {
  runtime: {
    activeTurnId: string | null;
    pendingTurnId: string | null;
    setRecovering: ReturnType<typeof vi.fn>;
  };
  timeline: {
    isLoadingOlderMessages: boolean;
    applyTokenUsage: ReturnType<typeof vi.fn>;
    appendAssistantDelta: ReturnType<typeof vi.fn>;
    applyActivityUpdated: ReturnType<typeof vi.fn>;
  };
  applyMessageStarted: ReturnType<typeof vi.fn>;
  applyTurnStarted: ReturnType<typeof vi.fn>;
  applyTurnCompleted: ReturnType<typeof vi.fn>;
};

type FakeProject = {
  threadListStore: {
    loadingThreadId: string | null;
  };
  gitStore: {
    statusStore: {
      refresh: ReturnType<typeof vi.fn>;
    };
  };
};

type Fixture = {
  router: ProjectThreadEventsStore;
  addChat: (sourceId: string, threadId: string, activeTurnId?: string) => FakeChat;
  chat: (sourceId: string, threadId: string) => FakeChat;
  project: (sourceId: string, threadId: string) => FakeProject;
};

/** Creates a source-aware direct router fixture without constructing app stores. */
function createFixture(callOrder: string[] = []): Fixture {
  const chatsByRoute = new Map<string, FakeChat>();
  const projectsByRoute = new Map<string, FakeProject>();
  const projectsStore = {
    findChatStoreByThreadId: vi.fn((threadId: string, sourceId?: string | null) => (
      chatsByRoute.get(routeKey(sourceId, threadId)) ?? null
    )),
    findProjectStoreForThread: vi.fn((threadId: string, sourceId?: string | null) => (
      projectsByRoute.get(routeKey(sourceId, threadId)) ?? null
    ))
  } as unknown as ProjectsStore;
  const router = new ProjectThreadEventsStore(
    projectsStore,
    {} as RootStore
  );

  function addChat(sourceId: string, threadId: string, activeTurnId: string | null = null): FakeChat {
    const chat: FakeChat = {
      runtime: {
        activeTurnId,
        pendingTurnId: null,
        setRecovering: vi.fn()
      },
      timeline: {
        isLoadingOlderMessages: false,
        applyTokenUsage: vi.fn(() => callOrder.push("thread.tokenUsage.updated")),
        appendAssistantDelta: vi.fn(() => callOrder.push("message.delta")),
        applyActivityUpdated: vi.fn(() => callOrder.push("activity.updated"))
      },
      applyMessageStarted: vi.fn(() => callOrder.push("message.started")),
      applyTurnStarted: vi.fn(() => callOrder.push("turn.started")),
      applyTurnCompleted: vi.fn(() => {
        callOrder.push("turn.completed");
        chat.runtime.activeTurnId = null;
      })
    };
    chatsByRoute.set(routeKey(sourceId, threadId), chat);
    projectsByRoute.set(routeKey(sourceId, threadId), {
      threadListStore: {
        loadingThreadId: threadId
      },
      gitStore: {
        statusStore: {
          refresh: vi.fn(() => callOrder.push("git.refresh"))
        }
      }
    });
    return chat;
  }

  function chat(sourceId: string, threadId: string): FakeChat {
    const value = chatsByRoute.get(routeKey(sourceId, threadId));

    if (value === undefined) {
      throw new Error(`Missing chat fixture for ${sourceId}:${threadId}`);
    }

    return value;
  }

  function project(sourceId: string, threadId: string): FakeProject {
    const value = projectsByRoute.get(routeKey(sourceId, threadId));

    if (value === undefined) {
      throw new Error(`Missing project fixture for ${sourceId}:${threadId}`);
    }

    return value;
  }

  return { router, addChat, chat, project };
}

/** Builds a stable route key for the source-aware fake stores. */
function routeKey(sourceId: string | null | undefined, threadId: string): string {
  return `${sourceId ?? "<none>"}:${threadId}`;
}

/** Creates the minimal valid message DTO used by a message.started event. */
function createMessage(threadId: string, id: string, turnId: string): OpenCodexMessage {
  return {
    id,
    threadId,
    turnId,
    role: "user",
    content: "Hello",
    status: "completed",
    createdAt: "2026-08-17T00:00:00.000Z"
  };
}

/** Creates the minimal token-usage DTO used by a thread.tokenUsage.updated event. */
function createTokenUsage(threadId: string, turnId: string): OpenCodexThreadTokenUsage {
  return {
    threadId,
    turnId,
    total: {
      totalTokens: 120,
      inputTokens: 80,
      cachedInputTokens: 20,
      outputTokens: 30,
      reasoningOutputTokens: 10
    },
    last: {
      totalTokens: 120,
      inputTokens: 80,
      cachedInputTokens: 20,
      outputTokens: 30,
      reasoningOutputTokens: 10
    },
    contextWindowTokens: 120,
    modelContextWindow: 1_000,
    usedPercent: 12
  };
}

/** Creates the minimal valid activity DTO used by an activity.updated event. */
function createActivity(threadId: string, id: string): OpenCodexActivity {
  return {
    id,
    threadId,
    kind: "plan",
    title: "Plan",
    content: "Working",
    summary: null,
    details: null,
    plan: null,
    status: "running"
  };
}
