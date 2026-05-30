/**
 * Provides the public SQLite-backed cache repository facade.
 */
import fs from "node:fs";
import path from "node:path";

import Database, { type Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedOlderTurnsQuery,
  CachedLogCreateInput,
  CachedLogEntry,
  CachedLogListQuery,
  CachedLogPage,
  CachedOlderTurnsResult,
  CachedProject,
  CachedProjectPreferences,
  CachedProjectCommand,
  CachedProjectCommandCreateInput,
  CachedProjectCommandUpdateInput,
  CachedSource,
  CachedSourceLocalSettings,
  CachedThreadDelta,
  CachedThreadReadOptions,
  CachedThreadSnapshot,
  CachedThreadSummary,
  CachedThreadSyncState,
  CachedThreadTokenUsage,
  OpenCodexCacheRepository,
  ThreadListCacheQuery
} from "./types.js";
import { runMigrations } from "./sqlite/migrations.js";
import {
  clearLogs,
  clearLogsOlderThan,
  createLog,
  deleteLog,
  listLogs
} from "./sqlite/logQueries.js";
import {
  createProjectCommand,
  deleteProjectCommand,
  listProjectCommands,
  readProjectCommand,
  updateProjectCommand
} from "./sqlite/projectCommandQueries.js";
import {
  clearSourceAssociations,
  createSource,
  deleteSource,
  ensureDefaultSource,
  getSource,
  getSourceProjectCount,
  listSources,
  updateSource
} from "./sqlite/sourceQueries.js";
import {
  deleteProject,
  listProjects,
  setProjectHidden,
  updateProjectPreferences,
  upsertProject
} from "./sqlite/projectQueries.js";
import {
  deleteThread,
  deleteEmptyUnsyncedThreads,
  getOlderTurns,
  getSyncState,
  getThread,
  listThreads,
  saveThreadDelta,
  saveThreadTokenUsage,
  saveThreadSnapshot,
  updateThreadCodexTitle,
  updateThreadTitle,
  upsertThreadIndex
} from "./sqlite/threadQueries.js";

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
 * Implements the thread cache contract with a local SQLite database.
 */
export class SqliteOpenCodexCacheRepository implements OpenCodexCacheRepository {
  private readonly database: BetterSqliteDatabase;

  /**
   * Opens the SQLite database, configures pragmas, and runs migrations.
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
  }

  /**
   * Ensures a default source exists.
   *
   * @returns Default source.
   */
  async ensureDefaultSource(): Promise<CachedSource> {
    return await ensureDefaultSource(this.database);
  }

  /**
   * Creates a source.
   *
   * @param name Source display name.
   *
   * @returns Created source.
   */
  async createSource(name = "Codex"): Promise<CachedSource> {
    return await createSource(this.database, name);
  }

  /**
   * Lists configured sources.
   *
   * @returns Cached sources.
   */
  async listSources(): Promise<CachedSource[]> {
    return await listSources(this.database);
  }

  /**
   * Reads a source by identifier.
   *
   * @param sourceId Source identifier.
   *
   * @returns Cached source, or `null`.
   */
  async getSource(sourceId: string): Promise<CachedSource | null> {
    return await getSource(this.database, sourceId);
  }

  /**
   * Counts projects associated with a source.
   *
   * @param sourceId Source identifier.
   *
   * @returns Associated project count.
   */
  async getSourceProjectCount(sourceId: string): Promise<number> {
    return await getSourceProjectCount(this.database, sourceId);
  }

  /**
   * Updates a source.
   *
   * @param sourceId Source identifier.
   * @param patch Source patch.
   *
   * @returns Updated source.
   */
  async updateSource(
    sourceId: string,
    patch: Partial<Pick<CachedSource, "name">> & {
      settings?: Partial<CachedSourceLocalSettings>;
    }
  ): Promise<CachedSource> {
    return await updateSource(this.database, sourceId, patch);
  }

  /**
   * Deletes a source.
   *
   * @param sourceId Source identifier.
   *
   * @returns Promise resolved when deletion completes.
   */
  async deleteSource(sourceId: string): Promise<void> {
    await deleteSource(this.database, sourceId);
  }

