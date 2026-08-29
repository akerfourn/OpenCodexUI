import type { CodexNotification } from "@open-codex-ui/codex-rpc";

import type {
  OpenCodexComposerReference,
  OpenCodexImageAttachment,
  OpenCodexReasoningEffort,
  OpenCodexThread,
  OpenCodexThreadGoal,
  OpenCodexThreadGoalPatch,
  OpenCodexThreadRuntimeStatus,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import { ThreadTurnCache } from "../../ThreadTurnCache.js";
import type { OpenCodexBackendOptions } from "../../types.js";
import {
  recordLiveNotification,
  shouldPersistLiveNotification
} from "./liveTurnNotifications.js";
import { ThreadCacheService } from "./ThreadCacheService.js";
import { ThreadCatalogService } from "./ThreadCatalogService.js";
import { ThreadCreationService } from "./ThreadCreationService.js";
import { ThreadHierarchyService } from "./ThreadHierarchyService.js";
import { ThreadGoalService } from "./ThreadGoalService.js";
import { ThreadReadService } from "./ThreadReadService.js";
import { ThreadSourceResolver } from "./ThreadSourceResolver.js";
import { ThreadTurnPageLoader } from "./ThreadTurnPageLoader.js";
import { ThreadTurnSyncService } from "./ThreadTurnSyncService.js";
import { ThreadTurnActionsService } from "./ThreadTurnActionsService.js";
import type {
  ClientPort,
  ProjectSourcePort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "../runtime/runtimePorts.js";
import type { CollaborationService } from "../collaboration/CollaborationService.js";

export type ThreadConversationServiceOptions = {
  backendOptions: OpenCodexBackendOptions;
  threadTurnCache: ThreadTurnCache;
  threadCacheService: ThreadCacheService;
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  events: Pick<RuntimeEventPort, "emit" | "recordClientRequest">;
  clients: Pick<ClientPort, "ensureClient">;
  projects: Pick<
    ProjectSourcePort,
    "resolveSource" | "cacheProject" | "readCachedProjects"
  >;
  collaborationService: Pick<
    CollaborationService,
    "reconcileTurns" | "reconcileDescendantThreads"
  >;
  handleClientError(error: Error): void;
};

/**
 * Coordinates Codex thread listing, loading, turns, and cache synchronization.
 */
export class ThreadConversationService {
  /** Resolves source ownership for thread operations. */
  private readonly threadSourceResolver: ThreadSourceResolver;

  /** Synchronizes source-backed latest turns and thread metadata. */
  private readonly threadTurnSyncService: ThreadTurnSyncService;

  /** Owns cache-first thread reads, opening, pagination, and recovery. */
  private readonly threadReadService: ThreadReadService;

  /** Owns thread catalog reads, metadata mutations, and cache cleanup. */
  private readonly threadCatalogService: ThreadCatalogService;

  /** Owns cached and online sub-agent hierarchy reads and discovery. */
  private readonly threadHierarchyService: ThreadHierarchyService;

  /** Executes source-aware Codex thread and turn actions. */
  private readonly threadTurnActionsService: ThreadTurnActionsService;

  /** Accesses native app-server goal state for source-owned threads. */
  private readonly threadGoalService: ThreadGoalService;

  /**
   * Creates a thread conversation service.
   *
   * @param options Cache, source, settings, event, and Codex client callbacks.
   */
  constructor(private readonly options: ThreadConversationServiceOptions) {
    this.threadSourceResolver = new ThreadSourceResolver({
      threadTurnCache: options.threadTurnCache,
      threadCacheService: options.threadCacheService
    });
    this.threadGoalService = new ThreadGoalService({
      sourceResolver: this.threadSourceResolver,
      clients: options.clients,
      events: options.events
    });
    this.threadHierarchyService = new ThreadHierarchyService({
      clients: options.clients,
      threadCacheService: options.threadCacheService,
      threadTurnCache: options.threadTurnCache,
      collaborationService: options.collaborationService,
      events: options.events
    });
    const threadTurnPageLoader = new ThreadTurnPageLoader();
    const threadCreationService = new ThreadCreationService({
      backendOptions: options.backendOptions,
      settings: options.settings,
      projects: options.projects
    });
    this.threadCatalogService = new ThreadCatalogService({
      backendOptions: options.backendOptions,
      threadTurnCache: options.threadTurnCache,
      threadCacheService: options.threadCacheService,
      events: options.events,
      clients: options.clients,
      projects: options.projects,
      threadCreationService
    });
    this.threadTurnSyncService = new ThreadTurnSyncService({
      threadTurnCache: options.threadTurnCache,
      threadCacheService: options.threadCacheService,
      events: options.events,
      clients: options.clients,
      sourceResolver: this.threadSourceResolver,
      pageLoader: threadTurnPageLoader,
      collaborationService: options.collaborationService,
      logThreadTiming: (message, details) => {
        this.logThreadTiming(message, details);
      }
    });
    this.threadReadService = new ThreadReadService({
      threadTurnCache: options.threadTurnCache,
      threadCacheService: options.threadCacheService,
      settings: options.settings,
      events: options.events,
      clients: options.clients,
      pageLoader: threadTurnPageLoader,
      threadTurnSyncService: this.threadTurnSyncService,
      threadSourceResolver: this.threadSourceResolver,
      threadCatalogService: this.threadCatalogService,
      logThreadTiming: (message, details) => {
        this.logThreadTiming(message, details);
      },
      handleClientError: options.handleClientError
    });
    this.threadTurnActionsService = new ThreadTurnActionsService({
      backendOptions: options.backendOptions,
      threadTurnCache: options.threadTurnCache,
      threadCacheService: options.threadCacheService,
      settings: options.settings,
      events: options.events,
      clients: options.clients,
      projects: options.projects,
      threadCreationService,
      sourceResolver: this.threadSourceResolver,
      collaborationService: options.collaborationService
    });
  }

  /**
   * Lists threads from cache first, then refreshes from Codex when possible.
   *
   * @param scope Thread list scope.
   * @param projectPath Current project path.
   * @param sourceId Source identifier, or `null` for cache-only orphan reads.
   * @param searchTerm Optional search text.
   *
   * @returns Thread metadata collection.
   */
  async listThreads(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId: string | null,
    searchTerm?: string,
    isArchived = false
  ): Promise<OpenCodexThread[]> {
    return await this.threadCatalogService.listThreads(
      scope,
      projectPath,
      sourceId,
      searchTerm,
      isArchived
    );
  }

  /**
   * Archives a Codex thread and updates the local cache marker.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved when the archive completes.
   */
  async archiveThread(threadId: string): Promise<{ ok: true }> {
    return await this.threadCatalogService.archiveThread(threadId);
  }

  /**
   * Permanently deletes a Codex thread and removes its local cache entry.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved when the deletion completes.
   */
  async deleteThread(threadId: string): Promise<{ ok: true }> {
    return await this.threadCatalogService.deleteThread(threadId);
  }

  /**
   * Restores an archived Codex thread and updates the local cache marker.
   *
   * @param threadId Thread identifier.
   *
   * @returns Promise resolved when the restore completes.
   */
  async unarchiveThread(threadId: string): Promise<{ ok: true }> {
    return await this.threadCatalogService.unarchiveThread(threadId);
  }

  /**
   * Removes a deleted thread from local memory, cache, and visible UI lists.
   *
   * @param threadId Deleted thread identifier.
   * @param sourceId Source identifier when deletion came from a live channel.
   *
   * @returns Promise resolved when local cleanup completes.
   */
  async forgetDeletedThread(threadId: string, sourceId: string | null = null): Promise<void> {
    await this.threadCatalogService.forgetDeletedThread(threadId, sourceId);
  }

  /**
   * Reads the current app-server runtime status for a thread without loading turns.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source known by the live notification channel.
   *
   * @returns Runtime status reported by Codex app-server.
   */
  async readThreadRuntimeStatus(threadId: string): Promise<OpenCodexThreadRuntimeStatus> {
    return await this.threadReadService.readThreadRuntimeStatus(threadId);
  }

  /**
   * Reads the native Codex goal attached to a thread.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source identifier known by the caller, or `null`.
   * @returns Native goal, or `null` when none is configured.
   */
  async readThreadGoal(
    threadId: string,
    sourceIdOverride: string | null = null
  ): Promise<OpenCodexThreadGoal | null> {
    return await this.threadGoalService.read(threadId, sourceIdOverride);
  }

  /**
   * Creates or updates the native Codex goal attached to a thread.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source identifier known by the caller, or `null`.
   * @param patch Goal fields to update.
   * @returns Resulting native goal.
   */
  async setThreadGoal(
    threadId: string,
    sourceIdOverride: string | null,
    patch: OpenCodexThreadGoalPatch
  ): Promise<OpenCodexThreadGoal> {
    return await this.threadGoalService.set(threadId, sourceIdOverride, patch);
  }

  /**
   * Clears the native Codex goal attached to a thread.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source identifier known by the caller, or `null`.
   * @returns Whether a goal was cleared.
   */
  async clearThreadGoal(
    threadId: string,
    sourceIdOverride: string | null = null
  ): Promise<{ cleared: boolean }> {
    return await this.threadGoalService.clear(threadId, sourceIdOverride);
  }

  /**
   * Opens a thread using cache and background synchronization when possible.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source identifier known by the caller, or `null`.
   *
   * @returns Opened thread and UI turns.
   */
  async openThread(
    threadId: string,
    sourceIdOverride: string | null = null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.threadReadService.openThread(threadId, sourceIdOverride);
  }

  /**
   * Loads older thread messages from cache or Codex.
   *
   * @param threadId Thread identifier.
   *
   * @returns Older turn collection and pagination state.
   */
  async loadOlderThreadMessages(
    threadId: string
  ): Promise<{ turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean }> {
    return await this.threadReadService.loadOlderThreadMessages(threadId);
  }

  /**
   * Recovers a thread after a recoverable Codex process failure.
   *
   * @param threadId Thread identifier.
   *
   * @returns Success result.
   */
  async recoverThread(threadId: string): Promise<{ ok: true }> {
    return await this.threadReadService.recoverThread(threadId);
  }

  /**
   * Creates a new thread in a project.
   *
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   *
   * @returns Created thread and initial turns.
   */
  async createThread(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.threadCatalogService.createThread(projectPath, sourceId);
  }

  /**
   * Lists sub-agent threads spawned from a parent thread.
   *
   * @param parentThreadId Parent thread identifier.
   * @param sourceId Source that owns the parent thread.
   *
   * @returns Sub-agent thread metadata.
   */
  async listSubAgentThreads(
    parentThreadId: string,
    sourceId: string | null
  ): Promise<OpenCodexThread[]> {
    return await this.threadHierarchyService.listDescendants(parentThreadId, sourceId);
  }

  /**
   * Records a sub-agent thread announced by `thread/started` without selecting it.
   *
   * @param value Raw thread payload from the notification.
   * @param sourceId Source that owns the App Server connection.
   */
  async recordStartedThread(value: unknown, sourceId: string): Promise<void> {
    await this.threadHierarchyService.recordStarted(value, sourceId);
  }

  /**
   * Reads a thread for secondary readonly display without emitting UI selection events.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source selected by the UI hierarchy.
   *
   * @returns Thread and loaded turns.
   */
  async readThreadReadonly(
    threadId: string,
    sourceIdOverride: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.threadReadService.readThreadReadonly(threadId, sourceIdOverride);
  }

  /**
   * Updates the locally selected composer settings for a thread.
   *
   * @param threadId Thread identifier.
   * @param model Selected model identifier.
   * @param reasoningEffort Selected reasoning effort.
   *
   * @returns Promise resolved when the local cache is updated.
   */
  async updateThreadComposerSettings(
    threadId: string,
    model: string | null,
    reasoningEffort: OpenCodexThread["reasoningEffort"]
  ): Promise<void> {
    await this.threadCatalogService.updateThreadComposerSettings(
      threadId,
      model,
      reasoningEffort
    );
  }

  /**
   * Starts a user turn, creating a thread first when needed.
   *
   * @param threadId Thread identifier, or `null` to create a thread.
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @param text User text.
   * @param attachments Image attachments.
   * @param references Composer references.
   * @param model Optional model override.
   * @param reasoningEffort Optional reasoning effort override.
   * @param serviceTier Optional service tier override.
   * @param shouldResumeExistingThread Whether an existing thread should resume first.
   *
   * @returns Thread and turn identifiers.
   */
  async startTurn(
    threadId: string | null,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    serviceTier: string | null,
    shouldResumeExistingThread = true
  ): Promise<{ threadId: string; turnId: string }> {
    return await this.threadTurnActionsService.startTurn(
      threadId,
      projectPath,
      sourceId,
      text,
      attachments,
      references,
      model,
      reasoningEffort,
      serviceTier,
      shouldResumeExistingThread
    );
  }

  /**
   * Sends steering input to an active Codex turn.
   *
   * @param threadId Thread identifier.
   * @param turnId Active turn identifier expected by Codex.
   * @param text User text.
   * @param attachments Image attachments.
   * @param references Composer references.
   *
   * @returns Thread and turn identifiers.
   */
  async steerTurn(
    threadId: string,
    turnId: string,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[]
  ): Promise<{ threadId: string; turnId: string }> {
    return await this.threadTurnActionsService.steerTurn(
      threadId,
      turnId,
      text,
      attachments,
      references
    );
  }

  /**
   * Edits the last user turn by rolling it back.
   *
   * @param threadId Thread identifier.
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @param _text Edited user text.
   * @param _attachments Image attachments.
   * @param _references Composer references.
   * @param model Optional model override.
   * @param reasoningEffort Optional reasoning effort override.
   * @param _serviceTier Optional service tier override.
   *
   * @returns Thread identifier.
   */
  async editLastTurn(
    threadId: string,
    projectPath: string | null,
    sourceId: string | null,
    _text: string,
    _attachments: OpenCodexImageAttachment[],
    _references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    _serviceTier: string | null
  ): Promise<{ threadId: string }> {
    return await this.threadTurnActionsService.editLastTurn(
      threadId,
      projectPath,
      sourceId,
      model,
      reasoningEffort
    );
  }

  /**
   * Interrupts a running turn.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   *
   * @returns Promise resolved when Codex accepts the interrupt.
   */
  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.threadTurnActionsService.interruptTurn(threadId, turnId);
  }

  /**
   * Starts an inline review of the thread's uncommitted changes.
   *
   * @param threadId Thread identifier.
   * @param projectPath Project path.
   *
   * @returns Promise resolved when Codex accepts the review request.
   */
  async startReview(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    return await this.threadTurnActionsService.startReview(threadId, projectPath);
  }

  /**
   * Starts context compaction for a thread.
   *
   * @param threadId Thread identifier.
   * @param projectPath Project path.
   *
   * @returns Promise resolved when Codex accepts the compaction request.
   */
  async compactThread(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    return await this.threadTurnActionsService.compactThread(threadId, projectPath);
  }

  /**
   * Synchronizes a thread shortly after a turn completes.
   *
   * @param threadId Thread identifier.
   * @param sourceIdOverride Source from the completion notification, or `null`.
   *
   * @returns Promise resolved when synchronization completes.
   */
  async syncCompletedTurn(threadId: string, sourceIdOverride: string | null = null): Promise<void> {
    await this.threadTurnSyncService.syncCompleted(threadId, sourceIdOverride);
  }

  /**
   * Records rich live turn details exposed by Codex notifications.
   *
   * @param notification Codex notification.
   * @returns Nothing.
   */
  recordNotification(notification: CodexNotification): void {
    const result = recordLiveNotification(this.options.threadTurnCache, notification);

    if (result === null || !shouldPersistLiveNotification(notification.method)) {
      return;
    }

    void this.options.threadCacheService.writeDelta(result.entry, [result.turn]);
  }

  /**
   * Renames a thread in Codex and cache.
   *
   * @param threadId Thread identifier.
   * @param name New title.
   *
   * @returns Promise resolved when rename completes.
   */
  async renameThread(threadId: string, name: string): Promise<void> {
    await this.threadCatalogService.renameThread(threadId, name);
  }

  /**
   * Writes thread timing diagnostics through the backend logger.
   *
   * @param message Timing label.
   * @param details Timing details including `startedAt`.
   *
   * @returns Nothing.
   */
  private logThreadTiming(
    message: string,
    details: Record<string, string | number | boolean>
  ): void {
    this.options.backendOptions.logger?.(`${message}: ${JSON.stringify({
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - Number(details.startedAt),
      ...details
    })}`);
  }
}
