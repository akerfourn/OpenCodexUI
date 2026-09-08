import type {
  CachedProjectGoal,
  CachedProjectGoalCreateInput,
  CachedProjectGoalUpdateInput
} from "./goals.js";

/** Persistence contract for the project-level goal catalogue. */
export interface ProjectGoalCacheRepository {
  /**
   * Lists goals belonging to one project.
   *
   * @param projectId Project identifier.
   * @param includeArchived Whether archived goals should be included.
   * @returns Goals ordered for catalogue presentation.
   */
  listProjectGoals(projectId: string, includeArchived?: boolean): Promise<CachedProjectGoal[]>;

  /**
   * Creates a draft goal.
   *
   * @param input Goal definition.
   * @returns Created draft.
   */
  createProjectGoal(input: CachedProjectGoalCreateInput): Promise<CachedProjectGoal>;

  /**
   * Updates a goal definition.
   *
   * Objective and budget are immutable after launch; the repository enforces
   * that rule so callers cannot accidentally rewrite execution history.
   *
   * @param goalId Goal identifier.
   * @param patch Editable goal fields.
   * @returns Updated goal.
   */
  updateProjectGoal(
    goalId: string,
    patch: CachedProjectGoalUpdateInput
  ): Promise<CachedProjectGoal>;

  /**
   * Archives a non-running goal.
   *
   * @param goalId Goal identifier.
   * @returns Archived goal.
   */
  archiveProjectGoal(goalId: string): Promise<CachedProjectGoal>;

  /**
   * Restores an archived goal to the active catalogue.
   *
   * @param goalId Goal identifier.
   * @returns Restored goal.
   */
  unarchiveProjectGoal(goalId: string): Promise<CachedProjectGoal>;

  /**
   * Deletes a goal that has never been launched.
   *
   * @param goalId Goal identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteProjectGoal(goalId: string): Promise<void>;
}
