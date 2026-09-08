/** Covers project goal catalogue state and transport payloads. */
import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexProjectGoal,
  OpenCodexRequest,
  OpenCodexThreadGoal
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "../src/stores/chat/ChatStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import { ProjectGoalsStore } from "../src/stores/project/ProjectGoalsStore";
import type { RootStore } from "../src/stores/RootStore";

describe("ProjectGoalsStore", () => {
  it("should load and mutate project goals with plain normalized payloads", async () => {
    const draft = createGoal();
    const createdGoal = createGoal({ id: "goal-2", name: "Release" });
    const updatedGoal = createGoal({ id: "goal-2", name: "Release v2" });
    const request = createRequestMock([
      [draft],
      createdGoal,
      updatedGoal
    ]);
    const { store } = createStoreFixture(request);

    await store.loadGoals();
    await store.createGoal({
      name: " Release ",
      objective: " Prepare the release. ",
      tokenBudget: 10_000
    });
    await store.updateGoal("goal-2", {
      name: " Release v2 ",
      objective: " Verify the release. "
    });

    expect(request.mock.calls[0]?.[0]).toEqual({
      type: "projectGoals.list",
      projectId: "project-1",
      includeArchived: false
    });
    expect(request.mock.calls[1]?.[0]).toEqual({
      type: "projectGoals.create",
      projectId: "project-1",
      name: "Release",
      objective: "Prepare the release.",
      tokenBudget: 10_000
    });
    expect(request.mock.calls[2]?.[0]).toEqual({
      type: "projectGoals.update",
      goalId: "goal-2",
      patch: {
        name: "Release v2",
        objective: "Verify the release."
      }
    });
    expect(store.currentGoals).toEqual([updatedGoal, draft]);
  });

  it("should hide archived goals by default and restore them explicitly", async () => {
    const draft = createGoal();
    const archivedGoal = createGoal({ isArchived: true, archivedAt: "2026-01-02T00:00:00.000Z" });
    const restoredGoal = createGoal();
    const request = createRequestMock([archivedGoal, restoredGoal, undefined]);
    const { store } = createStoreFixture(request);
    store.goals = [draft];

    await store.archiveGoal(draft.id);
    expect(store.goals).toEqual([]);

    store.goals = [archivedGoal];
    await store.unarchiveGoal(archivedGoal.id);
    expect(store.goals).toEqual([restoredGoal]);

    await store.deleteGoal(restoredGoal.id);
    expect(store.goals).toEqual([]);
    expect(request.mock.calls.map(([input]) => input.type)).toEqual([
      "projectGoals.archive",
      "projectGoals.unarchive",
      "projectGoals.delete"
    ]);
  });

  it("should report mutation errors and release the saving state", async () => {
    const request = vi.fn(async (_input: OpenCodexRequest): Promise<unknown> => {
      throw new Error("catalogue unavailable");
    }) as unknown as RootStore["request"];
    const { store, root } = createStoreFixture(request);

    await expect(store.createGoal({
      name: "Draft",
      objective: "Prepare the release.",
      tokenBudget: null
    })).rejects.toThrow("catalogue unavailable");

    expect(store.isSaving).toBe(false);
    expect(store.errorMessage).toBe("catalogue unavailable");
    expect(root.appStore.errorMessage).toBe("catalogue unavailable");
  });

  it("should persist execution snapshots separately from the goal definition", async () => {
    const goal = createGoal();
    const updatedGoal = createGoal({
      status: "active",
      sourceId: "source-1",
      threadId: "thread-1",
      launchedAt: "2026-01-01T10:00:00.000Z"
    });
    const request = createRequestMock([updatedGoal]);
    const { store } = createStoreFixture(request);
    store.goals = [goal];

    await store.updateExecution(goal.id, {
      status: "active",
      sourceId: " source-1 ",
      threadId: " thread-1 ",
      tokensUsed: 42,
      timeUsedSeconds: 3
    });

    expect(request.mock.calls[0]?.[0]).toEqual({
      type: "projectGoals.execution.update",
      goalId: "goal-1",
      patch: {
        status: "active",
        sourceId: "source-1",
        threadId: "thread-1",
        tokensUsed: 42,
        timeUsedSeconds: 3
      }
    });
    expect(store.goals).toEqual([updatedGoal]);
  });

  it("should not duplicate an archived goal while importing a legacy native goal", async () => {
    const archivedGoal = createGoal({
      status: "complete",
      isArchived: true,
      threadId: "thread-1",
      sourceId: "source-1",
      launchedAt: "2026-01-01T10:00:00.000Z"
    });
    const request = createRequestMock([[archivedGoal]]);
    const { store } = createStoreFixture(request);
    const nativeGoal = createNativeGoal({ status: "complete" });
    const chatStore = {
      thread: { id: "thread-1" },
      goal: {
        load: vi.fn(async () => undefined),
        error: null,
        goal: nativeGoal
      }
    } as unknown as ChatStore;

    await store.importNativeGoal(chatStore);

    expect(chatStore.goal.load).toHaveBeenCalledWith(true);
    expect(request).toHaveBeenCalledWith({
      type: "projectGoals.list",
      projectId: "project-1",
      includeArchived: true
    });
    expect(store.goals).toEqual([archivedGoal]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("should retain a completed native goal in the project catalogue", async () => {
    const completedGoal = createGoal({
      status: "complete",
      sourceId: "source-1",
      threadId: "thread-1",
      tokensUsed: 120,
      timeUsedSeconds: 45,
      launchedAt: "2026-01-01T10:00:00.000Z",
      completedAt: "2026-01-01T10:00:45.000Z"
    });
    const request = createRequestMock([[], createGoal(), completedGoal]);
    const { store } = createStoreFixture(request);
    const nativeGoal = createNativeGoal({ status: "complete", tokensUsed: 120, timeUsedSeconds: 45 });
    const load = vi.fn(async () => undefined);
    const chatStore = {
      thread: { id: "thread-1" },
      sourceId: "source-1",
      goal: {
        load,
        error: null,
        goal: nativeGoal
      }
    } as unknown as ChatStore;

    await store.importNativeGoal(chatStore);

    expect(load).toHaveBeenCalledWith(true);
    expect(request.mock.calls.map(([input]) => input.type)).toEqual([
      "projectGoals.list",
      "projectGoals.create",
      "projectGoals.execution.update"
    ]);
    expect(store.goals).toEqual([completedGoal]);
  });

  it("should flag only active or paused goals for project attention", () => {
    const { store } = createStoreFixture(vi.fn() as unknown as RootStore["request"]);
    const completedGoal = createGoal({ status: "complete" });

    store.goals = [completedGoal];
    expect(store.hasAttention).toBe(false);

    store.goals = [createGoal({ status: "paused" })];
    expect(store.hasAttention).toBe(true);

    store.goals = [createGoal({ status: "active" })];
    expect(store.hasAttention).toBe(true);
  });
});

/** Creates a project goal store with an isolated request mock. */
function createStoreFixture(
  request: RootStore["request"]
): { store: ProjectGoalsStore; root: RootStore } {
  const projectStore = {
    project: { id: "project-1" }
  } as ProjectStore;
  const root = {
    request,
    appStore: { errorMessage: null }
  } as unknown as RootStore;

  return { store: new ProjectGoalsStore(projectStore, root), root };
}

/** Creates a sequential request mock for goal store operations. */
function createRequestMock(
  responses: unknown[]
): RootStore["request"] & { mock: { calls: Array<[OpenCodexRequest]> } } {
  return vi.fn(async (_input: OpenCodexRequest): Promise<unknown> => {
    return responses.shift();
  }) as unknown as RootStore["request"] & { mock: { calls: Array<[OpenCodexRequest]> } };
}

/** Creates one deterministic project goal fixture. */
function createGoal(overrides: Partial<OpenCodexProjectGoal> = {}): OpenCodexProjectGoal {
  return {
    id: "goal-1",
    projectId: "project-1",
    name: "Goal 1",
    objective: "Prepare the release.",
    tokenBudget: null,
    status: "draft",
    isArchived: false,
    sourceId: null,
    threadId: null,
    workspaceId: null,
    cwd: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    launchedAt: null,
    pausedAt: null,
    completedAt: null,
    archivedAt: null,
    lastSyncedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

/** Creates one native goal snapshot for catalogue import tests. */
function createNativeGoal(
  overrides: Partial<OpenCodexThreadGoal> = {}
): OpenCodexThreadGoal {
  return {
    threadId: "thread-1",
    objective: "Prepare the release.",
    status: "active",
    tokenBudget: null,
    tokensUsed: 20,
    timeUsedSeconds: 4,
    createdAt: 1,
    updatedAt: 2,
    ...overrides
  };
}
