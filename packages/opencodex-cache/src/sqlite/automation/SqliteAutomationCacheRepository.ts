import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedProjectCommand,
  CachedProjectCommandCreateInput,
  CachedProjectCommandReorderInput,
  CachedProjectCommandRule,
  CachedProjectCommandRuleCreateInput,
  CachedProjectCommandRuleFileState,
  CachedProjectCommandRuleUpdateInput,
  CachedProjectCommandUpdateInput,
  CachedProjectTask,
  CachedProjectTaskCreateInput,
  CachedProjectTaskUpdateInput
} from "../../types/automation.js";
import type { AutomationCacheRepository } from "../../types/repositoryTooling.js";
import {
  createProjectCommand,
  deleteProjectCommand,
  listProjectCommands,
  readProjectCommand,
  reorderProjectCommands,
  updateProjectCommand
} from "./projectCommandQueries.js";
import {
  createProjectCommandRule,
  deleteProjectCommandRule,
  getProjectCommandRuleFileState,
  listProjectCommandRules,
  readProjectCommandRule,
  saveProjectCommandRuleFileState,
  updateProjectCommandRule
} from "./projectCommandRuleQueries.js";
import {
  createProjectTask,
  deleteProjectTask,
  listProjectTasks,
  updateProjectTask
} from "./projectTaskQueries.js";

/** Provides project command, rule, and task persistence through SQLite. */
export class SqliteAutomationCacheRepository implements AutomationCacheRepository {
  /** SQLite database connection used by this repository. */
  private readonly database: BetterSqliteDatabase;

  /** Creates an automation repository backed by the supplied database. */
  constructor(database: BetterSqliteDatabase) {
    this.database = database;
  }

  /** Lists commands configured for a project. */
  async listProjectCommands(projectId: string): Promise<CachedProjectCommand[]> {
    return await listProjectCommands(this.database, projectId);
  }

  /** Creates a project command. */
  async createProjectCommand(
    input: CachedProjectCommandCreateInput
  ): Promise<CachedProjectCommand> {
    return await createProjectCommand(this.database, input);
  }

  /** Reads a project command. */
  async getProjectCommand(commandId: string): Promise<CachedProjectCommand> {
    return await readProjectCommand(this.database, commandId);
  }

  /** Updates a project command. */
  async updateProjectCommand(
    commandId: string,
    patch: CachedProjectCommandUpdateInput
  ): Promise<CachedProjectCommand> {
    return await updateProjectCommand(this.database, commandId, patch);
  }

  /** Reorders commands configured for a project. */
  async reorderProjectCommands(
    input: CachedProjectCommandReorderInput
  ): Promise<CachedProjectCommand[]> {
    return await reorderProjectCommands(this.database, input);
  }

  /** Deletes a project command. */
  async deleteProjectCommand(commandId: string): Promise<void> {
    await deleteProjectCommand(this.database, commandId);
  }

  /** Lists command authorization rules configured for a project. */
  async listProjectCommandRules(projectId: string): Promise<CachedProjectCommandRule[]> {
    return await listProjectCommandRules(this.database, projectId);
  }

  /** Creates a project command authorization rule. */
  async createProjectCommandRule(
    input: CachedProjectCommandRuleCreateInput
  ): Promise<CachedProjectCommandRule> {
    return await createProjectCommandRule(this.database, input);
  }

  /** Reads a project command authorization rule. */
  async getProjectCommandRule(ruleId: string): Promise<CachedProjectCommandRule> {
    return await readProjectCommandRule(this.database, ruleId);
  }

  /** Updates a project command authorization rule. */
  async updateProjectCommandRule(
    ruleId: string,
    patch: CachedProjectCommandRuleUpdateInput
  ): Promise<CachedProjectCommandRule> {
    return await updateProjectCommandRule(this.database, ruleId, patch);
  }

  /** Deletes a project command authorization rule. */
  async deleteProjectCommandRule(ruleId: string): Promise<void> {
    await deleteProjectCommandRule(this.database, ruleId);
  }

  /** Reads generated-file synchronization metadata for a project. */
  async getProjectCommandRuleFileState(
    projectId: string
  ): Promise<CachedProjectCommandRuleFileState | null> {
    return await getProjectCommandRuleFileState(this.database, projectId);
  }

  /** Stores generated-file synchronization metadata for a project. */
  async saveProjectCommandRuleFileState(
    state: CachedProjectCommandRuleFileState
  ): Promise<void> {
    await saveProjectCommandRuleFileState(this.database, state);
  }

  /** Lists local tasks configured for a project. */
  async listProjectTasks(projectId: string): Promise<CachedProjectTask[]> {
    return await listProjectTasks(this.database, projectId);
  }

  /** Creates a local project task. */
  async createProjectTask(input: CachedProjectTaskCreateInput): Promise<CachedProjectTask> {
    return await createProjectTask(this.database, input);
  }

  /** Updates a local project task. */
  async updateProjectTask(
    taskId: string,
    patch: CachedProjectTaskUpdateInput
  ): Promise<CachedProjectTask> {
    return await updateProjectTask(this.database, taskId, patch);
  }

  /** Deletes a local project task. */
  async deleteProjectTask(taskId: string): Promise<void> {
    await deleteProjectTask(this.database, taskId);
  }
}
