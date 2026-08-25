import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexThread,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ThreadTurnCache } from "../../ThreadTurnCache.js";
import type { OpenCodexBackendOptions } from "../../types.js";
import {
  THREAD_LIST_PAGE_SIZE,
  THREAD_MAIN_SOURCE_KINDS,
  type ThreadListParams
} from "../shared/constants.js";
import { readThreadPages } from "../shared/codexReaders.js";
import type { ThreadCacheService } from "./ThreadCacheService.js";
import { mergeFreshThreadList } from "./threadCacheMapping.js";
import { filterMainThreads } from "./threadHierarchy.js";
import type { ThreadCreationService } from "./ThreadCreationService.js";
import type {
  ClientPort,
  ProjectSourcePort,
  RuntimeEventPort
} from "../runtime/runtimePorts.js";

/** Dependencies required to list and mutate source-aware thread metadata. */
export type ThreadCatalogServiceOptions = {
  /** Backend project path used when a request omits its path. */
  backendOptions: Pick<OpenCodexBackendOptions, "projectPath">;
  /** In-memory thread metadata used by catalog mutations. */
  threadTurnCache: Pick<ThreadTurnCache, "get" | "getOrCreate" | "renameThread">;
  /** Cache operations used by catalog reads and mutations. */
  threadCacheService: Pick<
    ThreadCacheService,
    | "deleteEmptyUnsyncedThreads"
    | "readThreads"
    | "readSnapshot"
    | "writeIndex"
    | "deleteThread"
    | "writeArchiveState"
    | "writeTitle"
  >;
  /** Emits catalog events. */
  events: Pick<RuntimeEventPort, "emit">;
  /** Resolves Codex clients for catalog operations. */
  clients: Pick<ClientPort, "ensureClient">;
  /** Resolves sources and project metadata. */
  projects: Pick<
    ProjectSourcePort,
    "resolveSource" | "readCachedProjects"
  >;
  /** Performs the Codex-only portion of thread creation. */
  threadCreationService: Pick<ThreadCreationService, "create">;
};

/** Owns thread catalog reads, metadata mutations, and cache cleanup. */
export class ThreadCatalogService {
  /** Creates a thread catalog service. */
  constructor(private readonly options: ThreadCatalogServiceOptions) {}

  /**
   * Lists cached threads and refreshes source-backed lists from Codex.
   *
   * @param scope Thread list scope.
   * @param projectPath Current project path.
   * @param sourceId Source identifier, or `null` for cache-only reads.
   * @param searchTerm Optional search text.
   * @param isArchived Whether archived threads should be listed.
   * @returns Thread metadata collection.
   */
  async listThreads(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId: string | null,
    searchTerm?: string,
    isArchived = false
  ): Promise<OpenCodexThread[]> {
    const currentProjectPath = scope === "currentProject"
      ? this.resolveCurrentProjectPath(projectPath)
      : null;

    if (sourceId !== null) {
      await this.options.threadCacheService.deleteEmptyUnsyncedThreads(
        currentProjectPath,
        sourceId
      );
    }

    const cachedThreads = await this.options.threadCacheService.readThreads(
      scope,
      currentProjectPath,
      sourceId,
      searchTerm,
      isArchived
    ).then(filterMainThreads);

    if (cachedThreads.length > 0) {
      this.emitThreadsUpdated(cachedThreads, currentProjectPath, isArchived);
    }

    if (sourceId === null) {
      return cachedThreads;
    }

    const resolvedSource = await this.options.projects.resolveSource(sourceId);
    const client = await this.options.clients.ensureClient(resolvedSource.id);
    const params: ThreadListParams = {
      limit: THREAD_LIST_PAGE_SIZE,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: THREAD_MAIN_SOURCE_KINDS,
      archived: isArchived
    };
    const trimmedSearchTerm = searchTerm?.trim() ?? "";

    if (trimmedSearchTerm.length > 0) {
      params.searchTerm = trimmedSearchTerm;
    }

    if (scope === "currentProject" && currentProjectPath !== null) {
      params.cwd = currentProjectPath;
    }

    const threads = filterMainThreads(
      (await readThreadPages(client, params)).map((thread) => ({
        ...thread,
        isArchived,
        sourceId: resolvedSource.id
      }))
    );
    await this.options.threadCacheService.writeIndex(threads);

    const mergedThreads = await this.options.threadCacheService.readThreads(
      scope,
      currentProjectPath,
      resolvedSource.id,
      searchTerm,
      isArchived
    );
    const updatedThreads = mergeFreshThreadList(threads, mergedThreads);
    this.emitThreadsUpdated(updatedThreads, currentProjectPath, isArchived);
    this.options.events.emit({
      type: "projects.updated",
      projects: await this.options.projects.readCachedProjects()
    });

    return updatedThreads;
  }

