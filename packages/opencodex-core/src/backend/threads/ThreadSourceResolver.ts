import type { ThreadTurnCache } from "../../ThreadTurnCache.js";
import type { ThreadCacheService } from "./ThreadCacheService.js";

/** Dependencies used to resolve and persist thread source associations. */
export type ThreadSourceResolverOptions = {
  /** In-memory thread metadata and source associations. */
  threadTurnCache: ThreadTurnCache;
  /** SQLite-backed thread metadata operations used for source recovery. */
  threadCacheService: Pick<ThreadCacheService, "readSnapshot" | "writeIndex">;
};

/** Resolves Codex source ownership for cached threads. */
export class ThreadSourceResolver {
  /** Cache and persistence dependencies used for source resolution. */
  private readonly options: ThreadSourceResolverOptions;

  /** Creates a thread source resolver. */
  constructor(options: ThreadSourceResolverOptions) {
    this.options = options;
  }

  /**
   * Resolves the source that owns a thread.
   *
   * In-memory metadata takes precedence over the SQLite snapshot. The fallback
   * is used only when neither cache contains a source, and is persisted when a
   * cached thread exists.
   *
   * @param threadId Thread identifier.
   * @param fallbackSourceId Optional source supplied by the current request.
   * @returns Source identifier, or `null` when no source is known.
   */
  async resolveThreadSourceId(
    threadId: string,
    fallbackSourceId: string | null = null
  ): Promise<string | null> {
    const cacheEntry = this.options.threadTurnCache.get(threadId);

    if (cacheEntry?.thread.sourceId !== null && cacheEntry?.thread.sourceId !== undefined) {
      return cacheEntry.thread.sourceId;
    }

    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    const cachedSourceId = cachedSnapshot?.thread.sourceId ?? null;

    if (cachedSourceId !== null) {
      return cachedSourceId;
    }

    if (fallbackSourceId === null) {
      return null;
    }

    await this.repairThreadSourceId(threadId, fallbackSourceId);
    return fallbackSourceId;
  }

  /**
   * Persists a recovered source association for an existing cached thread.
   *
   * An in-memory entry is updated before its index is written. When memory has
   * no entry, the SQLite snapshot is used as the metadata to re-index. Missing
   * threads are intentionally ignored because this method does not materialize
   * thread metadata by itself.
   *
   * @param threadId Thread identifier.
   * @param sourceId Source identifier to attach.
   * @returns Promise resolved when the cache write completes.
   */
  async repairThreadSourceId(threadId: string, sourceId: string): Promise<void> {
    const cacheEntry = this.options.threadTurnCache.get(threadId);

    if (cacheEntry !== null) {
      cacheEntry.thread = {
        ...cacheEntry.thread,
        sourceId
      };
      await this.options.threadCacheService.writeIndex([cacheEntry.thread]);
      return;
    }

    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);

    if (cachedSnapshot === null) {
      return;
    }

    await this.options.threadCacheService.writeIndex([
      {
        ...cachedSnapshot.thread,
        sourceId
      }
    ]);
  }
}
