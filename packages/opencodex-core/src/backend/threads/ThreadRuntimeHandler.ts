import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexCollaborationEvent,
  OpenCodexCollaborationQuery,
  OpenCodexComposerReference,
  OpenCodexEvent,
  OpenCodexImageAttachment,
  OpenCodexReasoningEffort,
  OpenCodexThread,
  OpenCodexThreadEventLogPage,
  OpenCodexThreadEventLogRequestType,
  OpenCodexThreadEventLogValue,
  OpenCodexThreadGoal,
  OpenCodexThreadGoalPatch,
  OpenCodexThreadRuntimeStatus,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import { ThreadConversationService } from "./ThreadConversationService.js";
import { ThreadRuntimeNotifications } from "./ThreadRuntimeNotifications.js";
import {
  createThreadRuntimeServices,
  type ThreadRuntimeHandlerOptions,
  type ThreadRuntimeNotificationAdapters
} from "./threadRuntimeComposition.js";

export type {
  ThreadRuntimeHandlerOptions,
  ThreadRuntimeNotificationAdapters
} from "./threadRuntimeComposition.js";

/** Owns thread services, thread-scoped state, and their runtime-facing facade. */
export class ThreadRuntimeHandler {
  /** Thread conversation and turn lifecycle service. */
  private readonly threadConversationService: ThreadConversationService;
  /** Notification callbacks, adapters, journaling, and suppression state. */
  private readonly notifications: ThreadRuntimeNotifications;

  /**
   * Creates one cohesive set of thread services and shared state.
   *
   * @param options Runtime service ports and the cyclic error callback.
   */
  constructor(options: ThreadRuntimeHandlerOptions) {
    const services = createThreadRuntimeServices(options);
    this.threadConversationService = services.threadConversationService;
    this.notifications = services.notifications;
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
    return this.notifications.readEventLog(threadId, sourceId, limit);
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
    return await this.notifications.listCollaborationEvents(query);
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
    return await this.threadConversationService.readThreadGoal(threadId, sourceIdOverride);
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
    return await this.threadConversationService.setThreadGoal(
      threadId,
      sourceIdOverride,
      patch
    );
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
    return await this.threadConversationService.clearThreadGoal(threadId, sourceIdOverride);
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
    this.notifications.ignore(threadId);
  }

  /**
   * Releases transient notification suppression for a thread.
   *
   * @param threadId Thread identifier.
   * @returns Nothing.
   */
  releaseThreadNotifications(threadId: string): void {
    this.notifications.release(threadId);
  }

  /**
   * Checks whether notifications for a thread are suppressed.
   *
   * @param threadId Thread identifier.
   * @returns Whether notifications are currently ignored.
   */
  isThreadIgnored(threadId: string): boolean {
    return this.notifications.isIgnored(threadId);
  }

  /**
   * Records a raw notification in the bounded event log.
   *
   * @param notification Raw Codex notification.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  recordRawNotification(notification: CodexNotification, sourceId: string): void {
    this.notifications.recordRaw(notification, sourceId);
  }

  /**
   * Records an outgoing turn request in the bounded event log.
   *
   * @param sourceId Source that receives the request.
   * @param threadId Thread targeted by the request.
   * @param requestType Client request name.
   * @param turnId Active turn targeted by steering, or `null` for a new turn.
   * @param details Safe scalar request metadata.
   * @returns Nothing.
   */
  recordClientRequest(
    sourceId: string,
    threadId: string,
    requestType: OpenCodexThreadEventLogRequestType,
    turnId: string | null,
    details: Record<string, OpenCodexThreadEventLogValue> = {}
  ): void {
    this.notifications.recordClientRequest(sourceId, threadId, requestType, turnId, details);
  }

  /**
   * Emits a backend event and records thread-targeted events in the event log.
   *
   * @param event Event payload.
   * @returns Nothing.
   */
  emit(event: OpenCodexEvent): void {
    this.notifications.emit(event);
  }

  /**
   * Returns the exact service instances used by notification processing.
   *
   * @returns Read-only notification adapters.
   */
  getNotificationAdapters(): ThreadRuntimeNotificationAdapters {
    return this.notifications.getAdapters();
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
    this.notifications.applyCodexThreadTitle(threadId, title, sourceId);
  }

  /**
   * Applies a Codex-generated deletion to cache and UI.
   *
   * @param threadId Deleted thread identifier.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  applyCodexThreadDeleted(threadId: string, sourceId: string): void {
    this.notifications.applyCodexThreadDeleted(threadId, sourceId);
  }

  /**
   * Refreshes a completed turn after Codex persists its items.
   *
   * @param threadId Thread identifier.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  syncCompletedTurn(threadId: string, sourceId: string): void {
    this.notifications.syncCompletedTurn(threadId, sourceId);
  }

}
