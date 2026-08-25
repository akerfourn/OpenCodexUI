/**
 * Holds the transient runtime state for one loaded chat.
 */
import { makeAutoObservable } from "mobx";

import type { ChatStore } from "./ChatStore";
import { ChatRuntimeStatusPoller } from "./ChatRuntimeStatusPoller";

/**
 * Owns turn lifecycle flags and the fallback runtime-status poller for a chat.
 *
 * Timeline mutations remain in `ChatStore` because they need to be ordered with
 * runtime transitions. This store only records the resulting runtime state.
 */
export class ChatRuntimeStore {
  /** Whether this thread is synchronizing with Codex. */
  isSyncing = false;
  /** Whether the current thread snapshot is being refreshed. */
  isRefreshing = false;
  /** Whether the chat is recovering after a recoverable thread error. */
  isRecovering = false;
  /** Whether Codex currently has an active turn for this chat. */
  isWorking = false;
  /** Whether a start-turn request is in flight before Codex confirms a turn id. */
  isStartingTurn = false;
  /** Whether the last turn is being edited and restarted. */
  isEditingLastTurn = false;
  /** Whether completed work is unseen by the user. */
  hasUnseenCompletedTurn = false;
  /** Active Codex turn id while a turn is running. */
  activeTurnId: string | null = null;
  /** Optimistic local turn id waiting for Codex confirmation. */
  pendingTurnId: string | null = null;
  /** Polls runtime status while a turn is active. */
  private readonly statusPoller: ChatRuntimeStatusPoller;

  /**
   * Creates runtime state for a chat.
   *
   * @param chatStore Parent chat used by the poller for dynamic thread and
   * source context.
   */
  constructor(private readonly chatStore: ChatStore) {
    this.statusPoller = new ChatRuntimeStatusPoller(chatStore);
    makeAutoObservable<ChatRuntimeStore, "chatStore" | "statusPoller">(this, {
      chatStore: false,
      statusPoller: false
    });
  }

  /** Whether the chat should show a running-work indicator. */
  get hasRunningTurnIndicator(): boolean {
    return (
      this.isWorking ||
      this.isStartingTurn ||
      this.isEditingLastTurn ||
      this.isRecovering
    );
  }

  /** Whether completed work should be highlighted for the user. */
  get hasUnseenTurnIndicator(): boolean {
    return this.hasUnseenCompletedTurn && !this.hasRunningTurnIndicator;
  }

  /** Resets all transient runtime state before loading another snapshot. */
  reset(): void {
    this.stopStatusPolling();
    this.isWorking = false;
    this.isStartingTurn = false;
    this.isEditingLastTurn = false;
    this.activeTurnId = null;
    this.pendingTurnId = null;
    this.hasUnseenCompletedTurn = false;
    this.isSyncing = false;
    this.isRefreshing = false;
    this.isRecovering = false;
  }

  /** Marks a fresh snapshot request as pending. */
  beginRefresh(): void {
    this.isRefreshing = true;
  }

  /** Marks recovery as active and synchronizing. */
  beginRecovery(): void {
    this.isRecovering = true;
    this.isSyncing = true;
  }

  /** Updates synchronization state and clears refresh state when it ends. */
  setSyncing(isSyncing: boolean): void {
    this.isSyncing = isSyncing;

    if (!isSyncing) {
      this.isRefreshing = false;
    }
  }

  /** Updates recovery state and keeps synchronization flags consistent. */
  setRecovering(isRecovering: boolean): void {
    this.isRecovering = isRecovering;
    this.isSyncing = isRecovering;
    this.isRefreshing = false;
  }

  /** Marks a chat as actively recovering after a recoverable turn error. */
  applyRecoverableThreadError(): void {
    this.isStartingTurn = false;
    this.isSyncing = true;
    this.isRecovering = true;
    this.isRefreshing = false;
    this.isWorking = true;
  }

  /**
   * Finishes recovery using whether the timeline still contains a running turn.
   *
   * @param hasRecoveredRunningTurn Whether recovery found an active turn.
   */
  completeRecovery(hasRecoveredRunningTurn: boolean): void {
    this.isRecovering = false;
    this.isSyncing = false;
    this.isRefreshing = false;
    this.isWorking = hasRecoveredRunningTurn;

    if (!hasRecoveredRunningTurn) {
      this.activeTurnId = null;
      this.pendingTurnId = null;
      this.stopStatusPolling();
      return;
    }

    this.startStatusPolling();
  }