  /**
   * Clears project and thread references to a source.
   *
   * @param sourceId Source identifier.
   *
   * @returns Promise resolved when associations are cleared.
   */
  async clearSourceAssociations(sourceId: string): Promise<void> {
    await clearSourceAssociations(this.database, sourceId);
  }

  /**
   * Inserts or updates a cached project.
   *
   * @param projectPath Project path.
   * @param sourceId Optional source identifier.
   *
   * @returns Cached project.
   */
  async upsertProject(projectPath: string, sourceId: string | null = null): Promise<CachedProject> {
    return await upsertProject(this.database, projectPath, sourceId);
  }

  /**
   * Lists cached projects.
   *
   * @returns Cached projects.
   */
  async listProjects(): Promise<CachedProject[]> {
    return await listProjects(this.database);
  }

  /**
   * Updates project hidden state.
   *
   * @param projectId Project identifier.
   * @param isHidden Hidden flag.
   *
   * @returns Promise resolved when the update completes.
   */
  async setProjectHidden(projectId: string, isHidden: boolean): Promise<void> {
    await setProjectHidden(this.database, projectId, isHidden);
  }

  /**
   * Updates project preferences.
   *
   * @param projectId Project identifier.
   * @param preferences Preferences to persist.
   *
   * @returns Updated project, or `null` when missing.
   */
  async updateProjectPreferences(
    projectId: string,
    preferences: CachedProjectPreferences
  ): Promise<CachedProject | null> {
    return await updateProjectPreferences(this.database, projectId, preferences);
  }

  /**
   * Deletes a cached project.
   *
   * @param projectId Project identifier.
   *
   * @returns Promise resolved when the row is deleted.
   */
  async deleteProject(projectId: string): Promise<void> {
    await deleteProject(this.database, projectId);
  }

  /**
   * Creates an application log entry.
   *
   * @param input Log payload.
   *
   * @returns Created log entry.
   */
  async createLog(input: CachedLogCreateInput): Promise<CachedLogEntry> {
    return await createLog(this.database, input);
  }

  /**
   * Lists application logs.
   *
   * @param query Log pagination query.
   *
   * @returns Log page.
   */
  async listLogs(query: CachedLogListQuery): Promise<CachedLogPage> {
    return await listLogs(this.database, query);
  }

  /**
   * Deletes one application log entry.
   *
   * @param logId Log identifier.
   *
   * @returns Promise resolved when deletion completes.
   */
  async deleteLog(logId: string): Promise<void> {
    await deleteLog(this.database, logId);
  }

  /**
   * Deletes all application logs.
   *
   * @returns Promise resolved when deletion completes.
   */
  async clearLogs(): Promise<void> {
    await clearLogs(this.database);
  }

  /**
   * Deletes application logs older than the provided timestamp.
   *
   * @param createdBefore Exclusive timestamp cutoff.
   *
   * @returns Promise resolved when deletion completes.
   */
  async clearLogsOlderThan(createdBefore: string): Promise<void> {
    await clearLogsOlderThan(this.database, createdBefore);
  }

  /**
   * Lists commands configured for one project.
   *
   * @param projectId Project identifier.
   *
   * @returns Cached project commands.
   */
  async listProjectCommands(projectId: string): Promise<CachedProjectCommand[]> {
    return await listProjectCommands(this.database, projectId);
  }

  /**
   * Creates a command for a project.
   *
   * @param input Command input.
   *
   * @returns Created command.
   */
  async createProjectCommand(
    input: CachedProjectCommandCreateInput
  ): Promise<CachedProjectCommand> {
    return await createProjectCommand(this.database, input);
  }

  /**
   * Reads one project command.
   *
   * @param commandId Command identifier.
   *
   * @returns Matching command.
   */
  async getProjectCommand(commandId: string): Promise<CachedProjectCommand> {
    return await readProjectCommand(this.database, commandId);
  }

  /**
   * Updates a project command.
   *
   * @param commandId Command identifier.
   * @param patch Command patch.
   *
   * @returns Updated command.
   */
  async updateProjectCommand(
    commandId: string,
    patch: CachedProjectCommandUpdateInput
  ): Promise<CachedProjectCommand> {
    return await updateProjectCommand(this.database, commandId, patch);
  }

