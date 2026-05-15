import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexMessagePhase,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import {
  createActivityFromNotification,
  readMessagePhase,
  readObject,
  readNullableNumber,
  readString
} from "../mapping.js";
import { createAssistantMessagePhaseKey } from "./turnInput.js";

export type NotificationServiceOptions = {
  getSettings(): OpenCodexSettings;
  emit(event: OpenCodexEvent): void;
  applyCodexThreadTitle(threadId: string, title: string): void;
  syncCompletedTurn(threadId: string): void;
};

const ASSISTANT_DELTA_BATCH_MS = 20;

type PendingAssistantDelta = {
  sourceId: string;
  threadId: string;
  turnId: string;
  messageId: string;
  phase: OpenCodexMessagePhase | null;
  delta: string;
  timeout: ReturnType<typeof setTimeout>;
};

/**
 * Converts Codex app-server notifications into UI events.
 */
export class NotificationService {
  private readonly assistantMessagePhases = new Map<string, OpenCodexMessagePhase | null>();
  private readonly pendingAssistantDeltas = new Map<string, PendingAssistantDelta>();

  constructor(private readonly options: NotificationServiceOptions) {}

  /**
   * Handles one Codex notification.
   *
   * @param notification Notification payload.
   * @param sourceId Source that produced the notification.
   *
   * @returns Nothing.
   */
  handleNotification(notification: CodexNotification, sourceId: string): void {
    const activity = createActivityFromNotification(notification);

    if (activity !== null) {
      this.options.emit({ type: "activity.updated", threadId: activity.threadId, activity });
    }

    const params = readObject(notification.params);

    if (notification.method === "item/agentMessage/delta") {
      this.handleAgentMessageDelta(params, sourceId);
    }

    if (notification.method === "item/started") {
      this.handleItemStarted(params, sourceId);
    }

    if (notification.method === "item/completed") {
      this.handleItemCompleted(params, sourceId);
    }

    if (notification.method === "turn/started") {
      this.handleTurnStarted(params);
    }

    if (notification.method === "turn/completed") {
      this.handleTurnCompleted(params);
    }

    if (notification.method === "thread/name/updated") {
      const threadId = readString(params.threadId);
      const name = readString(params.name);

      if (threadId.length > 0) {
        this.options.applyCodexThreadTitle(threadId, name);
      }
    }
  }

  /**
   * Emits assistant text deltas for streaming agent messages.
   *
   * @param params Notification parameters.
   * @param sourceId Source that produced the notification.
   *
   * @returns Nothing.
   */
  private handleAgentMessageDelta(params: Record<string, unknown>, sourceId: string): void {
    const threadId = readString(params.threadId);
    const turnId = readString(params.turnId);
    const messageId = readString(params.itemId);
    const delta = readString(params.delta);
    const phaseKey = createAssistantMessagePhaseKey(sourceId, threadId, messageId);
    const phase = this.assistantMessagePhases.get(phaseKey) ?? null;

    if (threadId.length > 0 && turnId.length > 0 && messageId.length > 0 && delta.length > 0) {
      this.enqueueAssistantDelta(sourceId, threadId, turnId, messageId, delta, phase);
    }
  }

  private enqueueAssistantDelta(
    sourceId: string,
    threadId: string,
    turnId: string,
    messageId: string,
    delta: string,
    phase: OpenCodexMessagePhase | null
  ): void {
    const key = createPendingAssistantDeltaKey(sourceId, threadId, turnId, messageId, phase);
    const existing = this.pendingAssistantDeltas.get(key);

    if (existing !== undefined) {
      existing.delta += delta;
      return;
    }

    const pendingDelta: PendingAssistantDelta = {
      sourceId,
      threadId,
      turnId,
      messageId,
      delta,
      phase,
      timeout: setTimeout(() => {
        this.flushPendingAssistantDelta(key);
      }, ASSISTANT_DELTA_BATCH_MS)
    };

    this.pendingAssistantDeltas.set(key, pendingDelta);
  }

