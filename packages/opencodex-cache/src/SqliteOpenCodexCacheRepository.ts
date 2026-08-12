/**
 * Provides the public SQLite-backed cache repository facade.
 */
import fs from "node:fs";
import path from "node:path";

import Database, { type Database as BetterSqliteDatabase } from "better-sqlite3";
import type { OpenCodexCollaborationEvent } from "@open-codex-ui/opencodex-protocol";

import type {
  CachedCollaborationEvent,
  CachedCollaborationEventQuery,
  CachedLogCreateInput,
  CachedLogEntry,
  CachedLogListQuery,
  CachedLogPage,
  CachedModelCatalog,
  CachedOlderTurnsQuery,
  CachedOlderTurnsResult,
  CachedProject,
  CachedProjectCommand,
  CachedProjectCommandCreateInput,
  CachedProjectCommandReorderInput,
  CachedProjectCommandRule,
  CachedProjectCommandRuleCreateInput,
  CachedProjectCommandRuleFileState,
  CachedProjectCommandRuleUpdateInput,
  CachedProjectCommandUpdateInput,
  CachedProjectGroup,
  CachedProjectGroupCreateInput,
  CachedProjectGroupsSnapshot,
  CachedProjectGroupUpdateInput,
  CachedProjectPreferences,
  CachedProjectTask,
  CachedProjectTaskCreateInput,
  CachedProjectTaskUpdateInput,
  CachedProjectTokenUsageStatistics,
  CachedSource,
  CachedSourceCodexDetection,
  CachedSourceCreateInput,
  CachedSourceSettingsPatch,
  CachedSourceTokenUsageSnapshotQuery,
  CachedThreadDelta,
  CachedThreadReadOptions,
  CachedThreadSnapshot,
  CachedThreadSummary,
  CachedThreadSyncState,
  CachedThreadTokenUsage,
  CachedThreadTokenUsageSnapshot,
  CachedThreadTokenUsageSnapshotQuery,
  CachedTurnExecutionMetadata,
  CachedUsageRateLimitSnapshot,
  CachedUsageRateLimitSnapshotQuery,
  OpenCodexCacheRepository,
  ThreadListCacheQuery
} from "./types.js";
import type {
  CollaborationCacheRepository,
  LogCacheRepository,
  ProjectCacheRepository
} from "./types/repositoryProjects.js";
import type { ThreadCacheRepository } from "./types/repositoryThreads.js";
import type {
  AutomationCacheRepository,
  SourceCacheRepository
} from "./types/repositoryTooling.js";
import { runMigrations } from "./sqlite/migrations.js";
import { SqliteAutomationCacheRepository } from "./sqlite/repositories/SqliteAutomationCacheRepository.js";
import { SqliteCollaborationCacheRepository } from "./sqlite/repositories/SqliteCollaborationCacheRepository.js";
import { SqliteLogCacheRepository } from "./sqlite/repositories/SqliteLogCacheRepository.js";
import { SqliteProjectCacheRepository } from "./sqlite/repositories/SqliteProjectCacheRepository.js";
import { SqliteSourceCacheRepository } from "./sqlite/repositories/SqliteSourceCacheRepository.js";
import { SqliteThreadCacheRepository } from "./sqlite/repositories/SqliteThreadCacheRepository.js";

export type SqliteOpenCodexCacheRepositoryOptions = {
  directory: string;
  fileName?: string;
};

/**
 * Creates the SQLite-backed cache repository used by the desktop application.
 *
 * @param options Directory and optional file name for the SQLite database.
 * @returns Cache repository implementation backed by SQLite.
 */
export function createOpenCodexSqliteCacheRepository(
  options: SqliteOpenCodexCacheRepositoryOptions
): OpenCodexCacheRepository {
  return new SqliteOpenCodexCacheRepository(options);
}

/**
 * Exposes the cache contract while delegating persistence to domain repositories.
 */
export class SqliteOpenCodexCacheRepository implements OpenCodexCacheRepository {
  /** SQLite connection owned by this facade. */
  private readonly database: BetterSqliteDatabase;

