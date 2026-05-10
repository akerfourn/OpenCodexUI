import type {
  CachedThreadSnapshot,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexThread,
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

export class ThreadCacheService {
  constructor(private readonly options: ThreadCacheServiceOptions) {}

  async readThreads(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId?: string | null,
    searchTerm?: string
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
        searchTerm
      });
      return threads.map((thread) => toOpenCodexThread(thread));
    } catch (error) {
      this.log(`thread cache read failed: ${String(error)}`);
      return [];
    }
  }

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

  readTurns(cacheEntry: ThreadTurnCacheEntry): OpenCodexTurn[] {
    return mapTurnsToOpenCodexTurns(
      cacheEntry.thread.id,
      this.options.threadTurnCache.toTurns(cacheEntry),
      this.options.getSettings().language
    );
  }

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

  private log(message: string): void {
    this.options.backendOptions.logger?.(message);
  }
}