  /**
   * Creates a thread and publishes its initial catalog entry.
   *
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @returns Created thread and empty initial turns.
   */
  async createThread(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    if (sourceId === null) {
      throw new Error("Cannot create a thread for a project without a Codex source.");
    }

    const resolvedSource = await this.options.projects.resolveSource(sourceId);
    const client = await this.options.clients.ensureClient(resolvedSource.id);
    const thread = await this.options.threadCreationService.create(
      client,
      projectPath,
      resolvedSource.id
    );
    const turns: OpenCodexTurn[] = [];

    this.options.threadTurnCache.getOrCreate(thread);
    this.options.events.emit({ type: "thread.created", thread, turns });
    await this.options.threadCacheService.writeIndex([thread]);
    return { thread, turns };
  }

  /**
   * Archives a Codex thread and updates the local cache marker.
   *
   * @param threadId Thread identifier.
   * @returns Successful archive result.
   */
  async archiveThread(threadId: string): Promise<{ ok: true }> {
    await this.setThreadArchiveState(threadId, true);
    return { ok: true };
  }

  /**
   * Restores an archived Codex thread and updates the local cache marker.
   *
   * @param threadId Thread identifier.
   * @returns Successful restore result.
   */
  async unarchiveThread(threadId: string): Promise<{ ok: true }> {
    await this.setThreadArchiveState(threadId, false);
    return { ok: true };
  }

  /**
   * Permanently deletes a Codex thread and its local cache entry.
   *
   * @param threadId Thread identifier.
   * @returns Successful deletion result.
   */
  async deleteThread(threadId: string): Promise<{ ok: true }> {
    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);

    if (cachedSnapshot === null || cachedSnapshot.thread.sourceId === null) {
      throw new Error("Cannot delete a thread without a Codex source.");
    }

    const client = await this.options.clients.ensureClient(cachedSnapshot.thread.sourceId);
    await client.deleteThread(threadId);
    await this.forgetDeletedThread(threadId, cachedSnapshot.thread.sourceId);