  /** Source persistence operations. */
  private readonly sources: SourceCacheRepository;

  /** Collaboration-event persistence operations. */
  private readonly collaboration: CollaborationCacheRepository;

  /** Project persistence operations. */
  private readonly projects: ProjectCacheRepository;

  /** Application-log persistence operations. */
  private readonly logs: LogCacheRepository;

  /** Project automation persistence operations. */
  private readonly automation: AutomationCacheRepository;

  /** Thread and usage persistence operations. */
  private readonly threads: ThreadCacheRepository;

  /**
   * Opens and migrates the database, then initializes domain repositories.
   *
   * @param options Directory and optional file name for the database file.
   */
  constructor(options: SqliteOpenCodexCacheRepositoryOptions) {
    fs.mkdirSync(options.directory, { recursive: true });

    const fileName = options.fileName ?? "opencodex-cache.sqlite";
    this.database = new Database(path.join(options.directory, fileName));
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    runMigrations(this.database);

    this.sources = new SqliteSourceCacheRepository(this.database);
    this.collaboration = new SqliteCollaborationCacheRepository(this.database);
    this.projects = new SqliteProjectCacheRepository(this.database);
    this.logs = new SqliteLogCacheRepository(this.database);
    this.automation = new SqliteAutomationCacheRepository(this.database);
    this.threads = new SqliteThreadCacheRepository(this.database);
  }

  /** Ensures a default source exists. */
  async ensureDefaultSource(): Promise<CachedSource> {
    return await this.sources.ensureDefaultSource();
  }

  /** Creates a source. */
  async createSource(
    name = "Codex",
    input: CachedSourceCreateInput = { kind: "local" }
  ): Promise<CachedSource> {
    return await this.sources.createSource(name, input);
  }

  /** Lists configured sources. */
  async listSources(): Promise<CachedSource[]> {
    return await this.sources.listSources();
  }

  /** Reads a source by identifier. */
  async getSource(sourceId: string): Promise<CachedSource | null> {
    return await this.sources.getSource(sourceId);
  }

  /** Counts projects associated with a source. */
  async getSourceProjectCount(sourceId: string): Promise<number> {
    return await this.sources.getSourceProjectCount(sourceId);
  }

  /** Updates a source. */
  async updateSource(
    sourceId: string,
    patch: Partial<Pick<CachedSource, "name">> & {
      settings?: CachedSourceSettingsPatch;
    }
  ): Promise<CachedSource> {
    return await this.sources.updateSource(sourceId, patch);
  }

  /** Stores the latest Codex detection result for a source. */
  async updateSourceCodexDetection(
    sourceId: string,
    detection: CachedSourceCodexDetection
  ): Promise<void> {
    await this.sources.updateSourceCodexDetection(sourceId, detection);
  }

  /** Deletes a source. */
  async deleteSource(sourceId: string): Promise<void> {
    await this.sources.deleteSource(sourceId);
  }

  /** Clears project and thread references to a source. */
  async clearSourceAssociations(sourceId: string): Promise<void> {
    await this.sources.clearSourceAssociations(sourceId);
  }

  /** Reads the latest cached model catalog for a source. */
  async getModelCatalog(sourceId: string): Promise<CachedModelCatalog | null> {
    return await this.sources.getModelCatalog(sourceId);
  }

  /** Stores the latest serialized model catalog for a source. */
  async saveModelCatalog(sourceId: string, modelsJson: string): Promise<void> {
    await this.sources.saveModelCatalog(sourceId, modelsJson);
  }

  /** Inserts or enriches a normalized collaboration event. */
  async upsertCollaborationEvent(
    event: OpenCodexCollaborationEvent
  ): Promise<CachedCollaborationEvent> {
    return await this.collaboration.upsertCollaborationEvent(event);
  }

  /** Lists collaboration events matching source-aware filters. */
  async listCollaborationEvents(
    query: CachedCollaborationEventQuery
  ): Promise<CachedCollaborationEvent[]> {
    return await this.collaboration.listCollaborationEvents(query);
  }

