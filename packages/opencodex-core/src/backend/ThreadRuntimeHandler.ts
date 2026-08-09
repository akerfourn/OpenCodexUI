import type { CodexAppServerClient, CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexCollaborationEvent,
  OpenCodexCollaborationQuery,
  OpenCodexComposerReference,
  OpenCodexEvent,
  OpenCodexImageAttachment,
  OpenCodexProject,
  OpenCodexReasoningEffort,
  OpenCodexSettings,
  OpenCodexThread,
  OpenCodexThreadEventLogPage,
  OpenCodexThreadRuntimeStatus,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import { ThreadTurnCache } from "../ThreadTurnCache.js";
import type { OpenCodexBackendOptions } from "../types.js";
import { CollaborationService } from "./CollaborationService.js";
import { NotificationService } from "./NotificationService.js";
import { toError } from "./errors.js";
import { ThreadConversationService } from "./ThreadConversationService.js";
import { ThreadCacheService } from "./ThreadCacheService.js";
import {
  ThreadEventLogService,
  type ThreadEventLogMutation
} from "./ThreadEventLogService.js";

/** Dependencies needed to construct the thread runtime handler. */
export type ThreadRuntimeHandlerOptions = {
  /** Original backend options used by cache and conversation services. */
  backendOptions: OpenCodexBackendOptions;
  /** Cache repository shared by thread and collaboration services. */
  cacheRepository: OpenCodexCacheRepository | null;
  /** Reads the current mutable settings snapshot. */
  getSettings(): OpenCodexSettings;
  /** Emits an event directly to the host transport. */
  emitToHost(event: OpenCodexEvent): void;
  /** Ensures a Codex client for a source. */
  ensureClient(sourceId: string | null): Promise<CodexAppServerClient>;
  /** Resolves a source for source-aware Codex operations. */
  resolveSource(sourceId: string | null): Promise<CachedSource>;
  /** Caches project metadata for a thread operation. */
  cacheProject(projectPath: string | null, sourceId: string | null): Promise<OpenCodexProject | null>;
  /** Reads cached projects for thread-list refresh events. */
  readCachedProjects(): Promise<OpenCodexProject[]>;
  /** Handles asynchronous client failures raised by thread callbacks. */
  handleClientError(error: Error): void;
};

/** Adapters consumed by the ordered notification coordinator. */
export type ThreadRuntimeNotificationAdapters = {
  /** Thread cache operations used by notification processing. */
  readonly threadCacheService: Pick<
    ThreadCacheService,
    "writeTokenUsage" | "writeTurnExecutionMetadata"
  >;
  /** In-memory thread and turn state used by notification processing. */
  readonly threadTurnCache: ThreadTurnCache;
  /** Collaboration notification adapter. */
  readonly collaborationService: Pick<CollaborationService, "handleNotification">;
  /** Conversation notification adapters. */
  readonly threadConversationService: Pick<
    ThreadConversationService,
    "recordStartedThread" | "recordNotification"
  >;
  /** UI notification adapter. */
  readonly notificationService: Pick<NotificationService, "handleNotification">;
};

/** Owns thread services, thread-scoped state, and their runtime-facing facade. */
export class ThreadRuntimeHandler {
  /** In-memory turn and thread cache shared by all thread services. */
  private readonly threadTurnCache: ThreadTurnCache;
  /** Bounded metadata trace shared by raw and backend event recording. */
  private readonly threadEventLogService: ThreadEventLogService;
  /** SQLite-backed thread metadata and turn cache service. */
  private readonly threadCacheService: ThreadCacheService;
  /** Collaboration event persistence and normalization service. */
  private readonly collaborationService: CollaborationService;
  /** Thread conversation and turn lifecycle service. */
  private readonly threadConversationService: ThreadConversationService;
  /** Converts Codex notifications to thread-related UI events. */
  private readonly notificationService: NotificationService;
  /** Threads whose transient notifications must be ignored. */
  private readonly ignoredNotificationThreadIds = new Set<string>();
  /** Host and service callbacks used while constructing the handler. */
  private readonly options: ThreadRuntimeHandlerOptions;

  /**
   * Creates one cohesive set of thread services and shared state.
   *
   * @param options Backend callbacks and persistence dependencies.
   */
  constructor(options: ThreadRuntimeHandlerOptions) {
    this.options = options;
    this.threadTurnCache = new ThreadTurnCache();
    this.threadEventLogService = new ThreadEventLogService();
    this.threadCacheService = new ThreadCacheService({
      backendOptions: options.backendOptions,
      cacheRepository: options.cacheRepository,
      threadTurnCache: this.threadTurnCache,
      getSettings: options.getSettings,
      emit: (event) => this.emit(event)
    });
    this.collaborationService = new CollaborationService({
      cacheRepository: options.cacheRepository,
      emit: (event) => this.emit(event),
      logger: options.backendOptions.logger
    });
    this.threadConversationService = new ThreadConversationService({
      backendOptions: options.backendOptions,
      threadTurnCache: this.threadTurnCache,
      threadCacheService: this.threadCacheService,
      getSettings: options.getSettings,
      emit: (event) => this.emit(event),
      ensureClient: options.ensureClient,
      resolveSource: options.resolveSource,
      cacheProject: options.cacheProject,
      readCachedProjects: options.readCachedProjects,
      reconcileCollaborationTurns: (sourceId, threadId, turns) => (
        this.collaborationService.reconcileTurns(sourceId, threadId, turns)
      ),
      reconcileDescendantThreads: (sourceId, rootThreadId, threads) => (
        this.collaborationService.reconcileDescendantThreads(sourceId, rootThreadId, threads)
      ),
      handleClientError: options.handleClientError
    });
    this.notificationService = new NotificationService({
      getSettings: options.getSettings,
      emit: (event) => this.emit(event),
      applyCodexThreadTitle: (threadId, title, sourceId) => {
        this.applyCodexThreadTitle(threadId, title, sourceId);
      },
      applyCodexThreadDeleted: (threadId, sourceId) => {
        this.applyCodexThreadDeleted(threadId, sourceId);
      },
      syncCompletedTurn: (threadId, sourceId) => {
        this.syncCompletedTurn(threadId, sourceId);
      }
    });
  }

  /**
   * Lists thread metadata.
   *
   * @param scope Thread list scope.
   * @param projectPath Current project path.
   * @param sourceId Source identifier, or `null`.
   * @param searchTerm Optional search text.
   * @param isArchived Whether archived threads should be listed.
   * @returns Thread collection.
   */
  async listThreads(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId: string | null,
    searchTerm?: string,
    isArchived = false
  ): Promise<OpenCodexThread[]> {
    return await this.threadConversationService.listThreads(
      scope,
      projectPath,
      sourceId,
      searchTerm,
      isArchived
    );
  }

  /**
   * Archives a thread.
   *
   * @param threadId Thread identifier.
   * @returns Successful archive result.
   */
  async archiveThread(threadId: string): Promise<{ ok: true }> {
    return await this.threadConversationService.archiveThread(threadId);
  }

  /**
   * Permanently deletes a thread.
   *
   * @param threadId Thread identifier.
   * @returns Successful deletion result.
   */
  async deleteThread(threadId: string): Promise<{ ok: true }> {
    return await this.threadConversationService.deleteThread(threadId);
  }

  /**
   * Restores an archived thread.
   *
   * @param threadId Thread identifier.
   * @returns Successful restore result.
   */
  async unarchiveThread(threadId: string): Promise<{ ok: true }> {
    return await this.threadConversationService.unarchiveThread(threadId);
  }

  /**
   * Opens a thread and loads its current turns.
   *
   * @param threadId Thread identifier.
   * @param sourceId Source identifier known by the caller, or `null`.
   * @returns Opened thread and turns.
   */
  async openThread(
    threadId: string,
    sourceId: string | null = null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.threadConversationService.openThread(threadId, sourceId);
  }

  /**
   * Reads the bounded metadata trace for one thread.
   *
   * @param threadId Thread identifier.
   * @param sourceId Source identifier, or `null` for an orphan thread.
   * @param limit Maximum number of entries.
   * @returns Chronological event trace.
   */
  readThreadEventLog(
    threadId: string,
    sourceId: string | null,
    limit: number
  ): OpenCodexThreadEventLogPage {
    return this.threadEventLogService.read(sourceId, threadId, limit);
  }

  /**
   * Lists sub-agent threads spawned by a parent thread.
   *
   * @param parentThreadId Parent thread identifier.
   * @param sourceId Source that owns the parent thread.
   * @returns Sub-agent threads.
   */
  async listSubAgentThreads(
    parentThreadId: string,
    sourceId: string | null
  ): Promise<OpenCodexThread[]> {
    return await this.threadConversationService.listSubAgentThreads(parentThreadId, sourceId);
  }

  /**
   * Lists normalized collaboration events.
   *
   * @param query Source-aware collaboration filters.
   * @returns Collaboration events.
   */
  async listCollaborationEvents(
    query: OpenCodexCollaborationQuery
  ): Promise<OpenCodexCollaborationEvent[]> {
    return await this.collaborationService.listEvents(query);
  }

  /**
   * Reads a secondary thread without changing selection state.
   *
   * @param threadId Thread identifier.
   * @param sourceId Source that owns the thread.
   * @returns Thread and loaded turns.
   */
  async readThreadReadonly(
    threadId: string,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.threadConversationService.readThreadReadonly(threadId, sourceId);
  }

  /**
   * Loads older messages for a thread.
   *
   * @param threadId Thread identifier.
   * @returns Older turn result.
   */
  async loadOlderThreadMessages(
    threadId: string
  ): Promise<{ turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean }> {
    return await this.threadConversationService.loadOlderThreadMessages(threadId);
  }

  /**
   * Recovers a thread after a recoverable process error.
   *
   * @param threadId Thread identifier.
   * @returns Successful recovery result.
   */
  async recoverThread(threadId: string): Promise<{ ok: true }> {
    return await this.threadConversationService.recoverThread(threadId);
  }

  /**
   * Creates a thread in a project.
   *
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @returns Created thread and initial turns.
   */
  async createThread(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.threadConversationService.createThread(projectPath, sourceId);
  }

  /**
   * Persists composer settings for a thread.
   *
   * @param threadId Thread identifier.
   * @param model Selected model identifier.
   * @param reasoningEffort Selected reasoning effort.
   * @returns Promise resolved when settings are stored.
   */
  async updateThreadComposerSettings(
    threadId: string,
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null
  ): Promise<void> {
    await this.threadConversationService.updateThreadComposerSettings(
      threadId,
      model,
      reasoningEffort
    );
  }

  /**
   * Starts a user turn.
   *
   * @param threadId Thread identifier, or `null` to create one.
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @param text User text.
   * @param attachments Image attachments.
   * @param references Composer references.
   * @param model Optional model override.
   * @param reasoningEffort Optional reasoning effort override.
   * @param serviceTier Optional service tier.
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
    serviceTier: string | null
  ): Promise<{ threadId: string; turnId: string }> {
    return await this.threadConversationService.startTurn(
      threadId,
      projectPath,
      sourceId,
      text,
      attachments,
      references,
      model,
      reasoningEffort,
      serviceTier
    );
  }

  /**
   * Steers a running turn.
   *
   * @param threadId Thread identifier.
   * @param turnId Active turn identifier.
   * @param text User text.
   * @param attachments Image attachments.
   * @param references Composer references.
   * @returns Thread and turn identifiers.
   */
  async steerTurn(
    threadId: string,
    turnId: string,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[]
  ): Promise<{ threadId: string; turnId: string }> {
    return await this.threadConversationService.steerTurn(
      threadId,
      turnId,
      text,
      attachments,
      references
    );
  }

  /**
   * Rolls back the last turn and starts edited input.
   *
   * @param threadId Thread identifier.
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @param text Edited user text.
   * @param attachments Image attachments.
   * @param references Composer references.
   * @param model Optional model override.
   * @param reasoningEffort Optional reasoning effort override.
   * @param serviceTier Optional service tier.
   * @returns Thread identifier after rollback.
   */
  async editLastTurn(
    threadId: string,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    serviceTier: string | null
  ): Promise<{ threadId: string }> {
    return await this.threadConversationService.editLastTurn(
      threadId,
      projectPath,
      sourceId,
      text,
      attachments,
      references,
      model,
      reasoningEffort,
      serviceTier
    );
  }

  /**
   * Interrupts a running turn.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   * @returns Promise resolved when Codex accepts the interrupt.
   */
  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.threadConversationService.interruptTurn(threadId, turnId);
  }

  /**
   * Reads the runtime status for a thread.
   *
   * @param threadId Thread identifier.
   * @returns Runtime status reported by Codex.
   */
  async readThreadRuntimeStatus(threadId: string): Promise<OpenCodexThreadRuntimeStatus> {
    return await this.threadConversationService.readThreadRuntimeStatus(threadId);
  }

  /**
   * Starts an inline review for a thread.
   *
   * @param threadId Thread identifier.
   * @param projectPath Project path.
   * @returns Successful review result.
   */
  async startThreadReview(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    return await this.threadConversationService.startReview(threadId, projectPath);
  }

  /**
   * Starts context compaction for a thread.
   *
   * @param threadId Thread identifier.
   * @param projectPath Project path.
   * @returns Successful compaction result.
   */
  async compactThread(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    return await this.threadConversationService.compactThread(threadId, projectPath);
  }

  /**
   * Renames a thread.
   *
   * @param threadId Thread identifier.
   * @param name New title.
   * @returns Promise resolved when rename completes.
   */
  async renameThread(threadId: string, name: string): Promise<void> {
    await this.threadConversationService.renameThread(threadId, name);
  }

  /**
   * Suppresses transient notifications for a thread.
   *
   * @param threadId Thread identifier.
   * @returns Nothing.
   */
  ignoreThreadNotifications(threadId: string): void {
    this.ignoredNotificationThreadIds.add(threadId);
  }

  /**
   * Releases transient notification suppression for a thread.
   *
   * @param threadId Thread identifier.
   * @returns Nothing.
   */
  releaseThreadNotifications(threadId: string): void {
    this.ignoredNotificationThreadIds.delete(threadId);
  }

  /**
   * Checks whether notifications for a thread are suppressed.
   *
   * @param threadId Thread identifier.
   * @returns Whether notifications are currently ignored.
   */
  isThreadIgnored(threadId: string): boolean {
    return this.ignoredNotificationThreadIds.has(threadId);
  }

  /**
   * Records a raw notification in the bounded event log.
   *
   * @param notification Raw Codex notification.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  recordRawNotification(notification: CodexNotification, sourceId: string): void {
    this.notifyThreadEventLog(this.threadEventLogService.recordNotification(notification, sourceId));
  }

  /**
   * Emits a backend event and records thread-targeted events in the event log.
   *
   * @param event Event payload.
   * @returns Nothing.
   */
  emit(event: OpenCodexEvent): void {
    if (event.type !== "thread.eventLog.updated") {
      this.notifyThreadEventLog(this.threadEventLogService.recordBackendEvent(event));
    }

    this.options.emitToHost(event);
  }

  /**
   * Returns the exact service instances used by notification processing.
   *
   * @returns Read-only notification adapters.
   */
  getNotificationAdapters(): ThreadRuntimeNotificationAdapters {
    return {
      threadCacheService: this.threadCacheService,
      threadTurnCache: this.threadTurnCache,
      collaborationService: this.collaborationService,
      threadConversationService: this.threadConversationService,
      notificationService: this.notificationService
    };
  }

  /**
   * Applies a Codex-generated title to memory and cache.
   *
   * @param threadId Thread identifier.
   * @param title Codex-generated title.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  applyCodexThreadTitle(threadId: string, title: string, sourceId: string): void {
    const cacheEntry = this.threadTurnCache.updateCodexThreadTitle(threadId, title);

    if (cacheEntry !== null) {
      this.emit({ type: "thread.metadata.updated", thread: cacheEntry.thread });
    }

    void this.threadCacheService.writeCodexTitle(threadId, title);
  }

  /**
   * Applies a Codex-generated deletion to cache and UI.
   *
   * @param threadId Deleted thread identifier.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  applyCodexThreadDeleted(threadId: string, sourceId: string): void {
    void this.threadConversationService
      .forgetDeletedThread(threadId, sourceId)
      .catch((error: unknown) => {
        this.options.handleClientError(toError(error));
      });
  }

  /**
   * Refreshes a completed turn after Codex persists its items.
   *
   * @param threadId Thread identifier.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  syncCompletedTurn(threadId: string, sourceId: string): void {
    void this.threadConversationService.syncCompletedTurn(threadId, sourceId).catch((error: unknown) => {
      this.options.handleClientError(toError(error));
    });
  }

  /**
   * Forwards a trace mutation without recursively recording the trace update.
   *
   * @param mutation Trace mutation, or `null` when no update is needed.
   * @returns Nothing.
   */
  private notifyThreadEventLog(mutation: ThreadEventLogMutation | null): void {
    if (mutation === null || !mutation.shouldNotify) {
      return;
    }

    this.emit({
      type: "thread.eventLog.updated",
      sourceId: mutation.entry.sourceId,
      threadId: mutation.entry.threadId,
      entry: mutation.entry
    });
  }
}