  /**
   * Tracks assistant message phase metadata when an item starts.
   *
   * @param params Notification parameters.
   * @param sourceId Source that produced the notification.
   *
   * @returns Nothing.
   */
  private handleItemStarted(params: Record<string, unknown>, sourceId: string): void {
    const threadId = readString(params.threadId);
    const item = readObject(params.item);

    if (readString(item.type) !== "agentMessage") {
      return;
    }

    const messageId = readString(item.id);
    const phase = readMessagePhase(item.phase);

    if (threadId.length > 0 && messageId.length > 0) {
      this.assistantMessagePhases.set(
        createAssistantMessagePhaseKey(sourceId, threadId, messageId),
        phase
      );
    }
  }

  /**
   * Clears tracked assistant message phase metadata when an item completes.
   *
   * @param params Notification parameters.
   * @param sourceId Source that produced the notification.
   *
   * @returns Nothing.
   */
  private handleItemCompleted(params: Record<string, unknown>, sourceId: string): void {
    const threadId = readString(params.threadId);
    const item = readObject(params.item);

    if (readString(item.type) !== "agentMessage") {
      return;
    }

    const messageId = readString(item.id);
    const turnId = readString(params.turnId);

    if (threadId.length > 0 && messageId.length > 0) {
      this.flushPendingAssistantDeltas(sourceId, threadId, turnId, messageId);
      this.assistantMessagePhases.delete(createAssistantMessagePhaseKey(sourceId, threadId, messageId));
    }
  }

  /**
   * Emits a turn-started event.
   *
   * @param params Notification parameters.
   *
   * @returns Nothing.
   */
  private handleTurnStarted(params: Record<string, unknown>): void {
    const threadId = readString(params.threadId);
    const turnId = readString(readObject(params.turn).id);

    if (threadId.length > 0 && turnId.length > 0) {
      this.options.emit({ type: "turn.started", threadId, turnId });
    }
  }

  /**
   * Emits a turn-completed event.
   *
   * @param params Notification parameters.
   *
   * @returns Nothing.
   */
  private handleTurnCompleted(params: Record<string, unknown>): void {
    const threadId = readString(params.threadId);
    const turnId = readString(readObject(params.turn).id);
    const durationMs = readNullableNumber(readObject(params.turn).durationMs);

    if (threadId.length > 0 && turnId.length > 0) {
      this.flushPendingAssistantDeltas(null, threadId, turnId, null);
      this.options.emit({ type: "turn.completed", threadId, turnId, durationMs });
      this.options.syncCompletedTurn(threadId);
    }
  }

  private flushPendingAssistantDeltas(
    sourceId: string | null,
    threadId: string,
    turnId: string,
    messageId: string | null
  ): void {
    const pendingKeys = Array.from(this.pendingAssistantDeltas.entries())
      .filter(([, pendingDelta]) => (
        (sourceId === null || pendingDelta.sourceId === sourceId) &&
        pendingDelta.threadId === threadId &&
        pendingDelta.turnId === turnId &&
        (messageId === null || pendingDelta.messageId === messageId)
      ))
      .map(([key]) => key);

    for (const key of pendingKeys) {
      this.flushPendingAssistantDelta(key);
    }
  }

  private flushPendingAssistantDelta(key: string): void {
    const pendingDelta = this.pendingAssistantDeltas.get(key);

    if (pendingDelta === undefined) {
      return;
    }

    clearTimeout(pendingDelta.timeout);
    this.pendingAssistantDeltas.delete(key);
    this.options.emit({
      type: "message.delta",
      threadId: pendingDelta.threadId,
      turnId: pendingDelta.turnId,
      messageId: pendingDelta.messageId,
      delta: pendingDelta.delta,
      phase: pendingDelta.phase
    });
  }
}

function createPendingAssistantDeltaKey(
  sourceId: string,
  threadId: string,
  turnId: string,
  messageId: string,
  phase: OpenCodexMessagePhase | null
): string {
  return [sourceId, threadId, turnId, messageId, phase ?? ""].join("\u0000");
}
