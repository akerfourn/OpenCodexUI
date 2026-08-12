import type {
  CachedOlderTurnsQuery,
  CachedOlderTurnsResult,
  CachedThreadDelta,
  CachedThreadReadOptions,
  CachedThreadSnapshot,
  CachedThreadSummary,
  CachedThreadSyncState,
  ThreadListCacheQuery
} from "./threads.js";
import type {
  CachedProjectTokenUsageStatistics,
  CachedSourceTokenUsageSnapshotQuery,
  CachedThreadTokenUsage,
  CachedThreadTokenUsageSnapshot,
  CachedThreadTokenUsageSnapshotQuery,
  CachedTurnExecutionMetadata,
  CachedUsageRateLimitSnapshot,
  CachedUsageRateLimitSnapshotQuery
} from "./usage.js";

/**
 * Describes thread and usage persistence operations.
 */
export interface ThreadCacheRepository {
  /**
   * Inserts or updates thread index summaries.
   *
   * @param threads Thread summaries reported by a source.
   * @returns Promise resolved when the write completes.
   */
  upsertThreadIndex(threads: CachedThreadSummary[]): Promise<void>;

  /**
   * Updates the user-defined title for a thread.
   *
   * @param threadId Thread identifier.
   * @param title Custom title.
   * @returns Promise resolved when the update completes.
   */
  updateThreadTitle(threadId: string, title: string): Promise<void>;

  /**
   * Updates the local archive marker for a cached thread.
   *
   * @param threadId Thread identifier.
   * @param isArchived Whether the thread is archived.
   * @returns Promise resolved when the update completes.
   */
  updateThreadArchiveState(threadId: string, isArchived: boolean): Promise<void>;

  /**
   * Updates the Codex-generated title for a thread.
   *
   * @param threadId Thread identifier.
   * @param title Codex title.
   * @returns Promise resolved when the update completes.
   */
  updateThreadCodexTitle(threadId: string, title: string): Promise<void>;

  /**
   * Deletes a cached thread and its cached turns.
   *
   * @param threadId Thread identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteThread(threadId: string): Promise<void>;

  /**
   * Deletes empty, never-synced cached thread shells for one project.
   *
   * @param currentProjectPath Project path to clean.
   * @param sourceId Optional source identifier.
   * @returns Number of deleted thread rows.
   */
  deleteEmptyUnsyncedThreads(
    currentProjectPath: string,
    sourceId?: string | null
  ): Promise<number>;

  /**
   * Lists cached thread summaries for a scope and optional filters.
   *
   * @param query Thread list query.
   * @returns Matching cached thread summaries.
   */
  listThreads(query: ThreadListCacheQuery): Promise<CachedThreadSummary[]>;

  /**
   * Aggregates token usage for one source-owned project.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier, or `null` for an orphan project.
   * @returns Aggregated cached token usage.
   */
  getProjectTokenUsageStatistics(
    projectPath: string,
    sourceId: string | null
  ): Promise<CachedProjectTokenUsageStatistics>;

  /**
   * Reads a cached thread snapshot.
   *
   * @param threadId Thread identifier.
   * @param options Optional read limits.
   * @returns Cached snapshot, or `null` when the thread is unknown.
   */
  getThread(threadId: string, options?: CachedThreadReadOptions): Promise<CachedThreadSnapshot | null>;

  /**
   * Reads a page of older cached turns for a thread.
   *
   * @param query Older-turn query.
   * @returns Older turns and pagination state.
   */
  getOlderTurns(query: CachedOlderTurnsQuery): Promise<CachedOlderTurnsResult>;

  /**
   * Saves a complete thread snapshot transactionally.
   *
   * @param snapshot Thread snapshot.
   * @returns Promise resolved when the snapshot is saved.
   */
  saveThreadSnapshot(snapshot: CachedThreadSnapshot): Promise<void>;

  /**
   * Saves incremental thread turns and sync metadata.
   *
   * @param delta Thread delta.
   * @returns Promise resolved when the delta is saved.
   */
  saveThreadDelta(delta: CachedThreadDelta): Promise<void>;

  /**
   * Reads synchronization metadata for a cached thread.
   *
   * @param threadId Thread identifier.
   * @returns Sync state, or `null` when the thread is unknown.
   */
  getSyncState(threadId: string): Promise<CachedThreadSyncState | null>;

  /**
   * Persists the latest known token usage for a cached thread.
   *
   * @param usage Thread token usage snapshot.
   * @returns Promise resolved when the write completes.
   */
  saveThreadTokenUsage(usage: CachedThreadTokenUsage, sourceId?: string | null): Promise<void>;

  /**
   * Stores one immutable token usage snapshot when its values changed.
   * Repeated values for the same source, thread, and turn are ignored.
   *
   * @param snapshot Token usage snapshot.
   *
   * @returns Promise resolved when the write completes.
   */
  saveThreadTokenUsageSnapshot(snapshot: CachedThreadTokenUsageSnapshot): Promise<void>;

  /**
   * Saves the latest token usage and a distinct history snapshot atomically.
   *
   * @param usage Latest usage values for the thread.
   * @param snapshot Immutable history snapshot.
   * @returns Promise resolved when the write completes.
   */
  saveThreadTokenUsageAndSnapshot(
    usage: CachedThreadTokenUsage,
    snapshot: CachedThreadTokenUsageSnapshot
  ): Promise<void>;

  /**
   * Reads historical token usage snapshots for one thread.
   *
   * @param query Snapshot query.
   * @returns Snapshots ordered from oldest to newest.
   */
  listThreadTokenUsageSnapshots(
    query: CachedThreadTokenUsageSnapshotQuery
  ): Promise<CachedThreadTokenUsageSnapshot[]>;

  /**
   * Reads source-wide token usage snapshots with one baseline per thread.
   *
   * @param query Snapshot query.
   * @returns Baselines and in-range snapshots ordered from oldest to newest.
   */
  listSourceTokenUsageSnapshots(
    query: CachedSourceTokenUsageSnapshotQuery
  ): Promise<CachedThreadTokenUsageSnapshot[]>;

  /**
   * Stores one source-scoped rate-limit snapshot when its effective values changed.
   *
   * @param snapshot Rate-limit snapshot to persist.
   * @returns Promise resolved when the write completes.
   */
  saveUsageRateLimitSnapshot(snapshot: CachedUsageRateLimitSnapshot): Promise<void>;

  /**
   * Reads historical source-scoped rate-limit snapshots.
   *
   * @param query Snapshot query.
   * @returns Snapshots ordered from oldest to newest.
   */
  listUsageRateLimitSnapshots(
    query: CachedUsageRateLimitSnapshotQuery
  ): Promise<CachedUsageRateLimitSnapshot[]>;

  /**
   * Upserts execution metadata for one turn.
   *
   * @param metadata Turn execution metadata.
   * @returns Promise resolved when the write completes.
   */
  saveTurnExecutionMetadata(metadata: CachedTurnExecutionMetadata): Promise<void>;
}
