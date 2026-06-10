/**
 * Covers chat-local composer and turn runtime state.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OpenCodexThread, OpenCodexTurn } from "@open-codex-ui/opencodex-protocol";

import { ChatStore } from "../src/stores/ChatStore";
import { hasActiveRunningTurn } from "../src/stores/chatTurnUtils";
import type { ProjectStore } from "../src/stores/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatStore composer model settings", () => {
  it("should initialize model settings from the thread", () => {
    const chatStore = createChatStore({
      model: "gpt-5.5",
      reasoningEffort: "medium"
    });

    expect(chatStore.selectedModel).toBe("gpt-5.5");
    expect(chatStore.reasoningEffort).toBe("medium");
  });

  it("should keep explicit user settings when thread metadata refreshes", () => {
    const chatStore = createChatStore({
      model: "gpt-5.5",
      reasoningEffort: "medium"
    });

    chatStore.setSelectedModel("gpt-5.4-mini");
    chatStore.setReasoningEffort("high");
    chatStore.setThread(createThread({
      model: "gpt-5.5",
      reasoningEffort: "low"
    }));

    expect(chatStore.selectedModel).toBe("gpt-5.4-mini");
    expect(chatStore.reasoningEffort).toBe("high");
  });

  it("should update visible thread metadata when the user changes settings", () => {
    const rootStore = createRootStore();
    const projectStore = createProjectStore();
    const chatStore = new ChatStore(
      createThread({
        model: "gpt-5.5",
        reasoningEffort: "medium"
      }),
      projectStore,
      rootStore
    );

    chatStore.setReasoningEffort("high");

    expect(chatStore.thread.reasoningEffort).toBe("high");
    expect(projectStore.upsertThread).toHaveBeenCalledWith(expect.objectContaining({
      id: "thread-1",
      reasoningEffort: "high"
    }));
    expect(rootStore.request).toHaveBeenCalledWith({
      type: "threads.updateComposerSettings",
      threadId: "thread-1",
      model: "gpt-5.5",
      reasoningEffort: "high"
    });
  });

  it("should apply metadata refreshes before the user changes settings", () => {
    const chatStore = createChatStore({
      model: "gpt-5.5",
      reasoningEffort: "medium"
    });

    chatStore.setThread(createThread({
      model: "gpt-5.4-mini",
      reasoningEffort: "xhigh"
    }));

    expect(chatStore.selectedModel).toBe("gpt-5.4-mini");
    expect(chatStore.reasoningEffort).toBe("xhigh");
  });

  it("should use the first listed model when the thread has no model", () => {
    const chatStore = createChatStore({
      model: null,
      reasoningEffort: null
    });

    expect(chatStore.selectedModel).toBe("gpt-5.5");
    expect(chatStore.reasoningEffort).toBe("medium");
  });

  it("should repair a thread source from the project source", () => {
    const chatStore = createChatStore({
      sourceId: null
    });

    expect(chatStore.thread.sourceId).toBe("source-1");
    expect(chatStore.sourceId).toBe("source-1");
  });

  it("should start turns with the resolved chat source", async () => {
    const rootStore = createRootStore();
    const projectStore = createProjectStore();
    const chatStore = new ChatStore(
      createThread({
        sourceId: null
      }),
      projectStore,
      rootStore
    );

    const wasAccepted = await chatStore.sendMessage("hello");

    expect(wasAccepted).toBe(true);
    expect(rootStore.request).toHaveBeenCalledWith(expect.objectContaining({
      type: "turn.start",
      threadId: "thread-1",
      sourceId: "source-1",
      text: "hello"
    }));
  });
});

describe("ChatStore active turn state", () => {
  it("should keep the active turn running when a stale completed event arrives", () => {
    const chatStore = createChatStore({});
    const oldTurn = createTurn("turn-old", "completed");
    const activeTurn = createTurn("turn-active", "running");

    chatStore.setTurns([oldTurn, activeTurn]);
    chatStore.isWorking = true;
    chatStore.activeTurnId = "turn-active";

    chatStore.applyTurnCompleted("turn-old", 1234);

    expect(chatStore.isWorking).toBe(true);
    expect(chatStore.activeTurnId).toBe("turn-active");
    expect(chatStore.pendingTurnId).toBeNull();
    expect(chatStore.turns.find((turn) => turn.id === "turn-old")?.durationMs).toBe(1234);
  });

  it("should clear the active turn when its completed event arrives", () => {
    const chatStore = createChatStore({});
    const activeTurn = createTurn("turn-active", "running");

    chatStore.setTurns([activeTurn]);
    chatStore.isWorking = true;
    chatStore.activeTurnId = "turn-active";

    chatStore.applyTurnCompleted("turn-active", 1234);

    expect(chatStore.isWorking).toBe(false);
    expect(chatStore.activeTurnId).toBeNull();
    expect(chatStore.turns.find((turn) => turn.id === "turn-active")?.durationMs).toBe(1234);
  });

  it("should keep a running turn active even when a final answer item exists", () => {
    const turn = createTurn("turn-active", "running");

    turn.items.push({
      id: "final-answer",
      role: "assistant",
      phase: "final_answer",
      content: "partial final answer",
      status: "streaming",
      createdAt: null
    });

    expect(hasActiveRunningTurn([turn], "turn-active")).toBe(true);
  });

  it("should keep the last user message non editable while the last turn is running", () => {
    const chatStore = createChatStore({});
    const runningTurn = createTurn("turn-active", "running");

    runningTurn.items.push({
      id: "user-message",
      role: "user",
      content: "hello",
      status: "completed",
      createdAt: null,
      attachments: []
    });
    chatStore.setTurns([runningTurn]);

    expect(chatStore.editableLastUserItem).toBeNull();
  });

  it("should stop working and resync when runtime polling reports an idle thread", async () => {
    vi.useFakeTimers();
    const rootStore = createRootStore();
    const projectStore = createProjectStore();
    const chatStore = new ChatStore(createThread({}), projectStore, rootStore);

    vi.mocked(rootStore.request).mockResolvedValue({
      threadId: "thread-1",
      status: "idle",
      isActive: false,
      activeFlags: []
    });

    chatStore.applyTurnStarted("turn-active");
    await vi.advanceTimersByTimeAsync(30_000);

    expect(rootStore.request).toHaveBeenCalledWith({
      type: "threads.runtimeStatus.read",
      threadId: "thread-1"
    });
    expect(chatStore.isWorking).toBe(false);
    expect(chatStore.activeTurnId).toBeNull();
    expect(projectStore.openThread).toHaveBeenCalledWith("thread-1");
  });
});

function createChatStore(threadPatch: Partial<OpenCodexThread>): ChatStore {
  return new ChatStore(
    createThread(threadPatch),
    createProjectStore(),
    createRootStore()
  );
}

function createThread(patch: Partial<OpenCodexThread>): OpenCodexThread {
  return {
    id: "thread-1",
    codexTitle: "Thread",
    customTitle: null,
    title: "Thread",
    preview: "Preview",
    model: null,
    reasoningEffort: null,
    projectName: "project",
    projectPath: "/tmp/project",
    sourceId: "source-1",
    branchName: "main",
    updatedAt: null,
    ...patch
  };
}

function createTurn(id: string, status: OpenCodexTurn["status"]): OpenCodexTurn {
  return {
    id,
    threadId: "thread-1",
    status,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    items: []
  };
}

function createProjectStore(): ProjectStore {
  return {
    project: {
      id: "project-1",
      sourceId: "source-1"
    },
    projectPath: "/tmp/project",
    isOrphan: false,
    resolveThreadSourceId: vi.fn((thread: OpenCodexThread) => (
      thread.sourceId ?? "source-1"
    )),
    ensureThreadSource: vi.fn((thread: OpenCodexThread) => {
      const sourceId = thread.sourceId ?? "source-1";

      if (sourceId === thread.sourceId) {
        return thread;
      }

      return {
        ...thread,
        sourceId
      };
    }),
    upsertThread: vi.fn((thread: OpenCodexThread) => thread),
    openThread: vi.fn()
  } as ProjectStore;
}

function createRootStore(): RootStore {
  return {
    appStore: {
      models: [
        {
          id: "gpt-5.5",
          model: "gpt-5.5",
          displayName: "GPT-5.5",
          serviceTiers: []
        },
        {
          id: "gpt-5.4-mini",
          model: "gpt-5.4-mini",
          displayName: "GPT-5.4 Mini",
          serviceTiers: []
        }
      ],
      selectedModel: "gpt-5.4",
      settings: {
        defaultModel: null,
        defaultReasoningEffort: "medium"
      }
    },
    navigationStore: {
      activeProjectStore: null
    },
    request: vi.fn(() => Promise.resolve({ ok: true }))
  } as RootStore;
}