  /** Inserts or updates a cached project. */
  async upsertProject(
    projectPath: string,
    sourceId: string | null = null
  ): Promise<CachedProject> {
    return await this.projects.upsertProject(projectPath, sourceId);
  }

  /** Lists cached projects. */
  async listProjects(): Promise<CachedProject[]> {
    return await this.projects.listProjects();
  }

  /** Lists project groups and their mixed tree. */
  async listProjectGroups(): Promise<CachedProjectGroupsSnapshot> {
    return await this.projects.listProjectGroups();
  }

  /** Creates a project group. */
  async createProjectGroup(input: CachedProjectGroupCreateInput): Promise<CachedProjectGroup> {
    return await this.projects.createProjectGroup(input);
  }

  /** Updates a project group. */
  async updateProjectGroup(
    groupId: string,
    patch: CachedProjectGroupUpdateInput
  ): Promise<CachedProjectGroup> {
    return await this.projects.updateProjectGroup(groupId, patch);
  }

  /** Deletes a project group while retaining its children. */
  async deleteProjectGroup(groupId: string): Promise<void> {
    await this.projects.deleteProjectGroup(groupId);
  }

  /** Moves a project to a group or the ungrouped root. */
  async assignProjectToGroup(projectId: string, groupId: string | null): Promise<void> {
    await this.projects.assignProjectToGroup(projectId, groupId);
  }

  /** Deletes safe empty orphan project duplicates. */
  async deleteRedundantOrphanProjects(): Promise<number> {
    return await this.projects.deleteRedundantOrphanProjects();
  }

  /** Updates project hidden state. */
  async setProjectHidden(projectId: string, isHidden: boolean): Promise<void> {
    await this.projects.setProjectHidden(projectId, isHidden);
  }

  /** Updates a project display name. */
  async updateProjectDisplayName(
    projectId: string,
    displayName: string | null
  ): Promise<CachedProject | null> {
    return await this.projects.updateProjectDisplayName(projectId, displayName);
  }

  /** Updates project preferences. */
  async updateProjectPreferences(
    projectId: string,
    preferences: CachedProjectPreferences
  ): Promise<CachedProject | null> {
    return await this.projects.updateProjectPreferences(projectId, preferences);
  }

  /** Deletes a cached project. */
  async deleteProject(projectId: string): Promise<void> {
    await this.projects.deleteProject(projectId);
  }

  /** Creates an application log entry. */
  async createLog(input: CachedLogCreateInput): Promise<CachedLogEntry> {
    return await this.logs.createLog(input);
  }

  /** Lists application logs. */
  async listLogs(query: CachedLogListQuery): Promise<CachedLogPage> {
    return await this.logs.listLogs(query);
  }

  /** Deletes an application log entry. */
  async deleteLog(logId: string): Promise<void> {
    await this.logs.deleteLog(logId);
  }

  /** Deletes all application logs. */
  async clearLogs(): Promise<void> {
    await this.logs.clearLogs();
  }

  /** Deletes application logs older than a timestamp. */
  async clearLogsOlderThan(createdBefore: string): Promise<void> {
    await this.logs.clearLogsOlderThan(createdBefore);
  }

  /** Lists commands configured for a project. */
  async listProjectCommands(projectId: string): Promise<CachedProjectCommand[]> {
    return await this.automation.listProjectCommands(projectId);
  }

  /** Creates a project command. */
  async createProjectCommand(
    input: CachedProjectCommandCreateInput
  ): Promise<CachedProjectCommand> {
    return await this.automation.createProjectCommand(input);
  }

  /** Reads a project command. */
  async getProjectCommand(commandId: string): Promise<CachedProjectCommand> {
    return await this.automation.getProjectCommand(commandId);
  }

  /** Updates a project command. */
  async updateProjectCommand(
    commandId: string,
    patch: CachedProjectCommandUpdateInput
  ): Promise<CachedProjectCommand> {
    return await this.automation.updateProjectCommand(commandId, patch);
  }