  /**
   * Deletes a project command.
   *
   * @param commandId Command identifier.
   *
   * @returns Promise resolved when deletion completes.
   */
  async deleteProjectCommand(commandId: string): Promise<void> {
    await deleteProjectCommand(this.database, commandId);
  }

  /**
   * Inserts or updates cached thread metadata.
   *
   * @param threads Thread summaries.
   *
   * @returns Promise resolved when the write completes.
   */
  async upsertThreadIndex(threads: CachedThreadSummary[]): Promise<void> {
    await upsertThreadIndex(this.database, threads);
  }

  /**
   * Updates a user-defined thread title.
   *
   * @param threadId Thread identifier.
   * @param title Custom title.
   *
   * @returns Promise resolved when the update completes.
   */
  async updateThreadTitle(threadId: string, title: string): Promise<void> {
    await updateThreadTitle(this.database, threadId, title);
  }

  /**
   * Updates a Codex-generated thread title.
   *
   * @param threadId Thread identifier.
   * @param title Codex title.
   *
   * @returns Promise resolved when the update completes.
   */
  async updateThreadCodexTitle(threadId: string, title: string): Promise<void> {
    await updateThreadCodexTitle(this.database, threadId, title);
  }

  /**
   * Deletes a cached thread.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved when deletion completes.
   */
  async deleteThread(threadId: string): Promise<void> {
    await deleteThread(this.database, threadId);
  }

  /**
   * Deletes empty never-synced thread shells for one project.
   *
   * @param currentProjectPath Project path to clean.
   * @param sourceId Optional source identifier.
   *
   * @returns Number of deleted thread rows.
   */
  async deleteEmptyUnsyncedThreads(
    currentProjectPath: string,
    sourceId?: string | null
  ): Promise<number> {
    return await deleteEmptyUnsyncedThreads(this.database, currentProjectPath, sourceId);
  }

  /**
   * Lists cached threads.
   *
   * @param query Thread list query.
   *
   * @returns Cached thread summaries.
   */
  async listThreads(query: ThreadListCacheQuery): Promise<CachedThreadSummary[]> {
    return await listThreads(this.database, query);
  }

  /**
   * Reads a cached thread snapshot.
   *
   * @param threadId Thread identifier.
   * @param options Read options.
   *
   * @returns Cached snapshot, or `null`.
   */
  async getThread(
    threadId: string,
    options: CachedThreadReadOptions = {}
  ): Promise<CachedThreadSnapshot | null> {
    return await getThread(this.database, threadId, options);
  }

  /**
   * Reads older cached turns.
   *
   * @param query Older-turn query.
   *
   * @returns Older turns and pagination state.
   */
  async getOlderTurns(query: CachedOlderTurnsQuery): Promise<CachedOlderTurnsResult> {
    return await getOlderTurns(this.database, query);
  }

  /**
   * Saves a full thread snapshot.
   *
   * @param snapshot Thread snapshot.
   *
   * @returns Promise resolved when save completes.
   */
  async saveThreadSnapshot(snapshot: CachedThreadSnapshot): Promise<void> {
    await saveThreadSnapshot(this.database, snapshot);
  }

  /**
   * Saves an incremental thread delta.
   *
   * @param delta Thread delta.
   *
   * @returns Promise resolved when save completes.
   */
  async saveThreadDelta(delta: CachedThreadDelta): Promise<void> {
    await saveThreadDelta(this.database, delta);
  }

  /**
   * Saves the latest known thread token usage.
   *
   * @param usage Token usage snapshot.
   *
   * @returns Promise resolved when save completes.
   */
  async saveThreadTokenUsage(usage: CachedThreadTokenUsage): Promise<void> {
    await saveThreadTokenUsage(this.database, usage);
  }

  /**
   * Reads cached thread synchronization state.
   *
   * @param threadId Thread identifier.
   *
   * @returns Sync state, or `null`.
   */
  async getSyncState(threadId: string): Promise<CachedThreadSyncState | null> {
    return await getSyncState(this.database, threadId);
  }

  /**
   * Flushes WAL state and closes the database.
   *
   * @returns Promise resolved when the database is closed.
   */
  async close(): Promise<void> {
    this.database.pragma("wal_checkpoint(TRUNCATE)");
    this.database.close();
  }
}
