/** Characterizes runtime state transitions that coordinate chat lifecycle UI. */
import type { OpenCodexThreadRuntimeStatus } from "@open-codex-ui/opencodex-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatStore } from "../../src/stores/ChatStore";
import {
  createProjectStore,
  createRootStore,
  createThread,
  createTurn
} from "./chatStoreFixtures";

const RUNTIME_STATUS_POLL_INTERVAL_MS = 30_000;

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("ChatStore runtime transitions", () => {
  it("should reset runtime state without clearing composer or view state", () => {
    const { chatStore } = createChatStoreWithCollaborators();
    const viewState = {
      visibleTurnCount: 2,
      turnCount: 5,
      scrollTop: 180,
      isPinnedToBottom: false
    };

    chatStore.composer.setDraft("draft", "**draft**", []);
    chatStore.timeline.setTimelineViewState(viewState);
    chatStore.timeline.setTurns([createTurn("turn-loaded", "running")]);
    chatStore.runtime.isSyncing = true;
    chatStore.runtime.isRefreshing = true;
    chatStore.runtime.isRecovering = true;
    chatStore.runtime.isWorking = true;
    chatStore.runtime.isStartingTurn = true;
    chatStore.runtime.isEditingLastTurn = true;
    chatStore.runtime.activeTurnId = "turn-active";
    chatStore.runtime.pendingTurnId = "pending:local";
    chatStore.runtime.hasUnseenCompletedTurn = true;

    chatStore.runtime.reset();

    expect(chatStore.runtime).toMatchObject({
      isSyncing: false,
      isRefreshing: false,
      isRecovering: false,
      isWorking: false,
      isStartingTurn: false,
      isEditingLastTurn: false,
      activeTurnId: null,
      pendingTurnId: null,
      hasUnseenCompletedTurn: false
    });
    expect(chatStore.composer.draft).toBe("draft");
    expect(chatStore.composer.draftMarkdown).toBe("**draft**");
    expect(chatStore.timeline.timelineViewState).toEqual(viewState);
    chatStore.dispose();
  });

  it("should clear refresh state when synchronization ends", () => {
    const { chatStore } = createChatStoreWithCollaborators();

    chatStore.runtime.isRefreshing = true;
    chatStore.runtime.setSyncing(true);
    expect(chatStore.runtime.isRefreshing).toBe(true);
    expect(chatStore.runtime.isSyncing).toBe(true);

    chatStore.runtime.setSyncing(false);

    expect(chatStore.runtime.isSyncing).toBe(false);
    expect(chatStore.runtime.isRefreshing).toBe(false);
    chatStore.dispose();
  });

  it("should couple recovery and synchronization", () => {
    const { chatStore } = createChatStoreWithCollaborators();
    chatStore.runtime.isRefreshing = true;

    chatStore.runtime.setRecovering(true);

    expect(chatStore.runtime.isRecovering).toBe(true);
    expect(chatStore.runtime.isSyncing).toBe(true);
    expect(chatStore.runtime.isRefreshing).toBe(false);

    chatStore.runtime.setRecovering(false);

    expect(chatStore.runtime.isRecovering).toBe(false);
    expect(chatStore.runtime.isSyncing).toBe(false);
    expect(chatStore.runtime.isRefreshing).toBe(false);
    chatStore.dispose();
  });

  it("should start polling after recovery when a running turn is restored", async () => {
    vi.useFakeTimers();
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    chatStore.timeline.setTurns([createTurn("turn-active", "running")]);
    chatStore.runtime.activeTurnId = "turn-active";
    chatStore.runtime.setRecovering(true);
    vi.mocked(rootStore.request).mockResolvedValue(runtimeStatus("thread-1", true));

    chatStore.completeRecovery();
    await vi.advanceTimersByTimeAsync(RUNTIME_STATUS_POLL_INTERVAL_MS);

    expect(chatStore.runtime.isRecovering).toBe(false);
    expect(chatStore.runtime.isSyncing).toBe(false);
    expect(chatStore.runtime.isWorking).toBe(true);
    expect(rootStore.request).toHaveBeenCalledWith({
      type: "threads.runtimeStatus.read",
      threadId: "thread-1"
    });
    chatStore.dispose();
  });

  it("should stop polling after recovery when no running turn is restored", async () => {
    vi.useFakeTimers();
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    chatStore.runtime.setRecovering(true);

    chatStore.runtime.completeRecovery(false);
    await vi.advanceTimersByTimeAsync(RUNTIME_STATUS_POLL_INTERVAL_MS);

    expect(chatStore.runtime.isRecovering).toBe(false);
    expect(chatStore.runtime.isSyncing).toBe(false);
    expect(chatStore.runtime.isWorking).toBe(false);
    expect(chatStore.runtime.activeTurnId).toBeNull();
    expect(rootStore.request).not.toHaveBeenCalled();
    chatStore.dispose();
  });

  it("should enrich a stale completion without stopping the active turn", async () => {
    vi.useFakeTimers();
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    const staleTurn = createTurn("turn-stale", "running");
    const activeTurn = createTurn("turn-active", "running");
    chatStore.timeline.setTurns([staleTurn, activeTurn]);
    chatStore.applyTurnStarted("turn-active");

    chatStore.applyTurnCompleted(
      "turn-stale",
      1_234,
      "failed",
      "stale completion"
    );

    expect(chatStore.runtime.isWorking).toBe(true);
    expect(chatStore.runtime.activeTurnId).toBe("turn-active");
    expect(chatStore.timeline.turns.find((turn) => turn.id === "turn-stale")).toMatchObject({
      durationMs: 1_234,
      status: "failed",
      errorMessage: "stale completion"
    });

    await vi.advanceTimersByTimeAsync(RUNTIME_STATUS_POLL_INTERVAL_MS);
    expect(rootStore.request).toHaveBeenCalledWith({
      type: "threads.runtimeStatus.read",
      threadId: "thread-1"
    });
    chatStore.dispose();
  });

  it.each([
    { name: "visible", isVisible: true, expectedUnseen: false },
    { name: "non-visible", isVisible: false, expectedUnseen: true }
  ])("should mark an active completion unseen when the chat is $name", ({
    isVisible,
    expectedUnseen
  }) => {
    const { chatStore, projectStore, rootStore } = createChatStoreWithCollaborators();

    if (isVisible) {
      projectStore.selectedChatId = "thread-1";
      rootStore.navigationStore.activeProjectStore = projectStore;
    }

    chatStore.timeline.setTurns([createTurn("turn-active", "running")]);
    chatStore.runtime.isWorking = true;
    chatStore.runtime.activeTurnId = "turn-active";

    chatStore.applyTurnCompleted("turn-active", 900);

    expect(chatStore.runtime.isWorking).toBe(false);
    expect(chatStore.runtime.activeTurnId).toBeNull();
    expect(chatStore.runtime.hasUnseenCompletedTurn).toBe(expectedUnseen);
    chatStore.dispose();
  });

  it("should clear runtime flags and refresh after an idle status", () => {
    const { chatStore, projectStore } = createChatStoreWithCollaborators();
    chatStore.timeline.setTurns([createTurn("turn-active", "running")]);
    chatStore.runtime.isWorking = true;
    chatStore.runtime.isStartingTurn = true;
    chatStore.runtime.isEditingLastTurn = true;
    chatStore.runtime.activeTurnId = "turn-active";
    chatStore.runtime.pendingTurnId = "pending:local";

    chatStore.applyRuntimeStatus(runtimeStatus("thread-1", false));

    expect(chatStore.runtime.isWorking).toBe(false);
    expect(chatStore.runtime.isStartingTurn).toBe(false);
    expect(chatStore.runtime.isEditingLastTurn).toBe(false);
    expect(chatStore.runtime.activeTurnId).toBeNull();
    expect(chatStore.runtime.pendingTurnId).toBeNull();
    expect(chatStore.runtime.isRefreshing).toBe(true);
    expect(projectStore.openThread).toHaveBeenCalledWith("thread-1");
    chatStore.dispose();
  });

  it("should expose running and unseen indicators with running taking precedence", () => {
    const { chatStore } = createChatStoreWithCollaborators();

    expect(chatStore.runtime.hasRunningTurnIndicator).toBe(false);
    expect(chatStore.runtime.hasUnseenTurnIndicator).toBe(false);

    chatStore.runtime.hasUnseenCompletedTurn = true;
    expect(chatStore.runtime.hasUnseenTurnIndicator).toBe(true);

    chatStore.runtime.isRecovering = true;
    expect(chatStore.runtime.hasRunningTurnIndicator).toBe(true);
    expect(chatStore.runtime.hasUnseenTurnIndicator).toBe(false);
    chatStore.dispose();
  });
});

/** Creates a chat with collaborators that can be inspected by runtime tests. */
function createChatStoreWithCollaborators(): {
  chatStore: ChatStore;
  projectStore: ReturnType<typeof createProjectStore>;
  rootStore: ReturnType<typeof createRootStore>;
} {
  const projectStore = createProjectStore();
  const rootStore = createRootStore();
  const chatStore = new ChatStore(createThread({}), projectStore, rootStore);

  return { chatStore, projectStore, rootStore };
}

/** Creates a runtime status response for one thread. */
function runtimeStatus(
  threadId: string,
  isActive: boolean
): OpenCodexThreadRuntimeStatus {
  return {
    threadId,
    status: isActive ? "active" : "idle",
    isActive,
    activeFlags: []
  };
}
