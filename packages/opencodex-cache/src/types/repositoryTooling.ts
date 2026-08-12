import type { CachedModelCatalog } from "./foundations.js";
import type {
  CachedSource,
  CachedSourceCodexDetection,
  CachedSourceCreateInput,
  CachedSourceSettingsPatch
} from "./sources.js";
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
} from "./automation.js";

export interface SourceCacheRepository {
  /**
   * Ensures that a default local source exists.
   *
   * @returns Existing or newly created default source.
   */
  ensureDefaultSource(): Promise<CachedSource>;

  /**
   * Creates a source with its selected kind and settings.
   *
   * @param name Optional display name for the source.
   * @param input Source kind and settings.
   * @returns Created source.
   */
  createSource(name?: string, input?: CachedSourceCreateInput): Promise<CachedSource>;

  /**
   * Lists all configured sources.
   *
   * @returns Sources ordered for display.
   */
  listSources(): Promise<CachedSource[]>;

  /**
   * Reads a source by identifier.
   *
   * @param sourceId Source identifier.
   * @returns Source when found, otherwise `null`.
   */
  getSource(sourceId: string): Promise<CachedSource | null>;

  /**
   * Counts projects currently associated with a source.
   *
   * @param sourceId Source identifier.
   * @returns Number of linked projects.
   */
  getSourceProjectCount(sourceId: string): Promise<number>;

  /**
   * Updates editable source metadata and settings.
   *
   * @param sourceId Source identifier.
   * @param patch Partial source update.
   * @returns Updated source.
   */
  updateSource(
    sourceId: string,
    patch: Partial<Pick<CachedSource, "name">> & {
      settings?: CachedSourceSettingsPatch;
    }
  ): Promise<CachedSource>;

  /**
   * Stores the latest Codex CLI detection result for a source.
   *
   * @param sourceId Source identifier.
   * @param detection Latest detection result.
   * @returns Promise resolved when the metadata is stored.
   */
  updateSourceCodexDetection(
    sourceId: string,
    detection: CachedSourceCodexDetection
  ): Promise<void>;

  /**
   * Deletes a source after clearing dependent associations.
   *
   * @param sourceId Source identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteSource(sourceId: string): Promise<void>;

  /**
   * Removes project and thread associations for one source.
   *
   * @param sourceId Source identifier.
   * @returns Promise resolved when associations are cleared.
   */
  clearSourceAssociations(sourceId: string): Promise<void>;

  /**
   * Reads the latest cached model catalog for one source.
   *
   * @param sourceId Source identifier.
   * @returns Cached catalog, or `null` when no catalog is stored.
   */
  getModelCatalog(sourceId: string): Promise<CachedModelCatalog | null>;

  /**
   * Stores the latest serialized model catalog for one source.
   *
   * @param sourceId Source identifier.
   * @param modelsJson Serialized model metadata.
   * @returns Promise resolved when the catalog is stored.
   */
  saveModelCatalog(sourceId: string, modelsJson: string): Promise<void>;
}

export interface AutomationCacheRepository {
  /**
   * Lists commands configured for one project.
   *
   * @param projectId Project identifier.
   * @returns Project commands ordered for display.
   */
  listProjectCommands(projectId: string): Promise<CachedProjectCommand[]>;

  /**
   * Creates a project command.
   *
   * @param input Command configuration.
   * @returns Created command.
   */
  createProjectCommand(input: CachedProjectCommandCreateInput): Promise<CachedProjectCommand>;

  /**
   * Reads one project command.
   *
   * @param commandId Command identifier.
   * @returns Matching command.
   */
  getProjectCommand(commandId: string): Promise<CachedProjectCommand>;

  /**
   * Updates a project command.
   *
   * @param commandId Command identifier.
   * @param patch Command update.
   * @returns Updated command.
   */
  updateProjectCommand(
    commandId: string,
    patch: CachedProjectCommandUpdateInput
  ): Promise<CachedProjectCommand>;

  /**
   * Reorders commands configured for one project.
   *
   * @param input Reorder input.
   *
   * @returns Commands in their persisted order.
   */
  reorderProjectCommands(input: CachedProjectCommandReorderInput): Promise<CachedProjectCommand[]>;

  /**
   * Deletes a project command.
   *
   * @param commandId Command identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteProjectCommand(commandId: string): Promise<void>;

  /**
   * Lists command authorization rules configured for one project.
   *
   * @param projectId Project identifier.
   * @returns Project rules ordered by creation date.
   */
  listProjectCommandRules(projectId: string): Promise<CachedProjectCommandRule[]>;

  /**
   * Creates a project command authorization rule.
   *
   * @param input Rule input.
   * @returns Created rule.
   */
  createProjectCommandRule(input: CachedProjectCommandRuleCreateInput): Promise<CachedProjectCommandRule>;

  /**
   * Reads one project command authorization rule.
   *
   * @param ruleId Rule identifier.
   * @returns Matching rule.
   */
  getProjectCommandRule(ruleId: string): Promise<CachedProjectCommandRule>;

  /**
   * Updates one project command authorization rule.
   *
   * @param ruleId Rule identifier.
   * @param patch Rule update.
   * @returns Updated rule.
   */
  updateProjectCommandRule(
    ruleId: string,
    patch: CachedProjectCommandRuleUpdateInput
  ): Promise<CachedProjectCommandRule>;

  /**
   * Deletes one project command authorization rule.
   *
   * @param ruleId Rule identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteProjectCommandRule(ruleId: string): Promise<void>;

  /**
   * Reads generated-file synchronization metadata for one project.
   *
   * @param projectId Project identifier.
   * @returns File state, or `null` when no file was generated yet.
   */
  getProjectCommandRuleFileState(projectId: string): Promise<CachedProjectCommandRuleFileState | null>;

  /**
   * Stores generated-file synchronization metadata for one project.
   *
   * @param state New generated-file state.
   * @returns Promise resolved when the state is stored.
   */
  saveProjectCommandRuleFileState(state: CachedProjectCommandRuleFileState): Promise<void>;

  /**
   * Lists local tasks configured for one project.
   *
   * @param projectId Project identifier.
   * @returns Project tasks ordered for display.
   */
  listProjectTasks(projectId: string): Promise<CachedProjectTask[]>;

  /**
   * Creates a project task.
   *
   * @param input Task input.
   * @returns Created task.
   */
  createProjectTask(input: CachedProjectTaskCreateInput): Promise<CachedProjectTask>;

  /**
   * Updates a project task.
   *
   * @param taskId Task identifier.
   * @param patch Task update.
   * @returns Updated task.
   */
  updateProjectTask(
    taskId: string,
    patch: CachedProjectTaskUpdateInput
  ): Promise<CachedProjectTask>;

  /**
   * Deletes a project task.
   *
   * @param taskId Task identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteProjectTask(taskId: string): Promise<void>;
}
