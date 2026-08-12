/**
 * Provides SQLite-backed thread and usage cache operations.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedOlderTurnsQuery,
  CachedOlderTurnsResult,
  CachedProjectTokenUsageStatistics,
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
  ThreadListCacheQuery
} from "../../types.js";
import type { ThreadCacheRepository } from "../../types/repositoryThreads.js";
import {
  deleteEmptyUnsyncedThreads,
  deleteThread,
  getOlderTurns,
  getProjectTokenUsageStatistics,
  getSyncState,
  getThread,
  listThreads,
  saveThreadDelta,
  saveThreadSnapshot,
  saveThreadTokenUsage,
  updateThreadArchiveState,
  updateThreadCodexTitle,
  updateThreadTitle,
  upsertThreadIndex
} from "../threadQueries.js";
import {
  insertTokenUsageSnapshot,
  listSourceTokenUsageSnapshots,
  listTokenUsageSnapshots,
  saveThreadTokenUsageAndSnapshot,
  upsertTurnExecutionMetadata
} from "../tokenUsageQueries.js";
import {
  insertUsageRateLimitSnapshot,
  listUsageRateLimitSnapshots
} from "../usageRateLimitQueries.js";

/**
 * Implements thread and usage cache persistence with an SQLite database.
 */
export class SqliteThreadCacheRepository implements ThreadCacheRepository {
  /** SQLite database connection used by all repository operations. */
  private readonly database: BetterSqliteDatabase;

  /**
   * Creates a thread cache repository for an open SQLite database.
   *
   * @param database SQLite database connection.
   */
  constructor(database: BetterSqliteDatabase) {
    this.database = database;
  }

  /**
   * Inserts or updates cached thread metadata.
   *
   * @param threads Thread summaries.
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
   * @returns Promise resolved when the update completes.
   */
  async updateThreadTitle(threadId: string, title: string): Promise<void> {
    await updateThreadTitle(this.database, threadId, title);
  }

  /**
   * Updates the local archive marker for a cached thread.
   *
   * @param threadId Thread identifier.
   * @param isArchived Whether the thread is archived.
   * @returns Promise resolved when the update completes.
   */
  async updateThreadArchiveState(threadId: string, isArchived: boolean): Promise<void> {
    await updateThreadArchiveState(this.database, threadId, isArchived);
  }

  /**
   * Updates a Codex-generated thread title.
   *
   * @param threadId Thread identifier.
   * @param title Codex title.
   * @returns Promise resolved when the update completes.
   */
  async updateThreadCodexTitle(threadId: string, title: string): Promise<void> {
    await updateThreadCodexTitle(this.database, threadId, title);
  }

  /**
   * Deletes a cached thread.
   *
   * @param threadId Thread identifier.
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
   * @returns Cached thread summaries.
   */
  async listThreads(query: ThreadListCacheQuery): Promise<CachedThreadSummary[]> {
    return await listThreads(this.database, query);
  }

  /**
   * Aggregates token usage for one cached project.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier, or `null` for an orphan project.
   * @returns Aggregated cached token usage.
   */
  async getProjectTokenUsageStatistics(
    projectPath: string,
    sourceId: string | null
  ): Promise<CachedProjectTokenUsageStatistics> {
    return await getProjectTokenUsageStatistics(this.database, projectPath, sourceId);
  }

  /**
   * Reads a cached thread snapshot.
   *
   * @param threadId Thread identifier.
   * @param options Read options.
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
   * @returns Older turns and pagination state.
   */
  async getOlderTurns(query: CachedOlderTurnsQuery): Promise<CachedOlderTurnsResult> {
    return await getOlderTurns(this.database, query);
  }

  /**
   * Saves a full thread snapshot.
   *
   * @param snapshot Thread snapshot.
   * @returns Promise resolved when save completes.
   */
  async saveThreadSnapshot(snapshot: CachedThreadSnapshot): Promise<void> {
    await saveThreadSnapshot(this.database, snapshot);
  }