    return { ok: true };
  }

  /**
   * Removes a deleted thread from cache and emits its deletion event.
   *
   * @param threadId Deleted thread identifier.
   * @param sourceId Source identifier from the live deletion, or `null`.
   * @returns Promise resolved after local cleanup.
   */
  async forgetDeletedThread(threadId: string, sourceId: string | null = null): Promise<void> {
    await this.removeCachedThread(threadId);
    this.options.events.emit({ type: "thread.deleted", sourceId, threadId });
  }

  /**
   * Removes a cached thread without emitting `thread.deleted`.
   *
   * @param threadId Thread identifier.
   * @returns Promise resolved after local cleanup.
   */
  async removeCachedThread(threadId: string): Promise<void> {
    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    const projectPath = this.resolveCurrentProjectPath(cachedSnapshot?.thread.projectPath ?? null);

    await this.options.threadCacheService.deleteThread(threadId);

    const cachedThreads = await this.options.threadCacheService.readThreads(
      "currentProject",
      projectPath,
      cachedSnapshot?.thread.sourceId ?? null
    );
    this.emitThreadsUpdated(cachedThreads, projectPath, false);
  }

  /**
   * Updates the locally selected composer settings for a thread.
   *
   * @param threadId Thread identifier.
   * @param model Selected model identifier.
   * @param reasoningEffort Selected reasoning effort.
   * @returns Promise resolved when settings are stored.
   */
  async updateThreadComposerSettings(
    threadId: string,
    model: string | null,
    reasoningEffort: OpenCodexThread["reasoningEffort"]
  ): Promise<void> {
    const memoryEntry = this.options.threadTurnCache.get(threadId);
    const cachedSnapshot = memoryEntry === null
      ? await this.options.threadCacheService.readSnapshot(threadId)
      : null;
    const currentThread = memoryEntry?.thread ?? cachedSnapshot?.thread ?? null;

    if (currentThread === null) {
      return;
    }

    const thread = {
      ...currentThread,
      model,
      reasoningEffort
    };

    if (memoryEntry !== null) {
      memoryEntry.thread = thread;
    }

    await this.options.threadCacheService.writeIndex([thread]);
  }

  /**
   * Renames a thread in Codex and cache.
   *
   * @param threadId Thread identifier.
   * @param name New title.
   * @returns Promise resolved when rename completes.
   */
  async renameThread(threadId: string, name: string): Promise<void> {
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      return;
    }

    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);
    if (cachedSnapshot === null || cachedSnapshot.thread.sourceId === null) {
      throw new Error("Cannot rename a thread without a Codex source.");
    }

    const client = await this.options.clients.ensureClient(cachedSnapshot.thread.sourceId);
    await client.renameThread(threadId, trimmedName);
    await this.options.threadCacheService.writeTitle(threadId, trimmedName);
    this.options.threadTurnCache.renameThread(threadId, trimmedName);
    this.options.events.emit({
      type: "thread.renamed",
      sourceId: cachedSnapshot.thread.sourceId,
      threadId,
      name: trimmedName
    });
  }

  /**
   * Archives or restores a thread in Codex and cache.
   *
   * @param threadId Thread identifier.
   * @param isArchived Desired archive state.
   * @returns Promise resolved after the state is persisted.
   */
  private async setThreadArchiveState(threadId: string, isArchived: boolean): Promise<void> {
    const cachedSnapshot = await this.options.threadCacheService.readSnapshot(threadId);

    if (cachedSnapshot === null || cachedSnapshot.thread.sourceId === null) {
      throw new Error("Cannot change archive state for a thread without a Codex source.");
    }

    const client = await this.options.clients.ensureClient(cachedSnapshot.thread.sourceId);

    if (isArchived) {
      await client.archiveThread(threadId);
    } else {
      await client.unarchiveThread(threadId);
    }

    await this.options.threadCacheService.writeArchiveState(threadId, isArchived);
  }

  /**
   * Resolves a project path with the backend fallback.
   *
   * @param projectPath Project path candidate.
   * @returns Normalized project path, or `null`.
   */
  private resolveCurrentProjectPath(projectPath: string | null): string | null {
    return normalizeProjectPath(projectPath)
      ?? normalizeProjectPath(this.options.backendOptions.projectPath);
  }

  /**
   * Emits refreshed thread metadata.
   *
   * @param threads Thread metadata collection.
   * @param projectPath Project filter path, or `null`.
   * @param isArchived Whether the list represents archived threads.
   * @returns Nothing.
   */
  private emitThreadsUpdated(
    threads: OpenCodexThread[],
    projectPath: string | null,
    isArchived: boolean
  ): void {
    this.options.events.emit({
      type: "threads.updated",
      threads,
      currentProjectFilterAvailable: projectPath !== null,
      projectPath,
      archived: isArchived
    });
  }
}
