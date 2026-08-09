import type {
  CachedProjectTask,
  CachedProjectTaskCreateInput,
  CachedProjectTaskUpdateInput,
  CachedProjectTokenUsageStatistics,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexProjectStatistics,
  OpenCodexProjectTask
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { ProjectCacheDataService } from "../src/backend/ProjectCacheDataService";

describe("ProjectCacheDataService", () => {
  it("should return zero statistics and an empty task list without a cache", async () => {
    const service = new ProjectCacheDataService({ cacheRepository: null });

    await expect(service.readProjectStatistics("/workspace/project", "source-1"))
      .resolves.toEqual(createEmptyProjectStatistics());
    await expect(service.listProjectTasks("project-1")).resolves.toEqual([]);
  });

  it("should pass the explicit project path and source to the statistics query", async () => {
    const statistics: CachedProjectTokenUsageStatistics = {
      chatCount: 4,
      chatsWithTokenUsage: 3,
      chatsWithoutTokenUsage: 1,
      tokenUsage: {
        totalTokens: 400,
        inputTokens: 120,
        cachedInputTokens: 40,
        outputTokens: 180,
        reasoningOutputTokens: 100
      }
    };
    const getProjectTokenUsageStatistics = vi.fn(async (
      _projectPath: string,
      _sourceId: string | null
    ): Promise<CachedProjectTokenUsageStatistics> => statistics);
    const service = new ProjectCacheDataService({
      cacheRepository: createRepository({ getProjectTokenUsageStatistics })
    });

    await expect(service.readProjectStatistics("C:\\workspace\\project", null))
      .resolves.toEqual(statistics satisfies OpenCodexProjectStatistics);
    expect(getProjectTokenUsageStatistics).toHaveBeenCalledWith("C:\\workspace\\project", null);
  });

  it("should forward task CRUD payloads and responses to the cache", async () => {
    const createdTask = createTask("task-created");
    const updatedTask = createTask("task-updated");
    const listProjectTasks = vi.fn(async (projectId: string): Promise<CachedProjectTask[]> => [
      createTask("task-listed", projectId)
    ]);
    const createProjectTask = vi.fn(async (
      input: CachedProjectTaskCreateInput
    ): Promise<CachedProjectTask> => ({
      ...createdTask,
      ...input
    }));
    const updateProjectTask = vi.fn(async (
      taskId: string,
      patch: CachedProjectTaskUpdateInput
    ): Promise<CachedProjectTask> => ({
      ...updatedTask,
      id: taskId,
      ...patch
    }));
    const deleteProjectTask = vi.fn(async (_taskId: string): Promise<void> => undefined);
    const service = new ProjectCacheDataService({
      cacheRepository: createRepository({
        listProjectTasks,
        createProjectTask,
        updateProjectTask,
        deleteProjectTask
      })
    });

    await expect(service.listProjectTasks("project-1")).resolves.toEqual([
      createTask("task-listed", "project-1")
    ]);
    await expect(service.createProjectTask(
      "project-1",
      "Implement cache",
      "Extract the project cache service.",
      "inProgress"
    )).resolves.toEqual({
      ...createdTask,
      projectId: "project-1",
      title: "Implement cache",
      description: "Extract the project cache service.",
      status: "inProgress"
    });

    const patch: CachedProjectTaskUpdateInput = {
      title: "Finish cache extraction",
      status: "done"
    };
    await expect(service.updateProjectTask("task-1", patch)).resolves.toEqual({
      ...updatedTask,
      id: "task-1",
      ...patch
    });
    await expect(service.deleteProjectTask("task-1")).resolves.toEqual({ ok: true });

    expect(listProjectTasks).toHaveBeenCalledWith("project-1");
    expect(createProjectTask).toHaveBeenCalledWith({
      projectId: "project-1",
      title: "Implement cache",
      description: "Extract the project cache service.",
      status: "inProgress"
    });
    expect(updateProjectTask).toHaveBeenCalledWith("task-1", patch);
    expect(deleteProjectTask).toHaveBeenCalledWith("task-1");
  });

  it("should reject cacheless task mutations with the existing error", async () => {
    const service = new ProjectCacheDataService({ cacheRepository: null });

    await expect(service.createProjectTask("project-1", "Task", "Description", "todo"))
      .rejects.toThrowError("Project tasks require the local cache.");
    await expect(service.updateProjectTask("task-1", { status: "done" }))
      .rejects.toThrowError("Project tasks require the local cache.");
    await expect(service.deleteProjectTask("task-1"))
      .rejects.toThrowError("Project tasks require the local cache.");
  });

  it("should propagate cache errors from reads and mutations", async () => {
    const cacheError = new Error("cache unavailable");
    const getProjectTokenUsageStatistics = vi.fn(async (): Promise<CachedProjectTokenUsageStatistics> => {
      throw cacheError;
    });
    const createProjectTask = vi.fn(async (_input: CachedProjectTaskCreateInput): Promise<CachedProjectTask> => {
      throw cacheError;
    });
    const service = new ProjectCacheDataService({
      cacheRepository: createRepository({ getProjectTokenUsageStatistics, createProjectTask })
    });

    await expect(service.readProjectStatistics("/workspace/project", "source-1"))
      .rejects.toBe(cacheError);
    await expect(service.createProjectTask("project-1", "Task", "Description", "todo"))
      .rejects.toBe(cacheError);
  });
});

/** Builds the narrow fake repository surface used by these service tests. */
function createRepository(
  overrides: Partial<{
    getProjectTokenUsageStatistics: (
      projectPath: string,
      sourceId: string | null
    ) => Promise<CachedProjectTokenUsageStatistics>;
    listProjectTasks: (projectId: string) => Promise<CachedProjectTask[]>;
    createProjectTask: (input: CachedProjectTaskCreateInput) => Promise<CachedProjectTask>;
    updateProjectTask: (
      taskId: string,
      patch: CachedProjectTaskUpdateInput
    ) => Promise<CachedProjectTask>;
    deleteProjectTask: (taskId: string) => Promise<void>;
  }> = {}
): OpenCodexCacheRepository {
  return {
    getProjectTokenUsageStatistics: overrides.getProjectTokenUsageStatistics ?? (
      async () => createEmptyProjectStatistics()
    ),
    listProjectTasks: overrides.listProjectTasks ?? (async () => []),
    createProjectTask: overrides.createProjectTask ?? (async (input) => ({
      ...createTask("task-default"),
      ...input
    })),
    updateProjectTask: overrides.updateProjectTask ?? (async (taskId, patch) => ({
      ...createTask(taskId),
      ...patch
    })),
    deleteProjectTask: overrides.deleteProjectTask ?? (async () => undefined)
  } as unknown as OpenCodexCacheRepository;
}

/** Creates stable project task data for repository fakes. */
function createTask(id: string, projectId = "project-1"): CachedProjectTask {
  return {
    id,
    projectId,
    title: "Task title",
    description: "Task description",
    status: "todo",
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z"
  };
}

/** Creates the zero-value project statistics expected without cache data. */
function createEmptyProjectStatistics(): OpenCodexProjectStatistics {
  return {
    chatCount: 0,
    chatsWithTokenUsage: 0,
    chatsWithoutTokenUsage: 0,
    tokenUsage: {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0
    }
  };
}