  /**
   * Saves an incremental thread delta.
   *
   * @param delta Thread delta.
   * @returns Promise resolved when save completes.
   */
  async saveThreadDelta(delta: CachedThreadDelta): Promise<void> {
    await saveThreadDelta(this.database, delta);
  }

  /**
   * Saves the latest known thread token usage.
   *
   * @param usage Token usage snapshot.
   * @returns Promise resolved when save completes.
   */
  async saveThreadTokenUsage(
    usage: CachedThreadTokenUsage,
    sourceId: string | null = null
  ): Promise<void> {
    await saveThreadTokenUsage(this.database, usage, sourceId);
  }

  /**
   * Stores one token usage snapshot when its values changed.
   * Repeated values for the same source, thread, and turn are ignored.
   *
   * @param snapshot Token usage snapshot.
   * @returns Promise resolved when the write completes.
   */
  async saveThreadTokenUsageSnapshot(snapshot: CachedThreadTokenUsageSnapshot): Promise<void> {
    insertTokenUsageSnapshot(this.database, snapshot);
  }

  /**
   * Saves the latest token usage and one distinct history snapshot atomically.
   *
   * @param usage Latest usage values for the thread.
   * @param snapshot Immutable history snapshot.
   * @returns Promise resolved when the write completes.
   */
  async saveThreadTokenUsageAndSnapshot(
    usage: CachedThreadTokenUsage,
    snapshot: CachedThreadTokenUsageSnapshot
  ): Promise<void> {
    saveThreadTokenUsageAndSnapshot(this.database, usage, snapshot);
  }

  /**
   * Reads historical token usage snapshots for one thread.
   *
   * @param query Snapshot query.
   * @returns Snapshots ordered from oldest to newest.
   */
  async listThreadTokenUsageSnapshots(
    query: CachedThreadTokenUsageSnapshotQuery
  ): Promise<CachedThreadTokenUsageSnapshot[]> {
    return listTokenUsageSnapshots(this.database, query);
  }

  /**
   * Reads source-wide token usage snapshots with one baseline per thread.
   *
   * @param query Source-wide snapshot query.
   * @returns Baselines and in-range snapshots ordered from oldest to newest.
   */
  async listSourceTokenUsageSnapshots(
    query: CachedSourceTokenUsageSnapshotQuery
  ): Promise<CachedThreadTokenUsageSnapshot[]> {
    return listSourceTokenUsageSnapshots(this.database, query);
  }

  /**
   * Stores one source-scoped rate-limit snapshot when its values changed.
   *
   * @param snapshot Rate-limit snapshot.
   * @returns Promise resolved when the write completes.
   */
  async saveUsageRateLimitSnapshot(snapshot: CachedUsageRateLimitSnapshot): Promise<void> {
    insertUsageRateLimitSnapshot(this.database, snapshot);
  }

  /**
   * Reads historical source-scoped rate-limit snapshots.
   *
   * @param query Snapshot query.
   * @returns Snapshots ordered from oldest to newest.
   */
  async listUsageRateLimitSnapshots(
    query: CachedUsageRateLimitSnapshotQuery
  ): Promise<CachedUsageRateLimitSnapshot[]> {
    return listUsageRateLimitSnapshots(this.database, query);
  }

  /**
   * Upserts execution metadata for one turn.
   *
   * @param metadata Turn execution metadata.
   * @returns Promise resolved when the write completes.
   */
  async saveTurnExecutionMetadata(metadata: CachedTurnExecutionMetadata): Promise<void> {
    upsertTurnExecutionMetadata(this.database, metadata);
  }

  /**
   * Reads cached thread synchronization state.
   *
   * @param threadId Thread identifier.
   * @returns Sync state, or `null`.
   */
  async getSyncState(threadId: string): Promise<CachedThreadSyncState | null> {
    return await getSyncState(this.database, threadId);
  }
}
