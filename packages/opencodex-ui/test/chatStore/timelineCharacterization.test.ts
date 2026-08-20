/** Characterizes timeline merging, streaming, pagination, and reading state. */
import { describe, expect, it } from "vitest";

import {
  createChatStore,
  createTokenUsage,
  createTurn
} from "./chatStoreFixtures";

describe("ChatStore timeline characterization", () => {
  it("should preserve a turn store identity when a synced turn changes", () => {
    const chatStore = createChatStore({});
    const initialTurn = createTurn("turn-1", "running");

    chatStore.timeline.setTurns([initialTurn]);
    const turnStore = chatStore.timeline.turnStores[0];

    chatStore.timeline.applyTurnsSynced([
      {
        ...initialTurn,
        status: "completed",
        completedAt: "2026-08-17T10:00:00.000Z"
      }
    ], false);

    expect(chatStore.timeline.turnStores[0]).toBe(turnStore);
    expect(chatStore.timeline.turnStores[0]?.turn.status).toBe("completed");
  });

  it("should preserve a pending turn when an opened snapshot omits it", () => {
    const chatStore = createChatStore({});
    const pendingTurn = createTurn("pending:local", "running");

    pendingTurn.items.push({
      id: "pending:local:user",
      role: "user",
      content: "pending message",
      status: "completed",
      createdAt: null
    });
    chatStore.timeline.setTurns([pendingTurn]);

    chatStore.timeline.applySnapshot([
      createTurn("turn-server", "completed")
    ], "merge");

    expect(chatStore.timeline.turns.map((turn) => turn.id)).toEqual([
      "turn-server",
      "pending:local"
    ]);
    expect(chatStore.timeline.turns.find((turn) => turn.id === "pending:local")?.items[0]).toMatchObject({
      content: "pending message",
      role: "user"
    });
  });

  it("should attach token usage whether it arrives before or after its turn", () => {
    const chatStore = createChatStore({});
    const earlyUsage = createTokenUsage("turn-before");

    chatStore.timeline.applyTokenUsage(earlyUsage);
    chatStore.timeline.setTurns([createTurn("turn-before", "completed")]);

    expect(chatStore.timeline.turns[0]?.tokenUsage).toEqual(earlyUsage);

    const lateUsage = createTokenUsage("turn-after");
    chatStore.timeline.setTurns([
      ...chatStore.timeline.turns,
      createTurn("turn-after", "completed")
    ]);
    chatStore.timeline.applyTokenUsage(lateUsage);

    expect(chatStore.timeline.tokenUsage).toEqual(lateUsage);
    expect(chatStore.timeline.turns.find((turn) => turn.id === "turn-after")?.tokenUsage)
      .toEqual(lateUsage);
  });

  it("should create the turn and retain a delta received before turn.started", () => {
    const chatStore = createChatStore({});
    chatStore.timeline.setTurns([createTurn("turn-stream", "running")]);

    chatStore.timeline.appendAssistantDelta(
      "turn-stream",
      "assistant-message",
      "partial answer",
      "commentary"
    );

    expect(chatStore.timeline.turns[0]).toMatchObject({
      id: "turn-stream",
      status: "running",
      items: [{
        id: "assistant-message",
        content: "partial answer",
        role: "assistant",
        status: "streaming",
        phase: "commentary"
      }]
    });

    chatStore.applyTurnStarted("turn-stream");

    expect(chatStore.timeline.turns[0]?.items[0]?.content).toBe("partial answer");
    expect(chatStore.runtime.activeTurnId).toBe("turn-stream");
    chatStore.dispose();
  });

  it("should preserve richer live content when a snapshot arrives during streaming", () => {
    const chatStore = createChatStore({});
    chatStore.timeline.setTurns([createTurn("turn-stream", "running")]);

    chatStore.timeline.appendAssistantDelta(
      "turn-stream",
      "assistant-message",
      "snapshot content enriched by live streaming",
      "commentary"
    );

    const snapshotTurn = createTurn("turn-stream", "running");
    snapshotTurn.items.push({
      id: "assistant-message",
      role: "assistant",
      content: "snapshot content",
      status: "completed",
      createdAt: null,
      phase: "commentary"
    });

    chatStore.timeline.applyTurnsSynced([snapshotTurn], false);

    expect(chatStore.timeline.turns[0]?.items[0]).toMatchObject({
      content: "snapshot content enriched by live streaming",
      status: "streaming",
      phase: "commentary"
    });
  });

  it("should prepend older turns while updating pagination and scroll versions", () => {
    const chatStore = createChatStore({});

    chatStore.timeline.setTurns([createTurn("turn-current", "completed")]);
    chatStore.timeline.applyTurnsPrepended(
      [createTurn("turn-older", "completed")],
      true
    );

    expect(chatStore.timeline.turns.map((turn) => turn.id)).toEqual([
      "turn-older",
      "turn-current"
    ]);
    expect(chatStore.timeline.hasMoreOlderMessages).toBe(true);
    expect(chatStore.timeline.olderMessagesPrependVersion).toBe(1);
  });

  it("should isolate retained timeline reading state from the caller", () => {
    const chatStore = createChatStore({});
    const viewState = {
      visibleTurnCount: 3,
      turnCount: 10,
      scrollTop: 240,
      isPinnedToBottom: false
    };

    chatStore.timeline.setTimelineViewState(viewState);
    viewState.scrollTop = 999;
    viewState.visibleTurnCount = 1;

    expect(chatStore.timeline.timelineViewState).toEqual({
      visibleTurnCount: 3,
      turnCount: 10,
      scrollTop: 240,
      isPinnedToBottom: false
    });
    expect(chatStore.timeline.timelineViewState).not.toBe(viewState);
  });
});
