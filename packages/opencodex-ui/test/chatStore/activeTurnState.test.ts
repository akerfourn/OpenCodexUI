/** Covers active-turn lifecycle, recovery, editing, and runtime polling. */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatStore } from "../../src/stores/chat/ChatStore";
import { ProjectThreadEventsStore } from "../../src/stores/project/threads/ProjectThreadEventsStore";
import { hasActiveRunningTurn } from "../../src/stores/chat/chatTurnUtils";
import type { ProjectsStore } from "../../src/stores/project/ProjectsStore";
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

    chatStore.runtime.isWorking = true;
    chatStore.runtime.activeTurnId = "turn-active";
    chatStore.actions.rename("Renamed thread");
    await flushPromises();

    expect(chatStore.thread.title).toBe("Renamed thread");
    expect(chatStore.runtime.isWorking).toBe(true);
    expect(chatStore.runtime.activeTurnId).toBe("turn-active");
    expect(chatStore.actions.isRenaming).toBe(false);
  });

  it("should preserve an active turn when the backend confirms a rename", () => {
    const chatStore = createChatStore({});

    chatStore.runtime.isWorking = true;
    chatStore.runtime.activeTurnId = "turn-active";
    chatStore.applyRename("Renamed thread");

    expect(chatStore.thread.title).toBe("Renamed thread");
    expect(chatStore.runtime.isWorking).toBe(true);
    expect(chatStore.runtime.activeTurnId).toBe("turn-active");
  });

  it("should roll back a failed rename without stopping the active turn", async () => {
    const rootStore = createRootStore();
    const projectStore = createProjectStore();
    vi.mocked(rootStore.request).mockRejectedValueOnce(new Error("Rename failed"));
    const chatStore = new ChatStore(createThread({}), projectStore, rootStore);

    chatStore.runtime.isWorking = true;
    chatStore.runtime.activeTurnId = "turn-active";
    chatStore.actions.rename("Renamed thread");
    await flushPromises();

    expect(chatStore.thread.title).toBe("Thread");
    expect(projectStore.threadListStore.threads[0]).toMatchObject({
      id: "thread-1",
      title: "Thread",
      customTitle: "Thread"
    });
    expect(chatStore.runtime.isWorking).toBe(true);
    expect(chatStore.runtime.activeTurnId).toBe("turn-active");
    expect(chatStore.actions.isRenaming).toBe(false);
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

    chatStore.actions.rename("First title");
    chatStore.actions.rename("Second title");

    expect(rootStore.request).toHaveBeenCalledTimes(1);
    expect(chatStore.thread.title).toBe("First title");
    expect(chatStore.actions.isRenaming).toBe(true);

    resolveFirstRequest?.();
    await flushPromises();

    expect(chatStore.actions.isRenaming).toBe(false);

    chatStore.actions.rename("Second title");
    await flushPromises();

    expect(chatStore.thread.title).toBe("Second title");
    expect(chatStore.actions.isRenaming).toBe(false);
  });

  it("should attach token usage to the matching turn even when it arrives first", () => {
    const chatStore = createChatStore({});
    const usage = createTokenUsage("turn-usage");

    chatStore.timeline.applyTokenUsage(usage);
    chatStore.timeline.setTurns([createTurn("turn-usage", "completed")]);

    expect(chatStore.timeline.tokenUsage).toEqual(usage);
    expect(chatStore.timeline.turns[0]?.tokenUsage).toEqual(usage);
  });

  it("should use the current pending turn when multiple pending turns share a message", () => {
    const chatStore = createChatStore({});
    const olderPendingTurn = createPendingTurn("pending:older", "duplicate message");
    const currentPendingTurn = createPendingTurn("pending:current", "duplicate message");

    chatStore.timeline.setTurns([olderPendingTurn, currentPendingTurn]);
    chatStore.runtime.pendingTurnId = currentPendingTurn.id;

    chatStore.applyMessageStarted({
      id: "message-started",
      threadId: "thread-1",
      role: "user",
      content: "duplicate message",
      status: "completed",
      createdAt: null
    });

    expect(chatStore.runtime.pendingTurnId).toBe(currentPendingTurn.id);
    expect(chatStore.timeline.turns.map((turn) => turn.id)).toEqual([
      olderPendingTurn.id,
      currentPendingTurn.id
    ]);
  });

  it("should retain a historical pending id when no matching pending turn exists", () => {
    const chatStore = createChatStore({});
    const otherPendingTurn = createPendingTurn("pending:other", "other message");

    chatStore.timeline.setTurns([otherPendingTurn]);
    chatStore.runtime.pendingTurnId = "pending:historical";

    chatStore.applyTurnStarted("turn-created");

    expect(chatStore.runtime.pendingTurnId).toBe("pending:historical");
    expect(chatStore.timeline.turns.map((turn) => turn.id)).toEqual([
      otherPendingTurn.id,
      "turn-created"
    ]);
    chatStore.dispose();
  });

  it("should retain a historical pending id when the real turn already exists", () => {
    const chatStore = createChatStore({});
    const pendingTurn = createPendingTurn("pending:historical", "message");
    const existingTurn = createTurn("turn-existing", "completed");

    chatStore.timeline.setTurns([pendingTurn, existingTurn]);
    chatStore.runtime.pendingTurnId = pendingTurn.id;

    chatStore.applyTurnStarted(existingTurn.id);

    expect(chatStore.runtime.pendingTurnId).toBe(pendingTurn.id);
    expect(chatStore.timeline.turns.map((turn) => turn.id)).toEqual([existingTurn.id]);
    expect(chatStore.timeline.turns[0]?.status).toBe("running");
    chatStore.dispose();
  });

  it("should clear pending id only when the pending turn is promoted directly", () => {
    const chatStore = createChatStore({});
    const pendingTurn = createPendingTurn("pending:direct", "message");

    chatStore.timeline.setTurns([pendingTurn]);
    chatStore.runtime.pendingTurnId = pendingTurn.id;

    chatStore.applyTurnStarted("turn-promoted");

    expect(chatStore.runtime.pendingTurnId).toBeNull();
    expect(chatStore.timeline.turns.map((turn) => turn.id)).toEqual(["turn-promoted"]);
    expect(chatStore.timeline.turns[0]?.status).toBe("running");
    chatStore.dispose();
  });

  it("should keep the active turn running when a stale completed event arrives", () => {
    const chatStore = createChatStore({});
    const oldTurn = createTurn("turn-old", "completed");
    const activeTurn = createTurn("turn-active", "running");

    chatStore.timeline.setTurns([oldTurn, activeTurn]);
    chatStore.runtime.isWorking = true;
    chatStore.runtime.activeTurnId = "turn-active";

    chatStore.applyTurnCompleted("turn-old", 1234);

    expect(chatStore.runtime.isWorking).toBe(true);
    expect(chatStore.runtime.activeTurnId).toBe("turn-active");
    expect(chatStore.runtime.pendingTurnId).toBeNull();
    expect(chatStore.timeline.turns.find((turn) => turn.id === "turn-old")?.durationMs).toBe(1234);
  });

  it("should clear the active turn when its completed event arrives", () => {
    const chatStore = createChatStore({});
    const activeTurn = createTurn("turn-active", "running");

    chatStore.timeline.setTurns([activeTurn]);
    chatStore.runtime.isWorking = true;
    chatStore.runtime.activeTurnId = "turn-active";

    chatStore.applyTurnCompleted("turn-active", 1234);

    expect(chatStore.runtime.isWorking).toBe(false);
    expect(chatStore.runtime.activeTurnId).toBeNull();
    expect(chatStore.timeline.turns.find((turn) => turn.id === "turn-active")?.durationMs).toBe(1234);
  });

  it("should preserve a completed turn error for the chat UI", () => {
    const chatStore = createChatStore({});
    const activeTurn = createTurn("turn-active", "running");

    chatStore.timeline.setTurns([activeTurn]);
    chatStore.runtime.isWorking = true;
    chatStore.runtime.activeTurnId = "turn-active";

    chatStore.applyTurnCompleted(
      "turn-active",
      1234,
      "failed",
      "Selected model is at capacity. Please try a different model."
    );

    expect(chatStore.timeline.turns.find((turn) => turn.id === "turn-active")).toMatchObject({
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
      chatStore.timeline.setTurns([turn]);

      expect(chatStore.actions.editableLastUserItem).toEqual({
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
    chatStore.timeline.setTurns([activeTurn]);
    chatStore.runtime.isWorking = true;
    chatStore.runtime.activeTurnId = "turn-active";

    chatStore.applyTurnCompleted("turn-active", 1234, "interrupted");

    expect(chatStore.timeline.turns.find((turn) => turn.id === "turn-active")?.status).toBe("interrupted");
    expect(chatStore.actions.editableLastUserItem?.itemId).toBe("user-message");
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
    chatStore.timeline.setTurns([runningTurn]);

    expect(chatStore.actions.editableLastUserItem).toBeNull();
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
    expect(chatStore.runtime.isWorking).toBe(false);
    expect(chatStore.runtime.activeTurnId).toBeNull();
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
    chatStore.timeline.setTurns([turn]);

    const wasAccepted = chatStore.actions.editLast("after");
    await flushPromises();

    expect(wasAccepted).toBe(true);
    expect(chatStore.timeline.turns).toEqual([turn]);
    expect(chatStore.runtime.isEditingLastTurn).toBe(false);
    expect(chatStore.runtime.isStartingTurn).toBe(false);
    expect(rootStore.appStore.errorMessage).toBe("Edit failed");
  });

  it("should clear recovery state when no running turn was recovered", () => {
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    chatStore.actions.recover();

    expect(rootStore.request).toHaveBeenCalledWith({
      type: "threads.recover",
      threadId: "thread-1"
    });
    expect(chatStore.runtime.isRecovering).toBe(true);
    expect(chatStore.runtime.isSyncing).toBe(true);

    chatStore.runtime.completeRecovery(false);

    expect(chatStore.runtime.isRecovering).toBe(false);
    expect(chatStore.runtime.isSyncing).toBe(false);
    expect(chatStore.runtime.isWorking).toBe(false);
    expect(chatStore.runtime.activeTurnId).toBeNull();
  });

  it("should not clear active turns when pending project UI state is reset", () => {
    const activeChat = {
      timeline: {
        isLoadingOlderMessages: true
      },
      runtime: {
        isSyncing: true,
        isRefreshing: true,
        isWorking: true,
        isStartingTurn: true,
        isEditingLastTurn: true,
        isRecovering: false,
        activeTurnId: "turn-active"
      }
    };
    const recoveringChat = {
      timeline: {
        isLoadingOlderMessages: true
      },
      runtime: {
        isSyncing: true,
        isRefreshing: true,
        isWorking: true,
        isStartingTurn: false,
        isEditingLastTurn: false,
        isRecovering: true,
        activeTurnId: "turn-recovering"
      }
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
      timeline: {
        isLoadingOlderMessages: false
      },
      runtime: {
        isSyncing: true,
        isRefreshing: false,
        isWorking: true,
        isStartingTurn: true,
        isEditingLastTurn: true,
        isRecovering: false,
        activeTurnId: "turn-active"
      }
    });
    expect(recoveringChat).toMatchObject({
      timeline: {
        isLoadingOlderMessages: false
      },
      runtime: {
        isSyncing: true,
        isRecovering: true,
        isWorking: true,
        activeTurnId: "turn-recovering"
      }
    });
  });
});

/** Creates a pending turn with a user item for pending-id transition tests. */
function createPendingTurn(id: string, content: string) {
  const turn = createTurn(id, "running");
  turn.items.push({
    id: `${id}:user`,
    role: "user",
    content,
    status: "completed",
    createdAt: null
  });
  return turn;
}
