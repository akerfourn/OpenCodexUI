/** Coordinates persistence rules for the project-level goal catalogue. */
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexProjectGoal,
  OpenCodexProjectGoalCreateInput,
  OpenCodexProjectGoalExecutionPatch,
  OpenCodexProjectGoalPatch
} from "@open-codex-ui/opencodex-protocol";

/** Dependencies used by the project goal catalogue service. */
export type ProjectGoalServiceOptions = {
  /** Local cache used to persist project goals, or `null` in a cacheless runtime. */
  cacheRepository: OpenCodexCacheRepository | null;
};

/** Provides the project-scoped goal catalogue without starting execution. */
export class ProjectGoalService {
  /** Creates a project goal service. */
  constructor(private readonly options: ProjectGoalServiceOptions) {}

  /**
   * Lists goals belonging to one project.
   *
   * @param projectId Project identifier.
   * @param includeArchived Whether archived goals should be returned.
   * @returns Project goals, or an empty list without local cache persistence.
   */
  async listProjectGoals(
    projectId: string,
    includeArchived = false
  ): Promise<OpenCodexProjectGoal[]> {
    if (this.options.cacheRepository === null) {
      return [];
    }

    return await this.options.cacheRepository.listProjectGoals(projectId, includeArchived);
  }

  /**
   * Creates a project goal draft.
   *
   * @param input Goal definition.
   * @returns Created draft.
   * @throws Error when local cache persistence is unavailable.
   */
  async createProjectGoal(
    input: OpenCodexProjectGoalCreateInput
  ): Promise<OpenCodexProjectGoal> {
    return await this.requireCacheRepository().createProjectGoal(input);
  }

  /**
   * Updates an editable project goal.
   *
   * The cache rejects objective and budget changes after launch, keeping the
   * definition used for a historical execution stable.
   *
   * @param goalId Goal identifier.
   * @param patch Editable fields.
   * @returns Updated goal.
   * @throws Error when local cache persistence is unavailable.
   */
  async updateProjectGoal(
    goalId: string,
    patch: OpenCodexProjectGoalPatch
  ): Promise<OpenCodexProjectGoal> {
    return await this.requireCacheRepository().updateProjectGoal(goalId, patch);
  }

  /** Synchronizes native execution metadata for a project goal. */
  async updateProjectGoalExecution(
    goalId: string,
    patch: OpenCodexProjectGoalExecutionPatch
  ): Promise<OpenCodexProjectGoal> {
    return await this.requireCacheRepository().updateProjectGoalExecution(goalId, patch);
  }

  /** Archives a goal that is no longer running. */
  async archiveProjectGoal(goalId: string): Promise<OpenCodexProjectGoal> {
    return await this.requireCacheRepository().archiveProjectGoal(goalId);
  }

  /** Restores an archived goal to the project catalogue. */
  async unarchiveProjectGoal(goalId: string): Promise<OpenCodexProjectGoal> {
    return await this.requireCacheRepository().unarchiveProjectGoal(goalId);
  }

  /** Deletes a draft goal that has never been launched. */
  async deleteProjectGoal(goalId: string): Promise<void> {
    await this.requireCacheRepository().deleteProjectGoal(goalId);
  }

  /** Returns the cache required by goal mutations. */
  private requireCacheRepository(): OpenCodexCacheRepository {
    if (this.options.cacheRepository === null) {
      throw new Error("Project goals require the local cache.");
    }

    return this.options.cacheRepository;
  }
}
