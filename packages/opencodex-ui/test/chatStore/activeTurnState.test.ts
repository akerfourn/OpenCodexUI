/** Covers active-turn lifecycle, recovery, editing, and runtime polling. */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatStore } from "../../src/stores/ChatStore";
import { ProjectThreadEventsStore } from "../../src/stores/ProjectThreadEventsStore";
import { hasActiveRunningTurn } from "../../src/stores/chatTurnUtils";
import type { ProjectsStore } from "../../src/stores/ProjectsStore";
import type { RootStore } from "../../src/stores/RootStore";
import {
  createChatStore,
  createProjectStore,
  createRootStore,
  createThread,
  createTokenUsage,
  createTurn,
  flushPromises
} from "./chatStoreFixtures";

afterEach(() => {
  vi.useRealTimers();
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

  it("should stop runtime polling when disposed", async () => {
    vi.useFakeTimers();
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    chatStore.applyTurnStarted("turn-active");
    chatStore.dispose();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(rootStore.request).not.toHaveBeenCalled();
  });

  it("should restore the previous turn after edit preparation fails", async () => {
    const rootStore = createRootStore();
    vi.mocked(rootStore.request).mockRejectedValueOnce(new Error("Edit failed"));
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    const turn = createTurn("turn-terminal", "completed");
    turn.items.push({
      id: "user-message",
      role: "user",
      content: "before",
      status: "completed",
      createdAt: null,
      attachments: []
    });
    chatStore.setTurns([turn]);

    const wasAccepted = chatStore.editLastTurn("after");
    await flushPromises();

    expect(wasAccepted).toBe(true);
    expect(chatStore.turns).toEqual([turn]);
    expect(chatStore.isEditingLastTurn).toBe(false);
    expect(chatStore.isStartingTurn).toBe(false);
    expect(rootStore.appStore.errorMessage).toBe("Edit failed");
  });

  it("should clear recovery state when no running turn was recovered", () => {
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    chatStore.recover();

    expect(rootStore.request).toHaveBeenCalledWith({
      type: "threads.recover",
      threadId: "thread-1"
    });
    expect(chatStore.isRecovering).toBe(true);
    expect(chatStore.isSyncing).toBe(true);

    chatStore.completeRecovery();

    expect(chatStore.isRecovering).toBe(false);
    expect(chatStore.isSyncing).toBe(false);
    expect(chatStore.isWorking).toBe(false);
    expect(chatStore.activeTurnId).toBeNull();
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
          threadListStore: {
            isLoadingThreads: true,
            isCreatingThread: true,
            loadingThreadId: "thread-1"
          },
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
