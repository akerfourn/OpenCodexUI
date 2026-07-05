import type { CodexAppServerClient, CodexNotification, v2 } from "@open-codex-ui/codex-rpc";

export type CommitMessageTurnCompletionResult = {
  turn: v2.Turn;
  streamedFinalText: string | null;
};

type TurnCompletionWaiter = {
  promise: Promise<CommitMessageTurnCompletionResult>;
  dispose(): void;
};

const generationTimeoutMs = 120_000;

/**
 * Creates a waiter that resolves when the generation turn completes.
 *
 * @param client Codex app-server client producing notifications.
 * @param threadId Temporary generation thread id.
 * @param getTurnId Current generation turn id, once known.
 * @returns Disposable promise wrapper.
 */
export function createCommitMessageTurnCompletionWaiter(
  client: CodexAppServerClient,
  threadId: string,
  getTurnId: () => string | null
): TurnCompletionWaiter {
  let disposeWaiter = () => {};
  const streamedMessages = new Map<string, { phase: string | null; text: string }>();
  const promise = new Promise<CommitMessageTurnCompletionResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      disposeWaiter();
      reject(new Error("Timed out waiting for commit message generation."));
    }, generationTimeoutMs);

    const subscription = client.onNotification((notification) => {
      applyStreamingNotification(notification, threadId, getTurnId(), streamedMessages);
      const turn = readCompletedTurn(notification, threadId, getTurnId());

      if (turn === null) {
        return;
      }

      disposeWaiter();
      resolve({
        turn,
        streamedFinalText: readStreamedFinalText(streamedMessages)
      });
    });

    disposeWaiter = () => {
      clearTimeout(timeout);
      subscription.dispose();
    };
  });

  return {
    promise,
    dispose() {
      disposeWaiter();
    }
  };
}

/**
 * Reads the final assistant text from a completed generation turn.
 *
 * @param turn Completed Codex turn.
 * @returns Final answer text, or `null` when no assistant message exists.
 */
export function readFinalAgentTextOrNull(turn: v2.Turn): string | null {
  const agentMessages = turn.items.filter((item) => item.type === "agentMessage");
  const finalMessage = findFinalAgentMessage(agentMessages);

  if (finalMessage === undefined) {
    return null;
  }

  return finalMessage.text;
}

/**
 * Extracts the completed turn matching the requested thread and turn.
 *
 * @param notification Codex notification.
 * @param threadId Expected thread id.
 * @param turnId Optional expected turn id.
 * @returns Completed turn when the notification matches.
 */
function readCompletedTurn(
  notification: CodexNotification,
  threadId: string,
  turnId: string | null
): v2.Turn | null {
  if (notification.method !== "turn/completed") {
    return null;
  }

  const params = notification.params as Partial<v2.TurnCompletedNotification>;

  if (params.threadId !== threadId || params.turn === undefined) {
    return null;
  }

  if (turnId !== null && params.turn.id !== turnId) {
    return null;
  }

  return params.turn;
}

/**
 * Finds the final assistant message, falling back to the latest message.
 *
 * @param agentMessages Assistant messages from a completed turn.
 * @returns Message used as the generation answer.
 */
function findFinalAgentMessage(agentMessages: Array<Extract<v2.ThreadItem, { type: "agentMessage" }>>) {
  for (let index = agentMessages.length - 1; index >= 0; index -= 1) {
    const message = agentMessages[index];

    if (message?.phase === "final_answer") {
      return message;
    }
  }

  return agentMessages[agentMessages.length - 1];
}

/**
 * Applies live generation notifications to the streamed-message accumulator.
 *
 * @param notification Codex notification.
 * @param threadId Expected thread id.
 * @param turnId Optional expected turn id.
 * @param messages Mutable accumulator keyed by item id.
 */
function applyStreamingNotification(
  notification: CodexNotification,
  threadId: string,
  turnId: string | null,
  messages: Map<string, { phase: string | null; text: string }>
): void {
  const params = readNotificationRecord(notification.params);

  if (readNotificationString(params.threadId) !== threadId) {
    return;
  }

  const notificationTurnId = readNotificationString(params.turnId);

  if (turnId !== null && notificationTurnId !== turnId) {
    return;
  }

  if (notification.method === "item/started") {
    applyStartedItem(params, messages);
    return;
  }

  if (notification.method === "item/agentMessage/delta") {
    applyAgentMessageDelta(params, messages);
  }
}

/**
 * Registers a newly started assistant item in the stream accumulator.
 *
 * @param params Notification params.
 * @param messages Mutable accumulator keyed by item id.
 */
function applyStartedItem(
  params: Record<string, unknown>,
  messages: Map<string, { phase: string | null; text: string }>
): void {
  const item = readNotificationRecord(params.item);

  if (readNotificationString(item.type) !== "agentMessage") {
    return;
  }

  const itemId = readNotificationString(item.id);

  if (itemId.length === 0) {
    return;
  }

  messages.set(itemId, {
    phase: readNotificationString(item.phase) || null,
    text: messages.get(itemId)?.text ?? ""
  });
}

/**
 * Appends one streamed text delta to the matching assistant item.
 *
 * @param params Notification params.
 * @param messages Mutable accumulator keyed by item id.
 */
function applyAgentMessageDelta(
  params: Record<string, unknown>,
  messages: Map<string, { phase: string | null; text: string }>
): void {
  const itemId = readNotificationString(params.itemId);
  const delta = readNotificationString(params.delta);

  if (itemId.length === 0 || delta.length === 0) {
    return;
  }

  const existing = messages.get(itemId);
  messages.set(itemId, {
    phase: existing?.phase ?? null,
    text: `${existing?.text ?? ""}${delta}`
  });
}

/**
 * Reads the best final text observed through streaming notifications.
 *
 * @param messages Streamed assistant text by item id.
 * @returns Latest final-answer text, or latest non-empty text as fallback.
 */
function readStreamedFinalText(messages: Map<string, { phase: string | null; text: string }>): string | null {
  const entries = Array.from(messages.values());
  const finalEntry = findLastStreamedEntry(entries, "final_answer")
    ?? findLastStreamedEntry(entries, null);

  return finalEntry?.text ?? null;
}

/**
 * Finds the latest non-empty streamed entry matching a phase.
 *
 * @param entries Streamed message entries in insertion order.
 * @param phase Required phase, or `null` for any phase.
 * @returns Matching entry, or `null`.
 */
function findLastStreamedEntry(
  entries: Array<{ phase: string | null; text: string }>,
  phase: string | null
): { phase: string | null; text: string } | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry === undefined || entry.text.trim().length === 0) {
      continue;
    }

    if (phase === null || entry.phase === phase) {
      return entry;
    }
  }

  return null;
}

/**
 * Safely reads object-like notification params.
 *
 * @param value Raw notification value.
 * @returns Plain record or an empty object.
 */
function readNotificationRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

/**
 * Safely reads a string from notification params.
 *
 * @param value Raw notification value.
 * @returns String value or an empty string.
 */
function readNotificationString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
