import type { OpenCodexTurn, OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";

export type ChatSubTurn = {
  id: string;
  userMessage: OpenCodexTurnItem | null;
  reasoningItems: OpenCodexTurnItem[];
  assistantAnswer: OpenCodexTurnItem | null;
};

export type ChatTurnStructure = {
  subTurns: ChatSubTurn[];
  finalAnswer: OpenCodexTurnItem | null;
  hasOpenSubTurn: boolean;
};

export function buildChatTurnStructure(turn: OpenCodexTurn): ChatTurnStructure {
  const finalAnswerItems = findFinalAnswerItems(turn.items);
  const finalAnswer = finalAnswerItems[finalAnswerItems.length - 1] ?? null;
  const finalAnswerContents = new Set(finalAnswerItems.map((item) => normalizeContent(item.content)));
  const subTurns: ChatSubTurn[] = [];
  let currentSubTurn: ChatSubTurn | null = null;
  let hasSeenUserMessage = false;
  let orphanIndex = 0;

  for (const item of turn.items) {
    if (item.role === "user") {
      const userMessage = createUserSubTurnMessage(item, hasSeenUserMessage);

      currentSubTurn = {
        id: buildSubTurnId(turn.id, userMessage.id, subTurns.length),
        userMessage,
        reasoningItems: [],
        assistantAnswer: null
      };
      hasSeenUserMessage = true;
      subTurns.push(currentSubTurn);
      continue;
    }

    if (isAssistantAnswerItem(item, finalAnswerItems)) {
      currentSubTurn = ensureSubTurn(turn.id, subTurns, currentSubTurn, orphanIndex);

      if (currentSubTurn.userMessage === null) {
        orphanIndex += 1;
      }

      currentSubTurn.assistantAnswer = item;
      continue;
    }

    if (!isReasoningItem(item, finalAnswerContents)) {
      continue;
    }

    if (currentSubTurn === null || currentSubTurn.assistantAnswer !== null) {
      currentSubTurn = createOrphanSubTurn(turn.id, subTurns.length, orphanIndex);
      orphanIndex += 1;
      subTurns.push(currentSubTurn);
    }

    currentSubTurn.reasoningItems.push(item);
  }

  return {
    subTurns,
    finalAnswer,
    hasOpenSubTurn: subTurns.some((subTurn) => subTurn.assistantAnswer === null)
  };
}

function findFinalAnswerItems(items: OpenCodexTurnItem[]): OpenCodexTurnItem[] {
  const explicitFinalAnswers = items.filter((item) => (
    item.role === "assistant" && item.phase === "final_answer"
  ));

  if (explicitFinalAnswers.length > 0) {
    return explicitFinalAnswers;
  }

  const legacyFinalAnswer = findLastItem(items, (item) => (
    item.role === "assistant" && item.phase !== "commentary"
  ));

  return legacyFinalAnswer === null ? [] : [legacyFinalAnswer];
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

function isAssistantAnswerItem(
  item: OpenCodexTurnItem,
  finalAnswerItems: OpenCodexTurnItem[]
): boolean {
  return finalAnswerItems.includes(item);
}

function isReasoningItem(item: OpenCodexTurnItem, finalAnswerContents: Set<string>): boolean {
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

  if (item.phase === "commentary" && finalAnswerContents.size > 0) {
    return content.length === 0 || !finalAnswerContents.has(content);
  }

  return content.length > 0;
}

function ensureSubTurn(
  turnId: string,
  subTurns: ChatSubTurn[],
  currentSubTurn: ChatSubTurn | null,
  orphanIndex: number
): ChatSubTurn {
  if (currentSubTurn !== null && currentSubTurn.assistantAnswer === null) {
    return currentSubTurn;
  }

  const subTurn = createOrphanSubTurn(turnId, subTurns.length, orphanIndex);
  subTurns.push(subTurn);
  return subTurn;
}

function createOrphanSubTurn(turnId: string, subTurnIndex: number, orphanIndex: number): ChatSubTurn {
  return {
    id: buildSubTurnId(turnId, `orphan-${orphanIndex}`, subTurnIndex),
    userMessage: null,
    reasoningItems: [],
    assistantAnswer: null
  };
}

function createUserSubTurnMessage(
  item: OpenCodexTurnItem,
  isAdditionalUserMessage: boolean
): OpenCodexTurnItem {
  if (!isAdditionalUserMessage || item.kind === "steer") {
    return item;
  }

  return {
    ...item,
    kind: "steer"
  };
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
