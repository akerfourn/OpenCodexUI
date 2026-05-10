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

/**
 * Converts Codex app-server notifications into UI events.
 */
export class NotificationService {
  private readonly assistantMessagePhases = new Map<string, OpenCodexMessagePhase | null>();

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

    if (activity !== null && this.options.getSettings().showActivityPanel) {
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
      this.options.emit({ type: "message.delta", threadId, turnId, messageId, delta, phase });
    }
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

    if (threadId.length > 0 && messageId.length > 0) {
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
      this.options.emit({ type: "turn.completed", threadId, turnId, durationMs });
      this.options.syncCompletedTurn(threadId);
    }
  }
}
