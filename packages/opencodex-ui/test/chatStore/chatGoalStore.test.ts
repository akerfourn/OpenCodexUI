/** Covers native goal reads and mutations exposed by one chat store. */
import type { OpenCodexThreadGoal } from "@open-codex-ui/opencodex-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  countGoalCharacters,
  MAX_GOAL_OBJECTIVE_CHARACTERS,
  readGoalFormValues,
  readTokenBudget
} from "../../src/components/dialogs/ChatGoalDialog";
import { ChatStore } from "../../src/stores/chat/ChatStore";
import {
  createProjectStore,
  createRootStore,
  createThread
} from "./chatStoreFixtures";

describe("ChatGoalStore", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should accept an empty budget as the server default", () => {
    expect(readTokenBudget(" ")).toEqual({ value: null, error: false });
    expect(readTokenBudget("20000")).toEqual({ value: 20_000, error: false });
    expect(readTokenBudget("0")).toEqual({ value: null, error: true });
  });

  it("should count Unicode code points for the native goal limit", () => {
    expect(countGoalCharacters("é😀")).toBe(2);
    expect(countGoalCharacters("a".repeat(MAX_GOAL_OBJECTIVE_CHARACTERS))).toBe(
      MAX_GOAL_OBJECTIVE_CHARACTERS
    );
  });

  it("should reject an objective beyond the native goal limit", () => {
    expect(readGoalFormValues("a".repeat(MAX_GOAL_OBJECTIVE_CHARACTERS + 1), "")).toEqual({
      values: null,
      error: "objectiveTooLong"
    });
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
    const draft = {
      ...createGoal(),
      status: "paused" as const,
      tokensUsed: 0,
      timeUsedSeconds: 0
    };
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

  it("should restore a started paused goal as resumable after a new UI session", async () => {
    const rootStore = createRootStore();
    const firstChatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    const pausedGoal = {
      ...createGoal(),
      status: "paused" as const,
      tokensUsed: 0,
      timeUsedSeconds: 0
    };

    vi.mocked(rootStore.request).mockResolvedValueOnce({ ...createGoal(), status: "active" as const });
    await expect(firstChatStore.goal.updateStatus("active")).resolves.toBe(true);

    vi.mocked(rootStore.request).mockResolvedValueOnce(pausedGoal);
    await expect(firstChatStore.goal.updateStatus("paused")).resolves.toBe(true);

    const reopenedChatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    vi.mocked(rootStore.request).mockResolvedValueOnce(pausedGoal);

    await reopenedChatStore.goal.load();

    expect(reopenedChatStore.goal.goal?.status).toBe("paused");
    expect(reopenedChatStore.goal.hasStarted).toBe(true);
  });

  it("should treat a legacy paused goal without a local marker as resumable", async () => {
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    const legacyPausedGoal = {
      ...createGoal(),
      status: "paused" as const,
      tokensUsed: 0,
      timeUsedSeconds: 0
    };

    vi.mocked(rootStore.request).mockResolvedValueOnce(legacyPausedGoal);

    await chatStore.goal.load();

    expect(chatStore.goal.hasStarted).toBe(true);
  });

  it("should keep a paused saved definition as a draft after a new UI session", async () => {
    const rootStore = createRootStore();
    const firstChatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    const draft = {
      ...createGoal(),
      status: "paused" as const,
      tokensUsed: 0,
      timeUsedSeconds: 0
    };

    vi.mocked(rootStore.request).mockResolvedValueOnce(draft);
    await expect(firstChatStore.goal.save({
      objective: "Finish the task",
      status: "paused",
      tokenBudget: null
    })).resolves.toBe(true);

    const reopenedChatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    vi.mocked(rootStore.request).mockResolvedValueOnce(draft);

    await reopenedChatStore.goal.load();

    expect(reopenedChatStore.goal.goal?.status).toBe("paused");
    expect(reopenedChatStore.goal.hasStarted).toBe(false);
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

/** Provides deterministic browser storage for renderer-store tests. */
function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length(): number {
      return values.size;
    },
    clear(): void {
      values.clear();
    },
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    key(index: number): string | null {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      values.delete(key);
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    }
  };
}
