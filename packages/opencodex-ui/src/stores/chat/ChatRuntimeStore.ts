/**
 * Holds the transient runtime state for one loaded chat.
 */
import { makeAutoObservable } from "mobx";

import type { ChatStore } from "./ChatStore";
import { ChatRuntimeStatusPoller } from "./ChatRuntimeStatusPoller";

/** Outcome of observing a turn event before or after request confirmation. */
export type TurnStartEventDisposition = "accepted" | "pending" | "ignored";

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
  /** Monotonic identifier used to associate a start response with its request. */
  private turnStartAttemptSequence = 0;
  /** Currently pending request-bound start attempt. */
  private pendingTurnStartAttemptId: number | null = null;
  /** Whether live events must wait for the start request response. */
  private awaitingTurnStartConfirmation = false;
  /** User text expected from the request-bound start attempt. */
  private pendingTurnStartMessageContent: string | null = null;
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
    this.clearTurnStartConfirmation();
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

  /**
   * Marks a start-turn request as pending.
   *
   * Request-bound starts delay live event application until the backend
   * response supplies the authoritative turn id. Advanced actions keep the
   * legacy event-bound behavior because their responses do not expose one.
   *
   * @param awaitConfirmation Whether the request response owns turn identity.
   * @param messageContent User text expected in the started message.
   * @returns Attempt identifier when confirmation is required.
   */
  beginTurnStart(
    awaitConfirmation: true,
    messageContent?: string | null
  ): number;
  beginTurnStart(
    awaitConfirmation?: false,
    messageContent?: string | null
  ): null;
  beginTurnStart(
    awaitConfirmation = false,
    messageContent: string | null = null
  ): number | null {
    this.isStartingTurn = true;

    this.clearTurnStartConfirmation();

    if (!awaitConfirmation) {
      return null;
    }

    this.awaitingTurnStartConfirmation = true;
    this.pendingTurnStartAttemptId = ++this.turnStartAttemptSequence;
    this.pendingTurnStartMessageContent = messageContent;
    return this.pendingTurnStartAttemptId;
  }

  /** Clears a start-turn request after an advanced action fails. */
  clearTurnStart(): void {
    this.isStartingTurn = false;
    this.clearTurnStartConfirmation();
  }

  /**
   * Marks an edit-and-restart request as pending.
   *
   * @param messageContent Replacement message content expected from Codex.
   * @returns Attempt identifier used by the restart response.
   */
  beginLastTurnEdit(messageContent: string): number {
    this.isEditingLastTurn = true;
    return this.beginTurnStart(true, messageContent);
  }

  /** Whether live turn events are waiting for a request response. */
  get isAwaitingTurnStartConfirmation(): boolean {
    return this.awaitingTurnStartConfirmation;
  }

  /** Checks whether a failure belongs to the currently pending start attempt. */
  isCurrentTurnStartAttempt(attemptId: number): boolean {
    return this.pendingTurnStartAttemptId === attemptId;
  }

  /** Checks whether a started message belongs to the pending request. */
  acceptsStartedMessage(content: string): boolean {
    return !this.awaitingTurnStartConfirmation ||
      this.pendingTurnStartMessageContent === null ||
      this.pendingTurnStartMessageContent === content;
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
    if (!this.awaitingTurnStartConfirmation) {
      this.isStartingTurn = false;
    }
  }

  /**
   * Classifies a turn-started event against the current runtime state.
   *
   * @param turnId Turn identifier reported by Codex.
   * @returns Event disposition for the owning chat.
   */
  observeTurnStarted(turnId: string): TurnStartEventDisposition {
    if (turnId.length === 0) {
      return "ignored";
    }

    if (this.activeTurnId !== null) {
      return this.activeTurnId === turnId ? "accepted" : "ignored";
    }

    if (this.awaitingTurnStartConfirmation) {
      return "pending";
    }

    this.acceptTurnStarted(turnId);
    return "accepted";
  }

  /**
   * Confirms a request-bound turn start using the backend response.
   *
   * @param attemptId Local start attempt identifier.
   * @param turnId Authoritative turn identifier, when returned.
   * @returns Confirmed turn id, or `null` when the response is stale/incomplete.
   */
  confirmTurnStart(attemptId: number, turnId: string | null): string | null {
    if (
      !this.awaitingTurnStartConfirmation ||
      this.pendingTurnStartAttemptId !== attemptId
    ) {
      return null;
    }

    const normalizedTurnId = turnId?.trim() ?? "";

    if (normalizedTurnId.length === 0) {
      return null;
    }

    this.acceptTurnStarted(normalizedTurnId);
    return normalizedTurnId;
  }

  /**
   * Records the runtime flags and active id for a confirmed turn start.
   *
   * @param turnId Confirmed Codex turn identifier.
   */
  applyTurnStarted(turnId: string): void {
    this.acceptTurnStarted(turnId);
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
    this.clearTurnStartConfirmation();
    this.isStartingTurn = false;
    this.isWorking = false;
    this.activeTurnId = null;
    this.pendingTurnId = null;
    this.stopStatusPolling();
  }

  /** Clears edit state after an edit request fails before turn start. */
  clearAfterEditFailure(): void {
    this.clearTurnStartConfirmation();
    this.pendingTurnId = null;
    this.isEditingLastTurn = false;
    this.isStartingTurn = false;
  }

  /** Clears both edit and start flags after the restarted turn fails. */
  clearEditStart(): void {
    this.clearTurnStartConfirmation();
    this.isStartingTurn = false;
    this.isEditingLastTurn = false;
  }

  /** Applies the state changes associated with an opened thread snapshot. */
  applyOpenedSnapshot(): void {
    const preservePendingStart = this.awaitingTurnStartConfirmation;
    this.isRefreshing = false;
    this.isSyncing = false;

    if (!preservePendingStart) {
      this.isEditingLastTurn = false;
      this.pendingTurnId = null;
    }
  }

  /** Marks the runtime idle after a validated status response. */
  applyRuntimeIdle(shouldMarkUnseen: boolean): void {
    this.clearTurnStartConfirmation();
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

  /** Clears request-bound turn correlation state without changing runtime flags. */
  private clearTurnStartConfirmation(): void {
    this.pendingTurnStartAttemptId = null;
    this.awaitingTurnStartConfirmation = false;
    this.pendingTurnStartMessageContent = null;
  }

  /** Applies the runtime state for a turn whose id is authoritative. */
  private acceptTurnStarted(turnId: string): void {
    this.clearTurnStartConfirmation();
    this.isStartingTurn = false;
    this.isEditingLastTurn = false;
    this.isWorking = true;
    this.hasUnseenCompletedTurn = false;
    this.activeTurnId = turnId;
  }
}