  /** Marks a start-turn request as pending. */
  beginTurnStart(): void {
    this.isStartingTurn = true;
  }

  /** Clears a start-turn request after an advanced action fails. */
  clearTurnStart(): void {
    this.isStartingTurn = false;
  }

  /** Marks an edit-and-restart request as pending. */
  beginLastTurnEdit(): void {
    this.isEditingLastTurn = true;
    this.isStartingTurn = true;
  }

  /** Clears a pending optimistic turn after its timeline entry was removed. */
  clearPendingTurn(): void {
    this.pendingTurnId = null;
  }

  /**
   * Stores the pending identifier produced by a coordinated timeline mutation.
   *
   * @param pendingTurnId Pending identifier to retain, or `null` when promoted.
   */
  setPendingTurnId(pendingTurnId: string | null): void {
    this.pendingTurnId = pendingTurnId;
  }

  /** Clears the pre-confirmation flag after the backend reports a started message. */
  applyMessageStarted(): void {
    this.isStartingTurn = false;
  }

  /**
   * Records the runtime flags and active id for a confirmed turn start.
   *
   * @param turnId Confirmed Codex turn identifier.
   */
  applyTurnStarted(turnId: string): void {
    this.isStartingTurn = false;
    this.isEditingLastTurn = false;
    this.isWorking = true;
    this.hasUnseenCompletedTurn = false;
    this.activeTurnId = turnId;
  }

  /**
   * Finalizes a confirmed turn start after pending timeline promotion.
   *
   * @param pendingTurnId Pending id returned by the timeline promotion.
   */
  finalizeTurnStarted(pendingTurnId: string | null): void {
    this.pendingTurnId = pendingTurnId;
    this.startStatusPolling();
  }

  /**
   * Marks a matching turn complete after the timeline has applied its payload.
   *
   * @param shouldMarkUnseen Whether the completed work is outside the visible chat.
   */
  applyTurnCompleted(shouldMarkUnseen: boolean): void {
    this.isWorking = false;
    this.activeTurnId = null;
    this.pendingTurnId = null;
    this.isEditingLastTurn = false;
    this.hasUnseenCompletedTurn = shouldMarkUnseen;
    this.stopStatusPolling();
  }

  /** Marks the latest completed work as seen. */
  markSeen(): void {
    this.hasUnseenCompletedTurn = false;
  }

  /** Clears optimistic runtime state after a failed initial turn request. */
  clearAfterStartFailure(): void {
    this.isStartingTurn = false;
    this.isWorking = false;
    this.activeTurnId = null;
    this.pendingTurnId = null;
    this.stopStatusPolling();
  }

  /** Clears edit state after an edit request fails before turn start. */
  clearAfterEditFailure(): void {
    this.pendingTurnId = null;
    this.isEditingLastTurn = false;
    this.isStartingTurn = false;
  }

  /** Clears both edit and start flags after the restarted turn fails. */
  clearEditStart(): void {
    this.isStartingTurn = false;
    this.isEditingLastTurn = false;
  }

  /** Applies the state changes associated with an opened thread snapshot. */
  applyOpenedSnapshot(): void {
    this.isRefreshing = false;
    this.isSyncing = false;
    this.isEditingLastTurn = false;
    this.pendingTurnId = null;
  }

  /** Marks the runtime idle after a validated status response. */
  applyRuntimeIdle(shouldMarkUnseen: boolean): void {
    this.isWorking = false;
    this.isStartingTurn = false;
    this.isEditingLastTurn = false;
    this.activeTurnId = null;
    this.pendingTurnId = null;
    this.hasUnseenCompletedTurn = shouldMarkUnseen;
    this.stopStatusPolling();
  }

  /** Starts polling runtime status without replacing an existing timer. */
  startStatusPolling(): void {
    this.statusPoller.start();
  }

  /** Stops polling and clears the in-flight request guard. */
  stopStatusPolling(): void {
    this.statusPoller.stop();
  }

  /** Releases the timer and all poller-owned transient state. */
  dispose(): void {
    this.statusPoller.dispose();
  }
}
