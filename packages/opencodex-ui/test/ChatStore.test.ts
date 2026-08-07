/**
 * Covers chat-local composer and turn runtime state.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  OpenCodexActivity,
  OpenCodexThread,
  OpenCodexThreadTokenUsage,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import { ChatStore } from "../src/stores/ChatStore";
import { ProjectThreadEventsStore } from "../src/stores/ProjectThreadEventsStore";
import { hasActiveRunningTurn } from "../src/stores/chatTurnUtils";
import type { ProjectStore } from "../src/stores/ProjectStore";
import type { ProjectsStore } from "../src/stores/ProjectsStore";
import type { RootStore } from "../src/stores/RootStore";

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatStore composer model settings", () => {
  it("should preserve draft and attachments in the chat store", () => {
    const chatStore = createChatStore({});

    chatStore.setComposerDraft("draft", "**draft**", []);
    chatStore.addComposerAttachments([{
      id: "image-1",
      kind: "image",
      source: "localPath",
      value: "/tmp/image.png",
      name: "image.png"
    }]);

    expect(chatStore.composerDraft).toBe("draft");
    expect(chatStore.composerDraftMarkdown).toBe("**draft**");
    expect(chatStore.composerAttachments).toEqual([expect.objectContaining({
      id: "image-1",
      value: "/tmp/image.png"
    })]);
  });

  it("should preserve an isolated timeline reading state", () => {
    const chatStore = createChatStore({});
    const state = {
      visibleTurnCount: 20,
      turnCount: 25,
      scrollTop: 480,
      isPinnedToBottom: false
    };

    chatStore.setTimelineViewState(state);
    state.scrollTop = 0;

    expect(chatStore.timelineViewState).toEqual({
      visibleTurnCount: 20,
      turnCount: 25,
      scrollTop: 480,
      isPinnedToBottom: false
    });
  });

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
  it("should preserve an active turn when a rename succeeds", async () => {
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    chatStore.isWorking = true;
    chatStore.activeTurnId = "turn-active";
    chatStore.rename("Renamed thread");
    await flushPromises();

    expect(chatStore.thread.title).toBe("Renamed thread");
    expect(chatStore.isWorking).toBe(true);
    expect(chatStore.activeTurnId).toBe("turn-active");
    expect(chatStore.isRenaming).toBe(false);
  });

  it("should preserve an active turn when the backend confirms a rename", () => {
    const chatStore = createChatStore({});

    chatStore.isWorking = true;
    chatStore.activeTurnId = "turn-active";
    chatStore.applyRename("Renamed thread");

    expect(chatStore.thread.title).toBe("Renamed thread");
    expect(chatStore.isWorking).toBe(true);
    expect(chatStore.activeTurnId).toBe("turn-active");
  });

  it("should roll back a failed rename without stopping the active turn", async () => {
    const rootStore = createRootStore();
    const projectStore = createProjectStore();
    vi.mocked(rootStore.request).mockRejectedValueOnce(new Error("Rename failed"));
    const chatStore = new ChatStore(createThread({}), projectStore, rootStore);

    chatStore.isWorking = true;
    chatStore.activeTurnId = "turn-active";
    chatStore.rename("Renamed thread");
    await flushPromises();

    expect(chatStore.thread.title).toBe("Thread");
    expect(projectStore.threadListStore.threads[0]).toMatchObject({
      id: "thread-1",
      title: "Thread",
      customTitle: "Thread"
    });
    expect(chatStore.isWorking).toBe(true);
    expect(chatStore.activeTurnId).toBe("turn-active");
    expect(chatStore.isRenaming).toBe(false);
    expect(rootStore.appStore.errorMessage).toBe("Rename failed");
  });

  it("should serialize concurrent renames and release the state after success", async () => {
    const rootStore = createRootStore();
    let resolveFirstRequest: (() => void) | null = null;
    const firstRequest = new Promise<unknown>((resolve) => {
      resolveFirstRequest = () => resolve({ ok: true });
    });
    vi.mocked(rootStore.request).mockReturnValueOnce(firstRequest);
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    chatStore.rename("First title");
    chatStore.rename("Second title");

    expect(rootStore.request).toHaveBeenCalledTimes(1);
    expect(chatStore.thread.title).toBe("First title");
    expect(chatStore.isRenaming).toBe(true);

    resolveFirstRequest?.();
    await flushPromises();

    expect(chatStore.isRenaming).toBe(false);

    chatStore.rename("Second title");
    await flushPromises();

    expect(chatStore.thread.title).toBe("Second title");
    expect(chatStore.isRenaming).toBe(false);
  });

  it("should attach token usage to the matching turn even when it arrives first", () => {
    const chatStore = createChatStore({});
    const usage = createTokenUsage("turn-usage");

    chatStore.applyTokenUsage(usage);
    chatStore.setTurns([createTurn("turn-usage", "completed")]);

    expect(chatStore.tokenUsage).toEqual(usage);
    expect(chatStore.turns[0]?.tokenUsage).toEqual(usage);
  });

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

  it("should preserve a completed turn error for the chat UI", () => {
    const chatStore = createChatStore({});
    const activeTurn = createTurn("turn-active", "running");

    chatStore.setTurns([activeTurn]);
    chatStore.isWorking = true;
    chatStore.activeTurnId = "turn-active";

    chatStore.applyTurnCompleted(
      "turn-active",
      1234,
      "failed",
      "Selected model is at capacity. Please try a different model."
    );

    expect(chatStore.turns.find((turn) => turn.id === "turn-active")).toMatchObject({
      status: "failed",
      errorMessage: "Selected model is at capacity. Please try a different model."
    });
  });

  it.each(["failed", "interrupted"] as const)(
    "should allow editing the last user message when the turn is %s",
    (status) => {
      const chatStore = createChatStore({});
      const turn = createTurn("turn-terminal", status);

      turn.items.push({
        id: "user-message",
        role: "user",
        content: "hello",
        status: "completed",
        createdAt: null,
        attachments: []
      });
      chatStore.setTurns([turn]);

      expect(chatStore.editableLastUserItem).toEqual({
        turnId: "turn-terminal",
        itemId: "user-message",
        content: "hello",
        attachments: []
      });
    }
  );

  it("should apply the terminal status before exposing a completed turn as editable", () => {
    const chatStore = createChatStore({});
    const activeTurn = createTurn("turn-active", "running");

    activeTurn.items.push({
      id: "user-message",
      role: "user",
      content: "hello",
      status: "completed",
      createdAt: null,
      attachments: []
    });
    chatStore.setTurns([activeTurn]);
    chatStore.isWorking = true;
    chatStore.activeTurnId = "turn-active";

    chatStore.applyTurnCompleted("turn-active", 1234, "interrupted");

    expect(chatStore.turns.find((turn) => turn.id === "turn-active")?.status).toBe("interrupted");
    expect(chatStore.editableLastUserItem?.itemId).toBe("user-message");
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

  it("should not clear active turns when pending project UI state is reset", () => {
    const activeChat = {
      isLoadingOlderMessages: true,
      isSyncing: true,
      isRefreshing: true,
      isWorking: true,
      isStartingTurn: true,
      isEditingLastTurn: true,
      isRecovering: false,
      activeTurnId: "turn-active"
    };
    const recoveringChat = {
      isLoadingOlderMessages: true,
      isSyncing: true,
      isRefreshing: true,
      isWorking: true,
      isStartingTurn: false,
      isEditingLastTurn: false,
      isRecovering: true,
      activeTurnId: "turn-recovering"
    };
    const projectsStore = {
      projectStoresById: new Map([
        ["project-1", {
          isLoadingThreads: true,
          isCreatingThread: true,
          loadingThreadId: "thread-1",
          chatsById: new Map([
            ["thread-1", activeChat],
            ["thread-2", recoveringChat]
          ])
        }]
      ])
    } as unknown as ProjectsStore;
    const eventsStore = new ProjectThreadEventsStore(projectsStore, {} as RootStore);

    eventsStore.resetPendingProjectStates();

    expect(activeChat).toMatchObject({
      isLoadingOlderMessages: false,
      isSyncing: true,
      isRefreshing: false,
      isWorking: true,
      isStartingTurn: true,
      isEditingLastTurn: true,
      isRecovering: false,
      activeTurnId: "turn-active"
    });
    expect(recoveringChat).toMatchObject({
      isSyncing: true,
      isRecovering: true,
      isWorking: true,
      activeTurnId: "turn-recovering"
    });
  });
});

describe("ChatStore thread snapshots", () => {
  it("should preserve the scroll request state when refreshing an existing thread", () => {
    const chatStore = createChatStore({});
    const existingTurn = createTurn("turn-existing", "completed");

    chatStore.setTurns([existingTurn]);
    chatStore.applyOpenedSnapshot([existingTurn], "thread.opened", false, true);

    expect(chatStore.scrollToBottomVersion).toBe(0);
  });

  it("should request the bottom scroll when opening a new thread snapshot", () => {
    const chatStore = createChatStore({});

    chatStore.applyOpenedSnapshot(
      [createTurn("turn-new", "completed")],
      "thread.opened",
      false,
      false
    );

    expect(chatStore.scrollToBottomVersion).toBe(1);
  });
});

describe("ChatStore live activities", () => {
  it("should keep the latest command details when output arrives later", () => {
    const chatStore = createChatStore({});

    chatStore.applyActivityUpdated(createCommandActivity(
      "Commande: npm test",
      "running",
      { command: "npm test", aggregatedOutput: null }
    ));
    chatStore.applyActivityUpdated(createCommandActivity(
      "Tests terminés",
      "completed",
      { command: "npm test", aggregatedOutput: "1 test passed" }
    ));

    expect(chatStore.turns[0]?.items[0]?.details).toContain("1 test passed");
  });
});

function createCommandActivity(
  content: string,
  status: OpenCodexActivity["status"],
  details: Record<string, unknown>
): OpenCodexActivity {
  return {
    id: "command-1",
    threadId: "thread-1",
    kind: "commandExecution",
    title: "turn-1",
    content,
    status,
    details: JSON.stringify(details)
  };
}

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

function createTokenUsage(turnId: string): OpenCodexThreadTokenUsage {
  return {
    threadId: "thread-1",
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

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createProjectStore(): ProjectStore {
  const threadListState = {
    threads: [createThread({})]
  };

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
    registerChatRoute: vi.fn(),
    upsertThread: vi.fn((thread: OpenCodexThread) => thread),
    threadListStore: threadListState,
    renameThread: vi.fn((threadId: string, name: string) => {
      threadListState.threads = threadListState.threads.map((thread) => (
        thread.id === threadId
          ? { ...thread, customTitle: name, title: name }
          : thread
      ));
    }),
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
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "" },
            { reasoningEffort: "medium", description: "" },
            { reasoningEffort: "high", description: "" },
            { reasoningEffort: "xhigh", description: "" }
          ],
          defaultReasoningEffort: "medium",
          serviceTiers: []
        },
        {
          id: "gpt-5.4-mini",
          model: "gpt-5.4-mini",
          displayName: "GPT-5.4 Mini",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "" },
            { reasoningEffort: "medium", description: "" },
            { reasoningEffort: "high", description: "" }
          ],
          defaultReasoningEffort: "medium",
          serviceTiers: []
        }
      ],
      selectedModel: "gpt-5.4",
      settings: {
        defaultModel: null,
        defaultReasoningEffort: "medium"
      },
      errorMessage: null,
      getReasoningEffortOptions: vi.fn(() => []),
      resolveReasoningEffort: vi.fn((_model: string | null, effort: string) => effort)
    },
    navigationStore: {
      activeProjectStore: null
    },
    request: vi.fn(() => Promise.resolve({ ok: true }))
  } as RootStore;
}
