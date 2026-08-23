import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import { mapThread } from "../mapping.js";
import type { ThreadTurnCache } from "../ThreadTurnCache.js";
import type { CollaborationService } from "./CollaborationService.js";
import {
  THREAD_LIST_PAGE_SIZE,
  THREAD_SUB_AGENT_SOURCE_KINDS
} from "./constants.js";
import { readThreadPages } from "./codexReaders.js";
import type { ThreadCacheService } from "./ThreadCacheService.js";
import { filterDescendantThreads } from "./threadHierarchy.js";
import { withSourceId } from "./threadCacheMapping.js";
import type {
  ClientPort,
  RuntimeEventPort
} from "./runtime/runtimePorts.js";

/** Dependencies needed to read and discover source-aware thread descendants. */
export type ThreadHierarchyServiceOptions = {
  /** Resolves the Codex client for an explicitly selected source. */
  clients: Pick<ClientPort, "ensureClient">;
  /** Reads cached thread indexes and persists discovered metadata. */
  threadCacheService: Pick<ThreadCacheService, "readThreads" | "writeIndex">;
  /** Stores discovered thread metadata in the shared in-memory cache. */
  threadTurnCache: Pick<ThreadTurnCache, "getOrCreate">;
  /** Reconciles structural descendants with collaboration history. */
  collaborationService: Pick<CollaborationService, "reconcileDescendantThreads">;
  /** Emits discovery events for newly announced descendants. */
  events: Pick<RuntimeEventPort, "emit">;
};

/** Owns cached and online sub-agent hierarchy reads and discovery. */
export class ThreadHierarchyService {
  /** Service ports used by hierarchy operations. */
  private readonly options: ThreadHierarchyServiceOptions;

  /** Creates a thread hierarchy service from narrow runtime ports. */
  constructor(options: ThreadHierarchyServiceOptions) {
    this.options = options;
  }

  /**
   * Lists descendants from cache and, when available, the source's Codex client.
   *
   * @param parentThreadId Root thread identifier.
   * @param sourceId Owning source, or `null` for orphan cache data.
   * @returns Descendant thread metadata.
   */
  async listDescendants(
    parentThreadId: string,
    sourceId: string | null
  ): Promise<OpenCodexThread[]> {
    const cachedThreads = await this.readCachedDescendants(parentThreadId, sourceId);

    if (sourceId === null) {
      return cachedThreads;
    }

    try {
      const client = await this.options.clients.ensureClient(sourceId);
      const threads = (await readThreadPages(client, {
        limit: THREAD_LIST_PAGE_SIZE,
        sortKey: "updated_at",
        sortDirection: "desc",
        sourceKinds: THREAD_SUB_AGENT_SOURCE_KINDS,
        ancestorThreadId: parentThreadId
      })).map((thread) => withSourceId(thread, sourceId));

      await this.options.threadCacheService.writeIndex(threads);
      await this.options.collaborationService.reconcileDescendantThreads(
        sourceId,
        parentThreadId,
        threads
      );
      return threads;
    } catch (error) {
      if (cachedThreads.length > 0) {
        return cachedThreads;
      }

      throw error;
    }
  }

  /**
   * Records a sub-agent announced by a `thread/started` notification.
   *
   * @param value Raw thread payload from the notification.
   * @param sourceId Source that owns the notification.
   * @returns Promise resolved after discovery persistence.
   */
  async recordStarted(value: unknown, sourceId: string): Promise<void> {
    const thread = withSourceId(mapThread(value), sourceId);

    if (thread.id.length === 0 || thread.parentThreadId === null) {
      return;
    }

    this.options.threadTurnCache.getOrCreate(thread);
    this.options.events.emit({ type: "thread.discovered", thread });
    await this.options.threadCacheService.writeIndex([thread]);
  }

  /**
   * Reads active and archived cached descendants for fallback or orphan reads.
   *
   * @param parentThreadId Root thread identifier.
   * @param sourceId Source filter, including `null` for orphan rows.
   * @returns Structurally reachable cached descendants in cache order.
   */
  private async readCachedDescendants(
    parentThreadId: string,
    sourceId: string | null
  ): Promise<OpenCodexThread[]> {
    const [activeThreads, archivedThreads] = await Promise.all([
      this.options.threadCacheService.readThreads("all", null, sourceId, undefined, false),
      this.options.threadCacheService.readThreads("all", null, sourceId, undefined, true)
    ]);
    const uniqueThreads = new Map<string, OpenCodexThread>();

    for (const thread of [...activeThreads, ...archivedThreads]) {
      uniqueThreads.set(thread.id, thread);
    }

    return filterDescendantThreads(parentThreadId, Array.from(uniqueThreads.values()));
  }
}
