import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexProjectStatistics,
  OpenCodexProjectTask,
  OpenCodexProjectTaskStatus
} from "@open-codex-ui/opencodex-protocol";

/** Dependencies used by the project cache data service. */
export type ProjectCacheDataServiceOptions = {
  /** Cache repository used for project statistics and tasks, or `null` when unavailable. */
  cacheRepository: OpenCodexCacheRepository | null;
};

/** Coordinates cache-backed project statistics and local task data. */
export class ProjectCacheDataService {
  /** Creates a project cache data service. */
  constructor(
    /** Cache repository used for project statistics and tasks. */
    private readonly options: ProjectCacheDataServiceOptions
  ) {}

  /**
   * Reads aggregate token usage for one project from the local cache.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier, or `null` for an orphan project.
   * @returns Project statistics based on cached chat snapshots.
   */
  async readProjectStatistics(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexProjectStatistics> {
    if (this.options.cacheRepository === null) {
      return createEmptyProjectStatistics();
    }

    const statistics = await this.options.cacheRepository.getProjectTokenUsageStatistics(
      projectPath,
      sourceId
    );

    return {
      chatCount: statistics.chatCount,
      chatsWithTokenUsage: statistics.chatsWithTokenUsage,
      chatsWithoutTokenUsage: statistics.chatsWithoutTokenUsage,
      tokenUsage: statistics.tokenUsage
    };
  }

  /**
   * Lists local tasks configured for a project.
   *
   * @param projectId Project identifier.
   * @returns Project tasks, or an empty list when the cache is unavailable.
   */
  async listProjectTasks(projectId: string): Promise<OpenCodexProjectTask[]> {
    if (this.options.cacheRepository === null) {
      return [];
    }

    return await this.options.cacheRepository.listProjectTasks(projectId);
  }

  /**
   * Creates a local project task.
   *
   * @param projectId Project identifier.
   * @param title Task title.
   * @param description Task description.
   * @param status Task status.
   * @returns Created task.
   * @throws Error when the local cache is unavailable.
   */
  async createProjectTask(
    projectId: string,
    title: string,
    description: string,
    status: OpenCodexProjectTaskStatus
  ): Promise<OpenCodexProjectTask> {
    const repository = this.requireCacheRepository();
    return await repository.createProjectTask({
      projectId,
      title,
      description,
      status
    });
  }

  /**
   * Updates a local project task.
   *
   * @param taskId Task identifier.
   * @param patch Task patch.
   * @returns Updated task.
   * @throws Error when the local cache is unavailable.
   */
  async updateProjectTask(
    taskId: string,
    patch: {
      title?: string;
      description?: string;
      status?: OpenCodexProjectTaskStatus;
    }
  ): Promise<OpenCodexProjectTask> {
    const repository = this.requireCacheRepository();
    return await repository.updateProjectTask(taskId, patch);
  }

  /**
   * Deletes a local project task.
   *
   * @param taskId Task identifier.
   * @returns Success result.
   * @throws Error when the local cache is unavailable.
   */
  async deleteProjectTask(taskId: string): Promise<{ ok: true }> {
    const repository = this.requireCacheRepository();
    await repository.deleteProjectTask(taskId);
    return { ok: true };
  }

  /**
   * Returns the cache repository required for task mutations.
   *
   * @returns Configured cache repository.
   * @throws Error when local cache persistence is unavailable.
   */
  private requireCacheRepository(): OpenCodexCacheRepository {
    if (this.options.cacheRepository === null) {
      throw new Error("Project tasks require the local cache.");
    }

    return this.options.cacheRepository;
  }
}

/**
 * Creates an empty project statistics response when the cache is unavailable.
 *
 * @returns Zeroed project statistics.
 */
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
