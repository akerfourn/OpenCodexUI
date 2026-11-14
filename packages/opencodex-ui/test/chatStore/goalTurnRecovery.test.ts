/** Covers native goal turns restored without a user message or a live start event. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { autorun } from "mobx";
import type { OpenCodexActivity } from "@open-codex-ui/opencodex-protocol";

import { ChatStore } from "../../src/stores/chat/ChatStore";
import { ProjectThreadEventsStore } from "../../src/stores/project/threads/ProjectThreadEventsStore";
import type { ProjectsStore } from "../../src/stores/project/ProjectsStore";
import { createProjectStore, createRootStore, createThread, createTurn } from "./chatStoreFixtures";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T08:00:00.000Z"));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Goal turn recovery", () => {
  it.each(["inProgress", "running"])("should restore a %s goal turn and allow streaming and interruption", async status => {
    const { chat, root } = createFixture();

    chat.applyOpenedSnapshot([createTurn("goal-turn", status)], "thread.opened", false, false);
    chat.applyMessageDelta("goal-turn", "progress", "Checking the project", "commentary");
    chat.applyActivityUpdated(commandActivity());
    chat.actions.interrupt();

    expect(chat.runtime).toMatchObject({ activeTurnId: "goal-turn", isWorking: true });
    expect(chat.timeline.turnStores[0]?.subTurns[0]?.reasoningItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "progress", content: "Checking the project" }),
      expect.objectContaining({ id: "command", kind: "commandExecution" })
    ]));
    expect(root.request).toHaveBeenCalledWith({
      type: "turn.interrupt", threadId: "thread-1", turnId: "goal-turn"
    });

    vi.mocked(root.request).mockResolvedValue({ threadId: "thread-1", isActive: true, status: "active", activeFlags: [] });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(root.request).toHaveBeenCalledWith({ type: "threads.runtimeStatus.read", threadId: "thread-1" });
    chat.dispose();
  });

  it("should accept native inProgress activity before a start event identifies the active turn", () => {
    const { chat } = createFixture();
    chat.timeline.setTurns([createTurn("goal-turn", "inProgress")]);

    chat.applyMessageDelta("goal-turn", "progress", "Working", "commentary");
    chat.applyActivityUpdated(commandActivity());

    expect(chat.timeline.turns[0]?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "progress" }), expect.objectContaining({ id: "command" })
    ]));
    chat.dispose();
  });

  it("should restore a goal turn discovered by background synchronization", () => {
    const { chat, router } = createFixture();
    chat.applyOpenedSnapshot([createTurn("previous", "completed")], "thread.opened", false, false);

    router.handleEvent({
      type: "thread.turns.synced", threadId: "thread-1", sourceId: "source-1",
      turns: [createTurn("previous", "completed"), createTurn("goal-turn", "inProgress")],
      hasMoreOlderMessages: false
    });

    expect(chat.runtime).toMatchObject({ activeTurnId: "goal-turn", isWorking: true });
    chat.dispose();
  });

  it("should display the next autonomous goal turn without requiring a user message", () => {
    const { chat } = createFixture();
    chat.applyOpenedSnapshot([createTurn("goal-turn", "inProgress")], "thread.opened", false, false);
    chat.applyTurnCompleted("goal-turn", 100, "completed");
    let renderedContents: string[] = [];
    const stopObserving = autorun(() => {
      renderedContents = chat.timeline.turnStores.flatMap(turn => (
        turn.subTurns.flatMap(subTurn => subTurn.reasoningItems.map(item => item.content))
      ));
    });

    chat.applyTurnStarted("continuation");
    chat.applyActivityUpdated({ ...commandActivity(), title: "continuation" });
    chat.applyMessageDelta("continuation", "progress", "Continuing the goal", "commentary");

    expect(chat.runtime).toMatchObject({ activeTurnId: "continuation", isWorking: true });
    const continuation = chat.timeline.turnStores.find(turn => turn.id === "continuation");
    expect(continuation?.subTurns[0]).toMatchObject({
      userMessage: null,
      reasoningItems: [
        expect.objectContaining({ id: "command" }), expect.objectContaining({ id: "progress" })
      ]
    });
    expect(renderedContents).toContain("Continuing the goal");
    chat.applyMessageDelta("continuation", "progress", " safely", "commentary");
    expect(renderedContents).toContain("Continuing the goal safely");
    stopObserving();
    chat.dispose();
  });

  it("should ignore snapshots from a different source while restoring goal controls", () => {
    const { chat, router } = createFixture();

    router.handleEvent({
      type: "thread.turns.synced", threadId: "thread-1", sourceId: "another-source",
      turns: [createTurn("goal-turn", "inProgress")], hasMoreOlderMessages: false
    });

    expect(chat.runtime).toMatchObject({ activeTurnId: null, isWorking: false });
    expect(chat.timeline.turns).toHaveLength(0);
    chat.dispose();
  });

  it("should preserve a locally confirmed turn when an older snapshot arrives", () => {
    const { chat } = createFixture();
    chat.applyTurnStarted("current");

    chat.applyOpenedSnapshot([createTurn("old", "inProgress")], "thread.opened", false, true);

    expect(chat.runtime.activeTurnId).toBe("current");
    chat.dispose();
  });

  it("should preserve a pending user request until its own response confirms the turn", () => {
    const { chat } = createFixture();
    const attempt = chat.runtime.beginTurnStart(true, "New request");

    chat.applyOpenedSnapshot([createTurn("old", "inProgress")], "thread.opened", false, true);

    expect(chat.runtime.activeTurnId).toBeNull();
    expect(chat.runtime.isAwaitingTurnStartConfirmation).toBe(true);
    chat.confirmTurnStarted(attempt, "new-turn");
    expect(chat.runtime.activeTurnId).toBe("new-turn");
    chat.dispose();
  });

  it("should preserve an event-bound request until its live start event arrives", () => {
    const { chat } = createFixture();
    chat.runtime.beginTurnStart();

    chat.applyOpenedSnapshot([createTurn("old", "inProgress")], "thread.opened", false, true);

    expect(chat.runtime.activeTurnId).toBeNull();
    expect(chat.runtime.isStartingTurn).toBe(true);
    chat.dispose();
  });

  it("should not resurrect a completed goal turn from a delayed running snapshot", () => {
    const { chat } = createFixture();
    chat.applyTurnStarted("goal-turn");
    chat.applyTurnCompleted("goal-turn", 100, "completed");

    chat.applyOpenedSnapshot([createTurn("goal-turn", "inProgress")], "thread.opened", false, true);
    chat.applyActivityUpdated(commandActivity());

    expect(chat.runtime).toMatchObject({ activeTurnId: null, isWorking: false });
    expect(chat.timeline.turns[0]?.items).toHaveLength(0);
    chat.dispose();
  });

  it("should not restore a stale running turn before a newer terminal turn", () => {
    const { chat } = createFixture();

    chat.applyOpenedSnapshot([
      createTurn("old", "inProgress"), createTurn("latest", "completed")
    ], "thread.opened", false, false);

    expect(chat.runtime).toMatchObject({ activeTurnId: null, isWorking: false });
    chat.dispose();
  });

  it("should retain cache-only projects as read-only without restoring live controls", () => {
    const root = createRootStore();
    const project = createProjectStore();
    Object.assign(project, { isReadOnlyFromCache: true });
    const chat = new ChatStore(createThread({}), project, root);

    chat.applyOpenedSnapshot([createTurn("goal-turn", "inProgress")], "thread.opened", false, false);

    expect(chat.runtime).toMatchObject({ activeTurnId: null, isWorking: false });
    chat.actions.interrupt();
    expect(root.request).not.toHaveBeenCalled();
    chat.dispose();
  });
});

/** Creates real chat state with isolated transport and source-aware event routing. */
function createFixture() {
  const root = createRootStore();
  const chat = new ChatStore(createThread({}), createProjectStore(), root);
  const projects = {
    findChatStoreByThreadId: (threadId: string, sourceId?: string | null) => {
      if (threadId !== chat.thread.id || sourceId !== chat.sourceId) return null;
      return chat;
    }
  } as unknown as ProjectsStore;
  return { chat, root, router: new ProjectThreadEventsStore(projects, root) };
}

/** Supplies a visible tool action even when Codex emits no readable reasoning summary. */
function commandActivity(): OpenCodexActivity {
  return {
    id: "command", threadId: "thread-1", title: "goal-turn", kind: "commandExecution",
    content: "Running checks", status: "running"
  };
}
