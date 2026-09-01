/** Correlates live Codex turn events with the turn currently owned by a chat. */
import type {
  OpenCodexActivity,
  OpenCodexMessagePhase
} from "@open-codex-ui/opencodex-protocol";

import type { ChatRuntimeStore } from "./ChatRuntimeStore";
import type { ChatTimelineStore } from "./ChatTimelineStore";

type PendingLiveEvent =
  | {
      type: "message.delta";
      turnId: string;
      messageId: string;
      delta: string;
      phase: OpenCodexMessagePhase | null;
    }
  | {
      type: "activity.updated";
      turnId: string;
      activity: OpenCodexActivity;
    };

export type PendingTurnCompletion = {
  turnId: string;
  durationMs: number | null;
  turnStatus?: string;
  errorMessage?: string;
};

const MAX_PENDING_LIVE_EVENTS = 256;
const MAX_PENDING_TURN_COMPLETIONS = 16;
const MAX_COMPLETED_TURN_IDS = 32;

/** Owns live event buffering and turn ownership checks for one chat. */
export class ChatLiveTurnEventsStore {
  /** Events waiting for the authoritative start response. */
  private pendingLiveEvents: PendingLiveEvent[] = [];
  /** Terminal events waiting for the authoritative start response. */
  private pendingTurnCompletions: PendingTurnCompletion[] = [];
  /** Recently completed turns whose late lifecycle events must be ignored. */
  private completedTurnIds: string[] = [];

  /**
   * Creates a live event store for one chat timeline.
   *
   * @param timeline Timeline mutated after event ownership is established.
   * @param runtime Runtime state used to classify turn ownership.
   */
  constructor(
    private readonly timeline: ChatTimelineStore,
    private readonly runtime: ChatRuntimeStore
  ) {}

  /** Applies a turn-started event when it is not stale. */
  applyTurnStarted(turnId: string): void {
    if (this.isStaleCompletedTurn(turnId)) {
      return;
    }

    const disposition = this.runtime.observeTurnStarted(turnId);

    if (disposition !== "accepted") {
      return;
    }

    this.promoteStartedTurn(turnId);
  }

  /** Remembers a terminal turn so a late start event cannot resurrect it. */
  markTurnCompleted(turnId: string): void {
    if (this.completedTurnIds.includes(turnId)) {
      return;
    }

    if (this.completedTurnIds.length >= MAX_COMPLETED_TURN_IDS) {
      this.completedTurnIds.shift();
    }

    this.completedTurnIds.push(turnId);
  }

  /**
   * Confirms a request-bound turn and replays only its retained events.
   *
   * @param attemptId Local request attempt identifier.
   * @param turnId Authoritative turn id returned by the backend.
   * @returns A matching completion waiting to be applied, or `null`.
   */
  confirmTurnStarted(
    attemptId: number,
    turnId: string | null
  ): PendingTurnCompletion | null {
    const confirmedTurnId = this.runtime.confirmTurnStart(attemptId, turnId);

    if (confirmedTurnId === null) {
      return null;
    }

    this.promoteStartedTurn(confirmedTurnId);
    this.flushPendingLiveEvents(confirmedTurnId);

    const completionIndex = this.pendingTurnCompletions.findIndex((completion) => (
      completion.turnId === confirmedTurnId
    ));
    const completion = completionIndex === -1
      ? null
      : this.pendingTurnCompletions[completionIndex] ?? null;

    // A request-bound start can have only one legitimate terminal event. Any
    // completion for another turn belongs to the stale event stream and must
    // not survive into a later request.
    this.pendingTurnCompletions = [];

    return completion;
  }

  /** Applies a streamed assistant delta after checking turn ownership. */
  applyMessageDelta(
    turnId: string,
    messageId: string,
    delta: string,
    phase: OpenCodexMessagePhase | null
  ): void {
    const disposition = this.classifyLiveTurnEvent(turnId);

    if (disposition === "buffer") {
      this.queuePendingLiveEvent({ type: "message.delta", turnId, messageId, delta, phase });
      return;
    }

    if (disposition === "ignore") {
      return;
    }

    this.timeline.appendAssistantDelta(turnId, messageId, delta, phase);
  }

