import { makeAutoObservable } from "mobx";

import type {
  OpenCodexActivity,
  OpenCodexEvent,
  OpenCodexMessage,
  OpenCodexMessagePhase,
  OpenCodexThread,
  OpenCodexThreadTokenUsage,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "./ChatStore";
import type { ProjectStore } from "./ProjectStore";
import type { ProjectsStore } from "./ProjectsStore";
import type { RootStore } from "./RootStore";
import type { RootChildStore } from "./RootChildStore";

/**
 * Applies thread and chat runtime events to their owning project stores.
 */
export class ProjectThreadEventsStore implements RootChildStore {
  /**
   * Creates the thread event router.
   *
   * @param projectsStore Projects store that owns project/chat stores.
   * @param root Root store used for cross-store services.
   */
  constructor(
    private readonly projectsStore: ProjectsStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ProjectThreadEventsStore, "projectsStore" | "root">(this, {
      projectsStore: false,
      root: false
    });
  }

  /**
   * Routes backend thread events to project and chat stores.
   *
   * @param event Event payload to process.
   *
   * @returns Nothing.
   */
  handleEvent(event: OpenCodexEvent): void {
    switch (event.type) {
      case "threads.updated":
        this.applyThreadsUpdated(event.projectPath, event.threads, event.archived);
        return;
      case "thread.opened":
      case "thread.created":
        this.applyThreadOpened(
          event.thread,
          event.turns,
          event.type,
          event.type === "thread.opened" ? event.hasMoreOlderMessages ?? false : false,
          event.type === "thread.opened" ? event.tokenUsage ?? null : null
        );
        return;
      case "thread.metadata.updated":
        this.applyThreadMetadata(event.thread);
        return;
      case "thread.discovered":
        this.applyThreadDiscovered(event.thread);
        return;
      case "collaboration.updated":
        this.applyCollaborationStatuses(event.sourceId, event.event.targetAgentStatuses);
        return;
      case "thread.turns.prepended":
        this.applyTurnsPrepended(
          event.threadId,
          event.turns,
          event.hasMoreOlderMessages,
          event.sourceId
        );
        return;
      case "thread.turns.synced":
        this.applyTurnsSynced(
          event.threadId,
          event.turns,
          event.hasMoreOlderMessages,
          event.sourceId
        );
        return;
      case "thread.sync.started":
        this.updateThreadSyncState(event.threadId, true, event.sourceId);
        return;
      case "thread.sync.completed":
        this.updateThreadSyncState(event.threadId, false, event.sourceId);
        return;
      case "thread.recovery.started":
        this.updateThreadRecoveryState(event.threadId, true, event.sourceId);
        return;
      case "thread.recovery.completed":
        this.completeThreadRecovery(event.threadId, event.sourceId);
        return;
      case "thread.renamed":
        this.applyThreadRename(event.threadId, event.name, event.sourceId);
        return;
      case "thread.deleted":
        this.applyThreadDeleted(event.threadId, event.sourceId);
        return;
      case "thread.tokenUsage.updated":
        this.applyThreadTokenUsage(event.usage, event.sourceId);
        return;
      case "message.started":
        this.applyMessageStarted(event.threadId, event.message, event.sourceId);
        return;
      case "message.delta":
        this.appendAssistantDelta(
          event.threadId,
          event.turnId,
          event.messageId,
          event.delta,
          event.phase ?? null,
          event.sourceId
        );
        return;
      case "activity.updated":
        this.applyActivityUpdated(event.threadId, event.activity, event.sourceId);
        return;
      case "turn.started":
        this.applyTurnStarted(event.threadId, event.turnId, event.sourceId);
        return;
      case "turn.completed":
        this.applyTurnCompleted(
          event.threadId,
          event.turnId,
          event.durationMs,
          event.turnStatus,
          event.errorMessage,
          event.sourceId
        );
        return;
      default:
        return;
    }
  }

  /**
   * Clears pending request UI flags after an unrecoverable error.
   *
   * Runtime turn, recovery, and synchronization state are intentionally left
   * untouched. A request error can be unrelated to every active chat, and only
   * a matching event or trusted runtime status may change those states.
   *
   * @returns Nothing.
   */
  resetPendingProjectStates(): void {
    for (const projectStore of this.projectsStore.projectStoresById.values()) {
      projectStore.threadListStore.isLoadingThreads = false;
      projectStore.threadListStore.isCreatingThread = false;
      projectStore.threadListStore.loadingThreadId = null;

      for (const chatStore of projectStore.chatsById.values()) {
        chatStore.isLoadingOlderMessages = false;
        chatStore.isRefreshing = false;
      }
    }
  }

  /**
   * Marks a chat as recovering after a recoverable thread error.
   *
   * @param threadId Thread identifier.
   *
   * @returns `true` when the chat was found.
   */
  applyRecoverableThreadError(threadId: string): boolean {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return false;
    }

    chatStore.isStartingTurn = false;
    chatStore.isSyncing = true;
    chatStore.isRecovering = true;
    chatStore.isRefreshing = false;
    chatStore.isWorking = true;

    const projectStore = this.findProjectStoreForThread(threadId);

    if (projectStore !== null) {
      projectStore.threadListStore.loadingThreadId = null;
    }

    return true;
  }

  /**
   * Applies a thread list update to the matching project.
   *
   * @param projectPath Project path from the backend.
   * @param threads Thread metadata list.
   * @param isArchived Whether the update is for archived threads.
   */
  private applyThreadsUpdated(
    projectPath: string | null,
    threads: OpenCodexThread[],
    isArchived: boolean
  ): void {
    const projectStore = this.findProjectStoreForThreadUpdate(projectPath, threads);

    if (projectStore === null) {
      return;
    }

    if (projectStore.threadListStore.isShowingArchivedThreads !== isArchived) {
      return;
    }

    projectStore.threadListStore.isLoadingThreads = false;
    projectStore.threadListStore.setThreads(threads);
  }

  /**
   * Applies a thread-opened or thread-created snapshot.
   *
   * @param thread Opened thread metadata.
   * @param turns Turns included in the snapshot.
   * @param source Snapshot event source.
   * @param hasMoreOlderMessages Whether older turns can be loaded.
   * @param tokenUsage Optional token usage snapshot.
   */
  private applyThreadOpened(
    thread: OpenCodexThread,
    turns: OpenCodexTurn[],
    source: "thread.opened" | "thread.created",
    hasMoreOlderMessages: boolean,
    tokenUsage: OpenCodexThreadTokenUsage | null
  ): void {
    const projectStore = this.projectsStore.ensureProjectStoreForThread(thread);
    const shouldActivateProject = this.projectsStore.consumePendingNotificationRoute(thread);
    const openedThread = projectStore.upsertThread(thread);
    const chatStore = projectStore.getOrCreateChat(openedThread);
    const shouldMergeTurns = projectStore.selectedChatId === openedThread.id && chatStore.turns.length > 0;

    projectStore.threadListStore.isCreatingThread = false;
    projectStore.threadListStore.loadingThreadId = null;
    projectStore.selectChat(openedThread.id);
    if (shouldActivateProject) {
      this.root.navigationStore.ensureProjectTab(projectStore.project.id, true);
    }
    this.root.approvalsStore.attachPendingApprovalsToChat(chatStore);
    chatStore.applyOpenedSnapshot(turns, source, hasMoreOlderMessages, shouldMergeTurns);
    chatStore.applyTokenUsage(tokenUsage);
  }

  /**
   * Applies refreshed metadata for a single thread.
   *
   * @param thread Thread metadata.
   */
  private applyThreadMetadata(thread: OpenCodexThread): void {
    const projectStore = this.findProjectStoreForThread(thread.id, thread.sourceId)
      ?? this.projectsStore.ensureProjectStoreForThread(thread);
    const updatedThread = projectStore.upsertThread(thread);
    const chatStore = projectStore.chatsById.get(updatedThread.id);

    if (chatStore !== undefined) {
      chatStore.setThread(updatedThread);
    }

    projectStore.threadListStore.recordSubAgentThread(updatedThread);
  }

  /**
   * Publishes a newly started sub-agent to already loaded descendant lists.
   *
   * @param thread Newly discovered thread metadata.
   */
  private applyThreadDiscovered(thread: OpenCodexThread): void {
    const projectStore = this.findProjectStoreForThread(thread.id, thread.sourceId)
      ?? this.projectsStore.ensureProjectStoreForThread(thread);

    projectStore.threadListStore.recordSubAgentThread(thread);
  }

  /**
   * Applies agent statuses published alongside collaboration actions.
   *
   * @param sourceId Source that owns the agents.
   * @param statuses Status values keyed by thread id or agent path.
   */
  private applyCollaborationStatuses(
    sourceId: string,
    statuses: Readonly<Record<string, string>>
  ): void {
    for (const projectStore of this.projectsStore.projectStoresById.values()) {
      projectStore.threadListStore.updateSubAgentStatuses(sourceId, statuses);
    }
  }

  /**
   * Prepends older turns into a loaded chat.
   *
   * @param threadId Thread identifier.
   * @param turns Older turns.
   * @param hasMoreOlderMessages Whether more older turns remain.
   * @param sourceId Optional source carried by the event.
   */
  private applyTurnsPrepended(
    threadId: string,
    turns: OpenCodexTurn[],
    hasMoreOlderMessages: boolean,
    sourceId?: string | null
  ): void {
    const chatStore = this.findChatStore(threadId, sourceId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyTurnsPrepended(turns, hasMoreOlderMessages);
  }

  /**
   * Applies an incremental turn sync to a loaded chat.
   *
   * @param threadId Thread identifier.
   * @param turns Synced turns.
   * @param hasMoreOlderMessages Whether more older turns remain.
   * @param sourceId Optional source carried by the event.
   */
  private applyTurnsSynced(
    threadId: string,
    turns: OpenCodexTurn[],
    hasMoreOlderMessages: boolean,
    sourceId?: string | null
  ): void {
    const chatStore = this.findChatStore(threadId, sourceId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyTurnsSynced(turns, hasMoreOlderMessages);
  }

  /**
   * Updates chat sync state.
   *
   * @param threadId Thread identifier.
   * @param isSyncing Whether sync is active.
   * @param sourceId Optional source carried by the event.
   */
  private updateThreadSyncState(
    threadId: string,
    isSyncing: boolean,
    sourceId?: string | null
  ): void {
    const chatStore = this.findChatStore(threadId, sourceId);

    if (chatStore === null) {
      return;
    }

    chatStore.setSyncing(isSyncing);
  }

  /**
   * Updates chat recovery state.
   *
   * @param threadId Thread identifier.
   * @param isRecovering Whether recovery is active.
   * @param sourceId Optional source carried by the event.
   */
  private updateThreadRecoveryState(
    threadId: string,
    isRecovering: boolean,
    sourceId?: string | null
  ): void {
    const chatStore = this.findChatStore(threadId, sourceId);

    if (chatStore === null) {
      return;
    }

    chatStore.setRecovering(isRecovering);
  }

  /**
   * Marks recovery as completed for one chat.
   *
   * @param threadId Thread identifier.
   * @param sourceId Optional source carried by the event.
   */
  private completeThreadRecovery(threadId: string, sourceId?: string | null): void {
    const chatStore = this.findChatStore(threadId, sourceId);

    if (chatStore === null) {
      return;
    }

    chatStore.completeRecovery();
  }

  /**
   * Applies a thread rename to chat or list state.
   *
   * @param threadId Thread identifier.
   * @param name New title.
   * @param sourceId Optional source carried by the event.
   */
  private applyThreadRename(
    threadId: string,
    name: string,
    sourceId?: string | null
  ): void {
    const projectStore = this.findProjectStoreForThread(threadId, sourceId);

    if (projectStore === null) {
      return;
    }

    const chatStore = projectStore.chatsById.get(threadId);

    if (chatStore !== undefined) {
      chatStore.applyRename(name);
      return;
    }

    projectStore.renameThread(threadId, name);
  }

  /**
   * Removes a deleted thread from every loaded project store.
   *
   * @param threadId Deleted thread identifier.
   * @param sourceId Optional source carried by the event.
   */
  private applyThreadDeleted(threadId: string, sourceId?: string | null): void {
    if (sourceId !== undefined && sourceId !== null) {
      this.findProjectStoreForThread(threadId, sourceId)?.removeThread(threadId);
      return;
    }

    for (const projectStore of this.projectsStore.projectStoresById.values()) {
      projectStore.removeThread(threadId);
    }
  }

  /**
   * Applies token usage to the owning chat.
   *
   * @param usage Token usage payload.
   * @param sourceId Optional source carried by the event.
   */
  private applyThreadTokenUsage(
    usage: OpenCodexThreadTokenUsage,
    sourceId?: string | null
  ): void {
    const chatStore = this.findChatStore(usage.threadId, sourceId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyTokenUsage(usage);
  }

  /**
   * Applies a newly started message item.
   *
   * @param threadId Thread identifier.
   * @param message Started message item.
   * @param sourceId Optional source carried by the event.
   */
  private applyMessageStarted(
    threadId: string,
    message: OpenCodexMessage,
    sourceId?: string | null
  ): void {
    const chatStore = this.findChatStore(threadId, sourceId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyMessageStarted(message);
  }

  /**
   * Appends streamed assistant text to a message item.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   * @param itemId Message item identifier.
   * @param delta Text delta.
   * @param phase Optional assistant phase.
   * @param sourceId Optional source carried by the event.
   */
  private appendAssistantDelta(
    threadId: string,
    turnId: string,
    itemId: string,
    delta: string,
    phase: OpenCodexMessagePhase | null,
    sourceId?: string | null
  ): void {
    const chatStore = this.findChatStore(threadId, sourceId);

    if (chatStore === null) {
      return;
    }

    chatStore.appendAssistantDelta(turnId, itemId, delta, phase);
  }

  /**
   * Applies a reasoning/activity item update.
   *
   * @param threadId Thread identifier.
   * @param activity Activity item.
   * @param sourceId Optional source carried by the event.
   */
  private applyActivityUpdated(
    threadId: string,
    activity: OpenCodexActivity,
    sourceId?: string | null
  ): void {
    const chatStore = this.findChatStore(threadId, sourceId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyActivityUpdated(activity);
  }

  /**
   * Marks a turn as started in the owning chat.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   * @param sourceId Optional source carried by the event.
   */
  private applyTurnStarted(
    threadId: string,
    turnId: string,
    sourceId?: string | null
  ): void {
    const chatStore = this.findChatStore(threadId, sourceId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyTurnStarted(turnId);
  }

  /**
   * Marks a turn as completed and refreshes Git when it was active.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   * @param durationMs Optional duration in milliseconds.
   * @param turnStatus Terminal status reported by Codex, when available.
   * @param errorMessage Error reported by Codex, when available.
   * @param sourceId Optional source carried by the event.
   */
  private applyTurnCompleted(
    threadId: string,
    turnId: string,
    durationMs: number | null,
    turnStatus: string | undefined,
    errorMessage: string | undefined,
    sourceId?: string | null
  ): void {
    const chatStore = this.findChatStore(threadId, sourceId);

    if (chatStore === null) {
      return;
    }

    const shouldRefreshGit = chatStore.activeTurnId === turnId;

    chatStore.applyTurnCompleted(turnId, durationMs, turnStatus, errorMessage);

    if (shouldRefreshGit) {
      const projectStore = this.findProjectStoreForThread(threadId, sourceId);
      void projectStore?.gitStore.refresh();
    }
  }

  /**
   * Finds the project store that owns a thread.
   *
   * @param threadId Thread identifier.
   * @param sourceId Optional source carried by the event.
   * @returns Project store, or `null`.
   */
  private findProjectStoreForThread(
    threadId: string,
    sourceId?: string | null
  ): ProjectStore | null {
    return this.projectsStore.findProjectStoreForThread(threadId, sourceId);
  }

  /**
   * Finds a loaded chat store by thread id.
   *
   * @param threadId Thread identifier.
   * @param sourceId Optional source carried by the event.
   * @returns Chat store, or `null`.
   */
  private findChatStore(threadId: string, sourceId?: string | null): ChatStore | null {
    return this.projectsStore.findChatStoreByThreadId(threadId, sourceId);
  }

  /**
   * Finds the project targeted by a thread-list update.
   *
   * @param projectPath Project path from the backend.
   * @param threads Thread list payload.
   * @returns Project store, or `null`.
   */
  private findProjectStoreForThreadUpdate(
    projectPath: string | null,
    threads: OpenCodexThread[]
  ): ProjectStore | null {
    if (projectPath === null) {
      return null;
    }

    const threadSourceId = threads[0]?.sourceId;

    if (threadSourceId !== undefined) {
      return this.projectsStore.findProjectStoreByPath(projectPath, threadSourceId);
    }

    const pathMatches = Array.from(this.projectsStore.projectStoresById.values())
      .filter((projectStore) => projectStore.projectPath === projectPath);

    return pathMatches.length === 1 ? pathMatches[0] ?? null : null;
  }
}
