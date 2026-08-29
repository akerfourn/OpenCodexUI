/** Covers native goal reads and mutations exposed by one chat store. */
import type { OpenCodexThreadGoal } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { readTokenBudget } from "../../src/components/dialogs/ChatGoalDialog";
import { ChatStore } from "../../src/stores/chat/ChatStore";
import {
  createProjectStore,
  createRootStore,
  createThread
} from "./chatStoreFixtures";

describe("ChatGoalStore", () => {
  it("should accept an empty budget as the server default", () => {
    expect(readTokenBudget(" ")).toEqual({ value: null, error: false });
    expect(readTokenBudget("20000")).toEqual({ value: 20_000, error: false });
    expect(readTokenBudget("0")).toEqual({ value: null, error: true });
  });

  it("should load a native goal for the chat source", async () => {
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    const goal = createGoal();
    vi.mocked(rootStore.request).mockResolvedValueOnce(goal);

    await chatStore.goal.load();

    expect(rootStore.request).toHaveBeenCalledWith({
      type: "threads.goal.read",
      threadId: "thread-1",
      sourceId: "source-1"
    });
    expect(chatStore.goal.goal).toEqual(goal);
    expect(chatStore.goal.hasStarted).toBe(true);
    expect(chatStore.goal.hasLoaded).toBe(true);
    expect(chatStore.goal.isLoading).toBe(false);
  });

  it("should keep a saved definition paused until it is explicitly started", async () => {
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    const draft = { ...createGoal(), status: "paused" as const, tokensUsed: 0 };
    const started = { ...draft, status: "active" as const, updatedAt: 3 };
    vi.mocked(rootStore.request)
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(started);

    await expect(chatStore.goal.save({
      objective: "Finish the task",
      status: "paused",
      tokenBudget: null
    })).resolves.toBe(true);

    expect(chatStore.goal.goal?.status).toBe("paused");
    expect(chatStore.goal.hasStarted).toBe(false);

    await expect(chatStore.goal.updateStatus("active")).resolves.toBe(true);

    expect(chatStore.goal.goal?.status).toBe("active");
    expect(chatStore.goal.hasStarted).toBe(true);
  });

  it("should share an in-flight read between the header and dialog", async () => {
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    let resolveGoal: (goal: OpenCodexThreadGoal) => void = () => undefined;
    const pendingGoal = new Promise<OpenCodexThreadGoal>((resolve) => {
      resolveGoal = resolve;
    });
    vi.mocked(rootStore.request).mockReturnValueOnce(pendingGoal);

    const firstLoad = chatStore.goal.load();
    const secondLoad = chatStore.goal.load(true);

    expect(rootStore.request).toHaveBeenCalledTimes(1);

    resolveGoal(createGoal());
    await Promise.all([firstLoad, secondLoad]);

    expect(chatStore.goal.goal?.objective).toBe("Finish the task");
    expect(chatStore.goal.hasLoaded).toBe(true);
  });

  it("should release the saving state and retain an error after a failed mutation", async () => {
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    vi.mocked(rootStore.request).mockRejectedValueOnce(new Error("goal unavailable"));

    await expect(chatStore.goal.save({ objective: "Finish the task" })).resolves.toBe(false);

    expect(chatStore.goal.isSaving).toBe(false);
    expect(chatStore.goal.error).toBe("goal unavailable");
  });
});

/** Creates the complete native goal DTO returned by the backend. */
function createGoal(): OpenCodexThreadGoal {
  return {
    threadId: "thread-1",
    objective: "Finish the task",
    status: "active",
    tokenBudget: 20_000,
    tokensUsed: 100,
    timeUsedSeconds: 4,
    createdAt: 1,
    updatedAt: 2
  };
}
