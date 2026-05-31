import type { OpenCodexTurn, OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";

export type ChatSubTurn = {
  id: string;
  userMessage: OpenCodexTurnItem | null;
  reasoningItems: OpenCodexTurnItem[];
};

export type ChatTurnStructure = {
  subTurns: ChatSubTurn[];
  finalAnswer: OpenCodexTurnItem | null;
};

export function buildChatTurnStructure(turn: OpenCodexTurn): ChatTurnStructure {
  const finalAnswer = findFinalAnswerItem(turn.items);
  const finalAnswerContent = finalAnswer === null ? "" : normalizeContent(finalAnswer.content);
  const subTurns: ChatSubTurn[] = [];
  let currentSubTurn: ChatSubTurn | null = null;
  let orphanIndex = 0;

  for (const item of turn.items) {
    if (item === finalAnswer) {
      continue;
    }

    if (item.role === "user") {
      currentSubTurn = {
        id: buildSubTurnId(turn.id, item.id, subTurns.length),
        userMessage: item,
        reasoningItems: []
      };
      subTurns.push(currentSubTurn);
      continue;
    }

    if (!isReasoningItem(item, finalAnswerContent)) {
      continue;
    }

    if (currentSubTurn === null) {
      currentSubTurn = {
        id: buildSubTurnId(turn.id, `orphan-${orphanIndex}`, subTurns.length),
        userMessage: null,
        reasoningItems: []
      };
      orphanIndex += 1;
      subTurns.push(currentSubTurn);
    }

    currentSubTurn.reasoningItems.push(item);
  }

  return {
    subTurns,
    finalAnswer
  };
}

function findFinalAnswerItem(items: OpenCodexTurnItem[]): OpenCodexTurnItem | null {
  const explicitFinalAnswer = findLastItem(items, (item) => (
    item.role === "assistant" && item.phase === "final_answer"
  ));

  if (explicitFinalAnswer !== null) {
    return explicitFinalAnswer;
  }

  return findLastItem(items, (item) => (
    item.role === "assistant" && item.phase !== "commentary"
  ));
}

function findLastItem(
  items: OpenCodexTurnItem[],
  predicate: (item: OpenCodexTurnItem) => boolean
): OpenCodexTurnItem | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (item !== undefined && predicate(item)) {
      return item;
    }
  }

  return null;
}

function isReasoningItem(item: OpenCodexTurnItem, finalAnswerContent: string): boolean {
  if (item.role === "activity") {
    return !isEmptyReasoningActivity(item);
  }

  if (item.role !== "assistant") {
    return false;
  }

  if (item.phase === "final_answer") {
    return false;
  }

  const content = normalizeContent(item.content);

  if (item.phase === "commentary" && finalAnswerContent.length > 0) {
    return content.length === 0 || content !== finalAnswerContent;
  }

  return content.length > 0;
}

function buildSubTurnId(turnId: string, itemId: string, index: number): string {
  return ["subTurn", turnId, itemId, index].join(":");
}

function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

function isEmptyReasoningActivity(item: OpenCodexTurnItem): boolean {
  if (item.kind !== "reasoning") {
    return false;
  }

  const content = item.content.trim();

  if (content.length === 0) {
    return true;
  }

  if (!content.startsWith("{")) {
    return false;
  }

  try {
    return isEmptyReasoningPayload(JSON.parse(content) as unknown);
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
