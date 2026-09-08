import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedProjectGoal,
  CachedProjectGoalCreateInput,
  CachedProjectGoalUpdateInput
} from "../../types/goals.js";
import type { ProjectGoalCacheRepository } from "../../types/repositoryGoals.js";
import {
  archiveProjectGoal,
  createProjectGoal,
  deleteProjectGoal,
  listProjectGoals,
  unarchiveProjectGoal,
  updateProjectGoal
} from "./projectGoalQueries.js";

/** Provides project goal catalogue persistence through SQLite. */
export class SqliteProjectGoalCacheRepository implements ProjectGoalCacheRepository {
  /** SQLite database connection used by this repository. */
  private readonly database: BetterSqliteDatabase;

  /** Creates a project goal repository backed by the supplied database. */
  constructor(database: BetterSqliteDatabase) {
    this.database = database;
  }

  /** Lists project goals, optionally including archived entries. */
  async listProjectGoals(projectId: string, includeArchived = false): Promise<CachedProjectGoal[]> {
    return await listProjectGoals(this.database, projectId, includeArchived);
  }

  /** Creates a project goal draft. */
  async createProjectGoal(input: CachedProjectGoalCreateInput): Promise<CachedProjectGoal> {
    return await createProjectGoal(this.database, input);
  }

  /** Updates an editable project goal. */
  async updateProjectGoal(
    goalId: string,
    patch: CachedProjectGoalUpdateInput
  ): Promise<CachedProjectGoal> {
    return await updateProjectGoal(this.database, goalId, patch);
  }

  /** Archives a non-running project goal. */
  async archiveProjectGoal(goalId: string): Promise<CachedProjectGoal> {
    return await archiveProjectGoal(this.database, goalId);
  }

  /** Restores an archived project goal. */
  async unarchiveProjectGoal(goalId: string): Promise<CachedProjectGoal> {
    return await unarchiveProjectGoal(this.database, goalId);
  }

  /** Deletes a project goal that has never been launched. */
  async deleteProjectGoal(goalId: string): Promise<void> {
    await deleteProjectGoal(this.database, goalId);
  }
}
