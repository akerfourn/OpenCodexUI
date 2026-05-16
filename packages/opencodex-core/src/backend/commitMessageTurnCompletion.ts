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

export function readFinalAgentTextOrNull(turn: v2.Turn): string | null {
  const agentMessages = turn.items.filter((item) => item.type === "agentMessage");
  const finalMessage = findFinalAgentMessage(agentMessages);

  if (finalMessage === undefined) {
    return null;
  }

  return finalMessage.text;
}

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

function findFinalAgentMessage(agentMessages: Array<Extract<v2.ThreadItem, { type: "agentMessage" }>>) {
  for (let index = agentMessages.length - 1; index >= 0; index -= 1) {
    const message = agentMessages[index];

    if (message?.phase === "final_answer") {
      return message;
    }
  }

  return agentMessages[agentMessages.length - 1];
}

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

function readStreamedFinalText(messages: Map<string, { phase: string | null; text: string }>): string | null {
  const entries = Array.from(messages.values());
  const finalEntry = findLastStreamedEntry(entries, "final_answer")
    ?? findLastStreamedEntry(entries, null);

  return finalEntry?.text ?? null;
}

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

function readNotificationRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readNotificationString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
