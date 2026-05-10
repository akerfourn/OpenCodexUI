import type {
  OpenCodexActivity,
  OpenCodexMessage,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "./ChatStore";
import type { RootStore } from "./RootStore";
import {
  findFirstChangedTurnIndex,
  toMessageStatus,
  toTurnItem
} from "./chatTurnUtils";

export function applyThreadTurns(
  chatStore: ChatStore,
  root: RootStore,
  nextTurns: OpenCodexTurn[],
  strategy: "replace" | "merge",
  source: string
): void {
  const mergedTurns = preserveLiveActivityItems(chatStore.turns, nextTurns);

  if (strategy === "replace" || chatStore.turns.length === 0) {
    chatStore.turns = mergedTurns;
    root.logStorePopulation(chatStore.thread.id, source, mergedTurns.length, true, 0);
    return;
  }

  const firstChangedIndex = findFirstChangedTurnIndex(chatStore.turns, mergedTurns);

  if (firstChangedIndex === null) {
    root.logStorePopulation(chatStore.thread.id, source, mergedTurns.length, false, null);
    return;
  }

  chatStore.turns = [
    ...chatStore.turns.slice(0, firstChangedIndex),
    ...mergedTurns.slice(firstChangedIndex)
  ];
  root.logStorePopulation(chatStore.thread.id, source, mergedTurns.length, true, firstChangedIndex);
}

export function appendActivityItem(chatStore: ChatStore, activity: OpenCodexActivity): void {
  if (activity.content === undefined) {
    return;
  }

  const turnId = activity.title ?? chatStore.activeTurnId ?? chatStore.pendingTurnId;

  if (turnId === null || turnId.length === 0) {
    return;
  }

  const turn = findOrCreateTurn(chatStore, turnId);
  const existing = turn.items.find((item) => item.id === activity.id);
  turn.status = "running";

  if (existing !== undefined) {
    existing.content += activity.content;
    existing.status = toMessageStatus(activity.status);
    return;
  }

  turn.items.push({
    id: activity.id,
    role: "activity",
    content: activity.content,
    status: toMessageStatus(activity.status),
    createdAt: new Date().toISOString(),
    kind: activity.kind,
    summary: activity.summary,
    details: activity.details
  });
}

export function applyTurnDuration(
  chatStore: ChatStore,
  turnId: string,
  durationMs: number | null
): void {
  if (durationMs === null) {
    return;
  }

  const turn = chatStore.turns.find((entry) => entry.id === turnId);

  if (turn !== undefined) {
    turn.durationMs = durationMs;
  }
}

export function upsertPendingUserTurn(chatStore: ChatStore, message: OpenCodexMessage): void {
  const existingTurn = findPendingUserTurn(chatStore, message.content);

  if (existingTurn !== null) {
    existingTurn.threadId = chatStore.thread.id;
    return;
  }

  const turn = findOrCreateTurn(chatStore, `pending:${message.id}`);
  turn.items.push(toTurnItem(message));
  chatStore.pendingTurnId = turn.id;
}

export function movePendingTurnToStartedTurn(chatStore: ChatStore, turnId: string): void {
  const pendingTurn = findPendingTurn(chatStore);
  const existingTurn = chatStore.turns.find((turn) => turn.id === turnId);

  if (pendingTurn === undefined) {
    findOrCreateTurn(chatStore, turnId);
    return;
  }

  if (existingTurn !== undefined) {
    existingTurn.items = [...pendingTurn.items, ...existingTurn.items];
    chatStore.turns = chatStore.turns.filter((turn) => turn !== pendingTurn);
    return;
  }

  pendingTurn.id = turnId;
  pendingTurn.threadId = chatStore.thread.id;
  pendingTurn.status = "running";
  pendingTurn.startedAt = pendingTurn.startedAt ?? new Date().toISOString();
  chatStore.pendingTurnId = null;
}

export function findOrCreateTurn(chatStore: ChatStore, turnId: string): OpenCodexTurn {
  const existing = chatStore.turns.find((turn) => turn.id === turnId);

  if (existing !== undefined) {
    return existing;
  }

  const created: OpenCodexTurn = {
    id: turnId,
    threadId: chatStore.thread.id,
    status: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    items: []
  };

  chatStore.turns.push(created);
  return created;
}

function findPendingTurn(chatStore: ChatStore): OpenCodexTurn | undefined {
  if (chatStore.pendingTurnId !== null) {
    return chatStore.turns.find((turn) => turn.id === chatStore.pendingTurnId);
  }

  return chatStore.turns.find((turn) => turn.id.startsWith("pending:"));
}

function findPendingUserTurn(chatStore: ChatStore, content: string): OpenCodexTurn | null {
  const pendingTurn = findPendingTurn(chatStore);

  if (pendingTurn === undefined) {
    return null;
  }

  const pendingUserItem = pendingTurn.items.find((item) => item.role === "user");

  if (pendingUserItem?.content !== content) {
    return null;
  }

  return pendingTurn;
}

function preserveLiveActivityItems(
  currentTurns: OpenCodexTurn[],
  nextTurns: OpenCodexTurn[]
): OpenCodexTurn[] {
  if (currentTurns.length === 0 || nextTurns.length === 0) {
    return nextTurns;
  }

  const currentTurnsById = new Map(currentTurns.map((turn) => [turn.id, turn]));

  return nextTurns.map((nextTurn) => {
    const currentTurn = currentTurnsById.get(nextTurn.id);

    if (currentTurn === undefined) {
      return nextTurn;
    }

    const nextItemIds = new Set(nextTurn.items.map((item) => item.id));
    const missingLiveActivities = currentTurn.items.filter((item) => (
      item.role === "activity" &&
      !nextItemIds.has(item.id)
    ));

    if (missingLiveActivities.length === 0) {
      return nextTurn;
    }

    return {
      ...nextTurn,
      items: [
        ...nextTurn.items,
        ...missingLiveActivities
      ]
    };
  });
}