  /** Reorders commands configured for a project. */
  async reorderProjectCommands(
    input: CachedProjectCommandReorderInput
  ): Promise<CachedProjectCommand[]> {
    return await this.automation.reorderProjectCommands(input);
  }

  /** Deletes a project command. */
  async deleteProjectCommand(commandId: string): Promise<void> {
    await this.automation.deleteProjectCommand(commandId);
  }

  /** Lists command authorization rules for a project. */
  async listProjectCommandRules(projectId: string): Promise<CachedProjectCommandRule[]> {
    return await this.automation.listProjectCommandRules(projectId);
  }

  /** Creates a project command authorization rule. */
  async createProjectCommandRule(
    input: CachedProjectCommandRuleCreateInput
  ): Promise<CachedProjectCommandRule> {
    return await this.automation.createProjectCommandRule(input);
  }

  /** Reads a project command authorization rule. */
  async getProjectCommandRule(ruleId: string): Promise<CachedProjectCommandRule> {
    return await this.automation.getProjectCommandRule(ruleId);
  }

  /** Updates a project command authorization rule. */
  async updateProjectCommandRule(
    ruleId: string,
    patch: CachedProjectCommandRuleUpdateInput
  ): Promise<CachedProjectCommandRule> {
    return await this.automation.updateProjectCommandRule(ruleId, patch);
  }

  /** Deletes a project command authorization rule. */
  async deleteProjectCommandRule(ruleId: string): Promise<void> {
    await this.automation.deleteProjectCommandRule(ruleId);
  }

  /** Reads generated-file synchronization metadata for a project. */
  async getProjectCommandRuleFileState(
    projectId: string
  ): Promise<CachedProjectCommandRuleFileState | null> {
    return await this.automation.getProjectCommandRuleFileState(projectId);
  }

  /** Stores generated-file synchronization metadata for a project. */
  async saveProjectCommandRuleFileState(
    state: CachedProjectCommandRuleFileState
  ): Promise<void> {
    await this.automation.saveProjectCommandRuleFileState(state);
  }

  /** Lists local tasks configured for a project. */
  async listProjectTasks(projectId: string): Promise<CachedProjectTask[]> {
    return await this.automation.listProjectTasks(projectId);
  }

  /** Creates a local project task. */
  async createProjectTask(input: CachedProjectTaskCreateInput): Promise<CachedProjectTask> {
    return await this.automation.createProjectTask(input);
  }

  /** Updates a local project task. */
  async updateProjectTask(
    taskId: string,
    patch: CachedProjectTaskUpdateInput
  ): Promise<CachedProjectTask> {
    return await this.automation.updateProjectTask(taskId, patch);
  }

  /** Deletes a local project task. */
  async deleteProjectTask(taskId: string): Promise<void> {
    await this.automation.deleteProjectTask(taskId);
  }

  /** Inserts or updates cached thread metadata. */
  async upsertThreadIndex(threads: CachedThreadSummary[]): Promise<void> {
    await this.threads.upsertThreadIndex(threads);
  }

  /** Updates a user-defined thread title. */
  async updateThreadTitle(threadId: string, title: string): Promise<void> {
    await this.threads.updateThreadTitle(threadId, title);
  }

  /** Updates the local archive marker for a thread. */
  async updateThreadArchiveState(threadId: string, isArchived: boolean): Promise<void> {
    await this.threads.updateThreadArchiveState(threadId, isArchived);
  }

  /** Updates a Codex-generated thread title. */
  async updateThreadCodexTitle(threadId: string, title: string): Promise<void> {
    await this.threads.updateThreadCodexTitle(threadId, title);
  }

  /** Deletes a cached thread. */
  async deleteThread(threadId: string): Promise<void> {
    await this.threads.deleteThread(threadId);
  }

  /** Deletes empty never-synced thread shells for a project. */
  async deleteEmptyUnsyncedThreads(
    currentProjectPath: string,
    sourceId?: string | null
  ): Promise<number> {
    return await this.threads.deleteEmptyUnsyncedThreads(currentProjectPath, sourceId);
  }

