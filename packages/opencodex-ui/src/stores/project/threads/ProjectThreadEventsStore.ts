import { makeAutoObservable } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexThread,
  OpenCodexThreadTokenUsage,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "../../chat/ChatStore";
import type { ProjectStore } from "../ProjectStore";
import type { ProjectsStore } from "../ProjectsStore";
import type { RootStore } from "../../RootStore";
import type { RootChildStore } from "../../RootChildStore";
import { ProjectThreadLiveEventHandler } from "./ProjectThreadLiveEventHandler";

/**
 * Applies thread and chat runtime events to their owning project stores.
 */
export class ProjectThreadEventsStore implements RootChildStore {
  /** Handler for incremental runtime updates to loaded threads. */
  private readonly liveEventHandler: ProjectThreadLiveEventHandler;

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
    this.liveEventHandler = new ProjectThreadLiveEventHandler({
      findChatStoreByThreadId: (threadId, sourceId) =>
        projectsStore.findChatStoreByThreadId(threadId, sourceId),
      findProjectStoreForThread: (threadId, sourceId) =>
        projectsStore.findProjectStoreForThread(threadId, sourceId)
    });

    makeAutoObservable<
      ProjectThreadEventsStore,
      "projectsStore" | "root" | "liveEventHandler"
    >(this, {
      projectsStore: false,
      root: false,
      liveEventHandler: false
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
      case "message.started":
      case "message.delta":
      case "activity.updated":
      case "turn.started":
      case "turn.completed":
        this.liveEventHandler.handleEvent(event);
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
        chatStore.timeline.isLoadingOlderMessages = false;
        chatStore.runtime.isRefreshing = false;
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

    chatStore.runtime.applyRecoverableThreadError();

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
    const shouldMergeTurns = (
      projectStore.selectedChatId === openedThread.id &&
      chatStore.timeline.turns.length > 0
    );

    projectStore.threadListStore.isCreatingThread = false;
    projectStore.threadListStore.loadingThreadId = null;
    projectStore.selectChat(openedThread.id);
    if (shouldActivateProject) {
      this.root.navigationStore.ensureProjectTab(projectStore.project.id, true);
    }
    this.root.approvalsStore.attachPendingApprovalsToChat(chatStore);
    chatStore.applyOpenedSnapshot(turns, source, hasMoreOlderMessages, shouldMergeTurns);
    chatStore.timeline.applyTokenUsage(tokenUsage);
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

    projectStore.threadListStore.subAgentStore.recordThread(updatedThread);
  }

  /**
   * Publishes a newly started sub-agent to already loaded descendant lists.
   *
   * @param thread Newly discovered thread metadata.
   */
  private applyThreadDiscovered(thread: OpenCodexThread): void {
    const projectStore = this.findProjectStoreForThread(thread.id, thread.sourceId)
      ?? this.projectsStore.ensureProjectStoreForThread(thread);

    projectStore.threadListStore.subAgentStore.recordThread(thread);
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
      projectStore.threadListStore.subAgentStore.updateStatuses(sourceId, statuses);
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

    chatStore.timeline.applyTurnsPrepended(turns, hasMoreOlderMessages);
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

    chatStore.timeline.applyTurnsSynced(turns, hasMoreOlderMessages);
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

    chatStore.runtime.setSyncing(isSyncing);
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

    chatStore.runtime.setRecovering(isRecovering);

    const projectStore = this.findProjectStoreForThread(threadId, sourceId);

    if (projectStore !== null) {
      projectStore.threadListStore.loadingThreadId = null;
    }
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