  /** Applies a live activity update after checking turn ownership. */
  applyActivityUpdated(activity: OpenCodexActivity): void {
    const turnId = activity.title?.trim() ||
      this.runtime.activeTurnId ||
      this.runtime.pendingTurnId;

    if (turnId === undefined || turnId === null || turnId.length === 0) {
      return;
    }

    const disposition = this.classifyLiveTurnEvent(turnId);

    if (disposition === "buffer") {
      this.queuePendingLiveEvent({ type: "activity.updated", turnId, activity });
      return;
    }

    if (disposition === "ignore") {
      return;
    }

    this.timeline.applyActivityUpdated(
      activity,
      this.runtime.activeTurnId,
      this.runtime.pendingTurnId
    );
  }

  /** Retains a terminal event until the request identifies its turn. */
  deferTurnCompletion(completion: PendingTurnCompletion): boolean {
    if (!this.runtime.isAwaitingTurnStartConfirmation || this.runtime.activeTurnId !== null) {
      return false;
    }

    if (this.pendingTurnCompletions.length >= MAX_PENDING_TURN_COMPLETIONS) {
      this.pendingTurnCompletions.shift();
    }

    this.pendingTurnCompletions.push(completion);
    return true;
  }

  /** Discards all events retained for a request that cannot be applied. */
  discard(): void {
    this.pendingLiveEvents = [];
    this.pendingTurnCompletions = [];
  }

  /** Promotes the optimistic turn after an authoritative turn id is known. */
  private promoteStartedTurn(turnId: string): void {
    this.runtime.applyTurnStarted(turnId);
    const pendingTurnId = this.timeline.movePendingTurnToStartedTurn(
      turnId,
      this.runtime.pendingTurnId
    );
    this.runtime.finalizeTurnStarted(pendingTurnId);
  }

  /** Classifies a live event using the current chat turn ownership. */
  private classifyLiveTurnEvent(
    turnId: string
  ): "accept" | "buffer" | "ignore" {
    if (this.runtime.activeTurnId === turnId) {
      return "accept";
    }

    if (this.runtime.isAwaitingTurnStartConfirmation) {
      return "buffer";
    }

    const existingTurn = this.timeline.turns.find((turn) => turn.id === turnId);

    return existingTurn?.status === "running" ? "accept" : "ignore";
  }

  /** Rejects a late start event for a turn already known to be terminal. */
  private isStaleCompletedTurn(turnId: string): boolean {
    if (
      this.runtime.activeTurnId !== null ||
      this.runtime.isAwaitingTurnStartConfirmation
    ) {
      return false;
    }

    return this.completedTurnIds.includes(turnId);
  }

  /** Retains a bounded live event until the request identifies its turn. */
  private queuePendingLiveEvent(event: PendingLiveEvent): void {
    if (this.pendingLiveEvents.length >= MAX_PENDING_LIVE_EVENTS) {
      this.pendingLiveEvents.shift();
    }

    this.pendingLiveEvents.push(event);
  }

  /** Replays only events belonging to the confirmed turn in arrival order. */
  private flushPendingLiveEvents(turnId: string): void {
    const pendingEvents = this.pendingLiveEvents;
    this.pendingLiveEvents = [];

    for (const event of pendingEvents) {
      if (event.turnId !== turnId) {
        continue;
      }

      if (event.type === "message.delta") {
        this.timeline.appendAssistantDelta(
          event.turnId,
          event.messageId,
          event.delta,
          event.phase
        );
        continue;
      }

      this.timeline.applyActivityUpdated(
        event.activity,
        this.runtime.activeTurnId,
        this.runtime.pendingTurnId
      );
    }
  }
}
