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
      case "thread.turns.prepended":
        this.applyTurnsPrepended(event.threadId, event.turns, event.hasMoreOlderMessages);
        return;
      case "thread.turns.synced":
        this.applyTurnsSynced(event.threadId, event.turns, event.hasMoreOlderMessages);
        return;
      case "thread.sync.started":
        this.updateThreadSyncState(event.threadId, true);
        return;
      case "thread.sync.completed":
        this.updateThreadSyncState(event.threadId, false);
        return;
      case "thread.recovery.started":
        this.updateThreadRecoveryState(event.threadId, true);
        return;
      case "thread.recovery.completed":
        this.completeThreadRecovery(event.threadId);
        return;
      case "thread.renamed":
        this.applyThreadRename(event.threadId, event.name);
        return;
      case "thread.tokenUsage.updated":
        this.applyThreadTokenUsage(event.usage);
        return;
      case "message.started":
        this.applyMessageStarted(event.threadId, event.message);
        return;
      case "message.delta":
        this.appendAssistantDelta(event.threadId, event.turnId, event.messageId, event.delta, event.phase ?? null);
        return;
      case "activity.updated":
        this.applyActivityUpdated(event.threadId, event.activity);
        return;
      case "turn.started":
        this.applyTurnStarted(event.threadId, event.turnId);
        return;
      case "turn.completed":
        this.applyTurnCompleted(event.threadId, event.turnId, event.durationMs);
        return;
      default:
        return;
    }
  }

  /**
   * Clears loading and running flags after an unrecoverable error.
   *
   * @returns Nothing.
   */
  resetPendingProjectStates(): void {
    for (const projectStore of this.projectsStore.projectStoresById.values()) {
      projectStore.isLoadingThreads = false;
      projectStore.isCreatingThread = false;
      projectStore.loadingThreadId = null;

      for (const chatStore of projectStore.chatsById.values()) {
        chatStore.isLoadingOlderMessages = false;
        chatStore.isSyncing = false;
        chatStore.isRecovering = false;
        chatStore.isWorking = false;
        chatStore.isStartingTurn = false;
        chatStore.isEditingLastTurn = false;
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
      projectStore.loadingThreadId = null;
    }

    return true;
  }

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

  private applyThreadOpened(
    thread: OpenCodexThread,
    turns: OpenCodexTurn[],
    source: "thread.opened" | "thread.created",
    hasMoreOlderMessages: boolean,
    tokenUsage: OpenCodexThreadTokenUsage | null
  ): void {
    const projectStore = this.projectsStore.ensureProjectStoreForThread(thread);
    const openedThread = projectStore.upsertThread(thread);
    const chatStore = projectStore.getOrCreateChat(openedThread);
    const shouldMergeTurns = projectStore.selectedChatId === openedThread.id && chatStore.turns.length > 0;

    projectStore.isCreatingThread = false;
    projectStore.loadingThreadId = null;
    projectStore.selectChat(openedThread.id);
    this.root.approvalsStore.attachPendingApprovalsToChat(chatStore);
    chatStore.applyOpenedSnapshot(turns, source, hasMoreOlderMessages, shouldMergeTurns);
    chatStore.applyTokenUsage(tokenUsage);
  }

  private applyThreadMetadata(thread: OpenCodexThread): void {
    const projectStore = this.findProjectStoreForThread(thread.id)
      ?? this.projectsStore.ensureProjectStoreForThread(thread);
    const updatedThread = projectStore.upsertThread(thread);
    const chatStore = projectStore.chatsById.get(updatedThread.id);

    if (chatStore !== undefined) {
      chatStore.setThread(updatedThread);
    }

  }

  private applyTurnsPrepended(
    threadId: string,
    turns: OpenCodexTurn[],
    hasMoreOlderMessages: boolean
  ): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyTurnsPrepended(turns, hasMoreOlderMessages);
  }

  private applyTurnsSynced(
    threadId: string,
    turns: OpenCodexTurn[],
    hasMoreOlderMessages: boolean
  ): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyTurnsSynced(turns, hasMoreOlderMessages);
  }

  private updateThreadSyncState(threadId: string, isSyncing: boolean): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.setSyncing(isSyncing);
  }

  private updateThreadRecoveryState(threadId: string, isRecovering: boolean): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.setRecovering(isRecovering);
  }

  private completeThreadRecovery(threadId: string): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.completeRecovery();
  }

  private applyThreadRename(threadId: string, name: string): void {
    const projectStore = this.findProjectStoreForThread(threadId);

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

  private applyThreadTokenUsage(usage: OpenCodexThreadTokenUsage): void {
    const chatStore = this.findChatStore(usage.threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyTokenUsage(usage);
  }

  private applyMessageStarted(threadId: string, message: OpenCodexMessage): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyMessageStarted(message);
  }

  private appendAssistantDelta(
    threadId: string,
    turnId: string,
    itemId: string,
    delta: string,
    phase: OpenCodexMessagePhase | null
  ): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.appendAssistantDelta(turnId, itemId, delta, phase);
  }

  private applyActivityUpdated(threadId: string, activity: OpenCodexActivity): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyActivityUpdated(activity);
  }

  private applyTurnStarted(threadId: string, turnId: string): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyTurnStarted(turnId);
  }

  private applyTurnCompleted(threadId: string, turnId: string, durationMs: number | null): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.applyTurnCompleted(turnId, durationMs);
  }

  private findProjectStoreForThread(threadId: string): ProjectStore | null {
    for (const projectStore of this.projectsStore.projectStoresById.values()) {
      if (projectStore.findThread(threadId) !== null || projectStore.chatsById.has(threadId)) {
        return projectStore;
      }
    }

    return null;
  }

  private findChatStore(threadId: string): ChatStore | null {
    return this.findProjectStoreForThread(threadId)?.chatsById.get(threadId) ?? null;
  }

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