  /** Lists cached threads. */
  async listThreads(query: ThreadListCacheQuery): Promise<CachedThreadSummary[]> {
    return await this.threads.listThreads(query);
  }

  /** Aggregates token usage for a cached project. */
  async getProjectTokenUsageStatistics(
    projectPath: string,
    sourceId: string | null
  ): Promise<CachedProjectTokenUsageStatistics> {
    return await this.threads.getProjectTokenUsageStatistics(projectPath, sourceId);
  }

  /** Reads a cached thread snapshot. */
  async getThread(
    threadId: string,
    options: CachedThreadReadOptions = {}
  ): Promise<CachedThreadSnapshot | null> {
    return await this.threads.getThread(threadId, options);
  }

  /** Reads older cached turns. */
  async getOlderTurns(query: CachedOlderTurnsQuery): Promise<CachedOlderTurnsResult> {
    return await this.threads.getOlderTurns(query);
  }

  /** Saves a full thread snapshot. */
  async saveThreadSnapshot(snapshot: CachedThreadSnapshot): Promise<void> {
    await this.threads.saveThreadSnapshot(snapshot);
  }

  /** Saves an incremental thread delta. */
  async saveThreadDelta(delta: CachedThreadDelta): Promise<void> {
    await this.threads.saveThreadDelta(delta);
  }

  /** Saves the latest known thread token usage. */
  async saveThreadTokenUsage(
    usage: CachedThreadTokenUsage,
    sourceId: string | null = null
  ): Promise<void> {
    await this.threads.saveThreadTokenUsage(usage, sourceId);
  }

  /** Stores a distinct token usage snapshot. */
  async saveThreadTokenUsageSnapshot(snapshot: CachedThreadTokenUsageSnapshot): Promise<void> {
    await this.threads.saveThreadTokenUsageSnapshot(snapshot);
  }

  /** Saves latest token usage and a history snapshot atomically. */
  async saveThreadTokenUsageAndSnapshot(
    usage: CachedThreadTokenUsage,
    snapshot: CachedThreadTokenUsageSnapshot
  ): Promise<void> {
    await this.threads.saveThreadTokenUsageAndSnapshot(usage, snapshot);
  }

  /** Reads historical token usage snapshots for a thread. */
  async listThreadTokenUsageSnapshots(
    query: CachedThreadTokenUsageSnapshotQuery
  ): Promise<CachedThreadTokenUsageSnapshot[]> {
    return await this.threads.listThreadTokenUsageSnapshots(query);
  }

  /** Reads source-wide token usage snapshots with thread baselines. */
  async listSourceTokenUsageSnapshots(
    query: CachedSourceTokenUsageSnapshotQuery
  ): Promise<CachedThreadTokenUsageSnapshot[]> {
    return await this.threads.listSourceTokenUsageSnapshots(query);
  }

  /** Stores a source-scoped rate-limit snapshot. */
  async saveUsageRateLimitSnapshot(snapshot: CachedUsageRateLimitSnapshot): Promise<void> {
    await this.threads.saveUsageRateLimitSnapshot(snapshot);
  }

  /** Reads historical source-scoped rate-limit snapshots. */
  async listUsageRateLimitSnapshots(
    query: CachedUsageRateLimitSnapshotQuery
  ): Promise<CachedUsageRateLimitSnapshot[]> {
    return await this.threads.listUsageRateLimitSnapshots(query);
  }

  /** Upserts execution metadata for a turn. */
  async saveTurnExecutionMetadata(metadata: CachedTurnExecutionMetadata): Promise<void> {
    await this.threads.saveTurnExecutionMetadata(metadata);
  }

  /** Reads cached thread synchronization state. */
  async getSyncState(threadId: string): Promise<CachedThreadSyncState | null> {
    return await this.threads.getSyncState(threadId);
  }

  /** Flushes WAL state and closes the database. */
  async close(): Promise<void> {
    this.database.pragma("wal_checkpoint(TRUNCATE)");
    this.database.close();
  }
}
