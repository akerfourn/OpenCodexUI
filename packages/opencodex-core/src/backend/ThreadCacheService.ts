import type {
  CachedThreadSnapshot,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexThread,
  OpenCodexThreadTokenUsage,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import { mapTurnsToOpenCodexTurns } from "../mapping.js";
import { ThreadTurnCache, type ThreadTurnCacheEntry } from "../ThreadTurnCache.js";
import type { OpenCodexBackendOptions } from "../types.js";
import {
  THREAD_INITIAL_CACHED_TURNS,
  THREAD_TURNS_PAGE_SIZE
} from "./constants.js";
import {
  createCacheOlderCursor,
  readCacheOlderCursor,
  readOldestTurnId,
  toCachedThreadDelta,
  toCachedThreadSnapshot,
  toCachedThreadSummary,
  toOpenCodexThread
} from "./threadCacheMapping.js";
import type { OpenCodexThreadWithProjectState } from "./threadTypes.js";

export type ThreadCacheServiceOptions = {
  backendOptions: OpenCodexBackendOptions;
  cacheRepository: OpenCodexCacheRepository | null;
  threadTurnCache: ThreadTurnCache;
  getSettings(): OpenCodexSettings;
  emit(event: OpenCodexEvent): void;
};

/**
 * Reads and writes cached thread metadata and turn snapshots.
 */
export class ThreadCacheService {
  constructor(private readonly options: ThreadCacheServiceOptions) {}

  /**
   * Reads thread metadata from SQLite.
   *
   * @param scope Thread list scope.
   * @param projectPath Project path used for current-project lists.
   * @param sourceId Optional source filter.
   * @param searchTerm Optional search text.
   *
   * @returns Cached thread metadata.
   */
  async readThreads(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId?: string | null,
    searchTerm?: string,
    isArchived = false
  ): Promise<OpenCodexThread[]> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return [];
    }

    try {
      const threads = await repository.listThreads({
        scope,
        currentProjectPath: projectPath,
        sourceId,
        searchTerm,
        isArchived
      });
      return threads.map((thread) => toOpenCodexThread(thread));
    } catch (error) {
      this.log(`thread cache read failed: ${String(error)}`);
      return [];
    }
  }

  /**
   * Deletes empty never-synced cached thread shells for one project.
   *
   * @param projectPath Project path to clean.
   * @param sourceId Optional source identifier.
   *
   * @returns Promise resolved once cleanup completes.
   */
  async deleteEmptyUnsyncedThreads(
    projectPath: string | null,
    sourceId?: string | null
  ): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null || projectPath === null) {
      return;
    }

    try {
      const deletedCount = await repository.deleteEmptyUnsyncedThreads(projectPath, sourceId);

      if (deletedCount > 0) {
        this.log(`deleted ${deletedCount} empty unsynced cached thread(s) for ${projectPath}`);
      }
    } catch (error) {
      this.log(`empty thread cache cleanup failed: ${String(error)}`);
    }
  }

  /**
   * Reads a cached thread snapshot.
   *
   * @param threadId Thread identifier.
   *
   * @returns Cached snapshot, or `null` when unavailable.
   */
  async readSnapshot(threadId: string): Promise<CachedThreadSnapshot | null> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return null;
    }

    try {
      return await repository.getThread(threadId, {
        latestTurnLimit: THREAD_INITIAL_CACHED_TURNS
      });
    } catch (error) {
      this.log(`thread cache snapshot read failed: ${String(error)}`);
      return null;
    }
  }

  /**
   * Converts cached raw turns to UI turns.
   *
   * @param cacheEntry In-memory cache entry.
   *
   * @returns UI turn collection.
   */
  readTurns(cacheEntry: ThreadTurnCacheEntry): OpenCodexTurn[] {
    return mapTurnsToOpenCodexTurns(
      cacheEntry.thread.id,
      this.options.threadTurnCache.toTurns(cacheEntry),
      this.options.getSettings().language
    );
  }

  /**
   * Loads older cached turns before the provided cursor.
   *
   * @param cacheEntry In-memory cache entry.
   * @param cursor Cache older-turn cursor.
   *
   * @returns Older turn result, or `null` when cache cannot serve it.
   */
  async loadOlderTurns(
    cacheEntry: ThreadTurnCacheEntry,
    cursor: string
  ): Promise<{ turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean } | null> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return null;
    }

    const beforeTurnId = readCacheOlderCursor(cursor);

    if (beforeTurnId.length === 0) {
      return null;
    }

    try {
      const result = await repository.getOlderTurns({
        threadId: cacheEntry.thread.id,
        beforeTurnId,
        limit: THREAD_TURNS_PAGE_SIZE
      });

      if (result.turns.length === 0) {
        cacheEntry.olderCursor = null;
        cacheEntry.hasLoadedAllOlderTurns = true;
        return { turns: [], hasMoreOlderMessages: false };
      }

      this.options.threadTurnCache.mergeOlderTurns(
        cacheEntry,
        result.turns,
        result.hasMoreOlderTurns ? createCacheOlderCursor(readOldestTurnId(result.turns)) : null
      );

      const turns = mapTurnsToOpenCodexTurns(
        cacheEntry.thread.id,
        result.turns,
        this.options.getSettings().language
      );
      const hasMoreOlderMessages = !cacheEntry.hasLoadedAllOlderTurns;

      this.options.emit({
        type: "thread.turns.prepended",
        threadId: cacheEntry.thread.id,
        turns,
        hasMoreOlderMessages
      });

      return { turns, hasMoreOlderMessages };
    } catch (error) {
      this.log(`thread cache older read failed: ${String(error)}`);
      return null;
    }
  }

  /**
   * Writes thread list metadata to SQLite.
   *
   * @param threads Thread metadata to index.
   *
   * @returns Promise resolved when the write attempt completes.
   */
  async writeIndex(threads: OpenCodexThreadWithProjectState[]): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null || threads.length === 0) {
      return;
    }

    try {
      await repository.upsertThreadIndex(threads.map((thread) => toCachedThreadSummary(thread)));
    } catch (error) {
      this.log(`thread cache index write failed: ${String(error)}`);
    }
  }

  /**
   * Writes a full thread snapshot to SQLite.
   *
   * @param cacheEntry In-memory cache entry to persist.
   *
   * @returns Promise resolved when the write attempt completes.
   */
  async writeSnapshot(cacheEntry: ThreadTurnCacheEntry): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return;
    }

    try {
      await repository.saveThreadSnapshot(toCachedThreadSnapshot(cacheEntry));
    } catch (error) {
      this.log(`thread cache snapshot write failed: ${String(error)}`);
    }
  }

  /**
   * Writes an incremental turn delta to SQLite.
   *
   * @param cacheEntry In-memory cache entry.
   * @param turns Raw turns to persist.
   *
   * @returns Promise resolved when the write attempt completes.
   */
  async writeDelta(cacheEntry: ThreadTurnCacheEntry, turns: unknown[]): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null || turns.length === 0) {
      return;
    }

    try {
      await repository.saveThreadDelta(toCachedThreadDelta(cacheEntry, turns));
    } catch (error) {
      this.log(`thread cache delta write failed: ${String(error)}`);
    }
  }

  /**
   * Writes a user-defined thread title.
   *
   * @param threadId Thread identifier.
   * @param title Custom title.
   *
   * @returns Promise resolved when the write attempt completes.
   */
  async writeTitle(threadId: string, title: string): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return;
    }

    try {
      await repository.updateThreadTitle(threadId, title);
    } catch (error) {
      this.log(`thread cache rename write failed: ${String(error)}`);
    }
  }

  /**
   * Writes the local archive marker for a thread.
   *
   * @param threadId Thread identifier.
   * @param isArchived Whether the thread is archived.
   *
   * @returns Promise resolved when the write attempt completes.
   */
  async writeArchiveState(threadId: string, isArchived: boolean): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return;
    }

    try {
      await repository.updateThreadArchiveState(threadId, isArchived);
    } catch (error) {
      this.log(`thread cache archive write failed: ${String(error)}`);
    }
  }

  /**
   * Writes the latest Codex-generated thread title.
   *
   * @param threadId Thread identifier.
   * @param title Codex title.
   *
   * @returns Promise resolved when the write attempt completes.
   */
  async writeCodexTitle(threadId: string, title: string): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return;
    }

    try {
      await repository.updateThreadCodexTitle(threadId, title);
    } catch (error) {
      this.log(`thread cache codex title write failed: ${String(error)}`);
    }
  }

  /**
   * Writes the latest known token usage for a thread.
   *
   * @param usage Token usage snapshot.
   *
   * @returns Promise resolved when the write attempt completes.
   */
  async writeTokenUsage(usage: OpenCodexThreadTokenUsage): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return;
    }

    try {
      await repository.saveThreadTokenUsage(usage);
    } catch (error) {
      this.log(`thread token usage cache write failed: ${String(error)}`);
    }
  }

  /**
   * Deletes a cached thread.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved when the delete attempt completes.
   */
  async deleteThread(threadId: string): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return;
    }

    try {
      await repository.deleteThread(threadId);
    } catch (error) {
      this.log(`thread cache delete failed: ${String(error)}`);
    }
  }

  /**
   * Writes a cache diagnostic message through the backend logger.
   *
   * @param message Message to log.
   *
   * @returns Nothing.
   */
  private log(message: string): void {
    this.options.backendOptions.logger?.(message);
  }
}
