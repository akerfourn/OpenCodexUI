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
  const mergedTurns = preserveLiveTurnItems(chatStore.turns, nextTurns);

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
  if (
    activity.content === undefined ||
    activity.content.trim().length === 0 ||
    isEmptyReasoningActivity(activity.kind, activity.content)
  ) {
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
    if (activity.kind === "fileChange") {
      existing.content = activity.content;
      existing.status = toMessageStatus(activity.status);
      existing.summary = activity.summary;
      existing.details = activity.details;
      return;
    }

    if (normalizeActivityContent(existing.content) === normalizeActivityContent(activity.content)) {
      existing.status = toMessageStatus(activity.status);
      return;
    }

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

function isEmptyReasoningActivity(kind: string, content: string): boolean {
  if (kind !== "reasoning") {
    return false;
  }

  const trimmedContent = content.trim();

  if (trimmedContent.length === 0) {
    return true;
  }

  if (!trimmedContent.startsWith("{")) {
    return false;
  }

  try {
    const payload = JSON.parse(trimmedContent) as unknown;
    return isEmptyReasoningPayload(payload);
  } catch {
    return false;
  }
}

function isEmptyReasoningPayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const payload = value as {
    type?: unknown;
    summary?: unknown;
    content?: unknown;
  };

  if (payload.type !== "reasoning") {
    return false;
  }

  return readReasoningText(payload.summary).length === 0 &&
    readReasoningText(payload.content).length === 0;
}

function readReasoningText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value.map((entry) => readReasoningSegmentText(entry)).join("").trim();
}

function readReasoningSegmentText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "";
  }

  const segment = value as {
    text?: unknown;
    type?: unknown;
    summary?: unknown;
    content?: unknown;
  };

  if (typeof segment.text === "string") {
    return segment.text;
  }

  if (segment.type === "reasoning") {
    return `${readReasoningText(segment.summary)}${readReasoningText(segment.content)}`;
  }

  return "";
}

function normalizeActivityContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
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
    const turn = findOrCreateTurn(chatStore, turnId);
    turn.status = "running";
    turn.startedAt = turn.startedAt ?? new Date().toISOString();
    return;
  }

  if (existingTurn !== undefined) {
    existingTurn.items = [...pendingTurn.items, ...existingTurn.items];
    existingTurn.startedAt = existingTurn.startedAt ?? pendingTurn.startedAt ?? new Date().toISOString();
    existingTurn.status = "running";
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

function preserveLiveTurnItems(
  currentTurns: OpenCodexTurn[],
  nextTurns: OpenCodexTurn[]
): OpenCodexTurn[] {
  if (currentTurns.length === 0) {
    return nextTurns;
  }

  const currentTurnsById = new Map(currentTurns.map((turn) => [turn.id, turn]));
  const nextTurnIds = new Set(nextTurns.map((turn) => turn.id));
  const mergedTurns = nextTurns.map((nextTurn) => {
    const currentTurn = currentTurnsById.get(nextTurn.id);

    if (currentTurn === undefined) {
      return nextTurn;
    }

    const currentItemsById = new Map(currentTurn.items.map((item) => [item.id, item]));
    const nextItemIds = new Set(nextTurn.items.map((item) => item.id));
    let didPreserveExistingItem = false;
    const preservedItems = nextTurn.items.map((nextItem) => {
      const currentItem = currentItemsById.get(nextItem.id);

      if (currentItem === undefined) {
        return nextItem;
      }

      const preservedItem = chooseMostCompleteLiveItem(currentItem, nextItem);
      didPreserveExistingItem = didPreserveExistingItem || preservedItem !== nextItem;
      return preservedItem;
    });
    const missingLiveItems = currentTurn.items.filter((item) => (
      shouldPreserveLiveItem(item) &&
      !nextItemIds.has(item.id)
    ));

    if (missingLiveItems.length === 0 && !didPreserveExistingItem) {
      return nextTurn;
    }

    return {
      ...nextTurn,
      items: [
        ...preservedItems,
        ...missingLiveItems
      ]
    };
  });

  const missingPendingTurns = currentTurns.filter((turn) => (
    turn.id.startsWith("pending:") &&
    !nextTurnIds.has(turn.id)
  ));

  return [
    ...mergedTurns,
    ...missingPendingTurns
  ];
}

function chooseMostCompleteLiveItem(
  currentItem: OpenCodexTurn["items"][number],
  nextItem: OpenCodexTurn["items"][number]
): OpenCodexTurn["items"][number] {
  if (!shouldPreserveLiveItem(currentItem)) {
    return nextItem;
  }

  if (currentItem.content.length > nextItem.content.length) {
    return {
      ...nextItem,
      ...currentItem
    };
  }

  return nextItem;
}

function shouldPreserveLiveItem(item: OpenCodexTurn["items"][number]): boolean {
  return (
    item.role === "activity" ||
    item.status === "streaming" ||
    (item.role === "assistant" && item.phase === "commentary")
  );
}
