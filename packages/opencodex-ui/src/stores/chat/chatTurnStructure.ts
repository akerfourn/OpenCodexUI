import type { OpenCodexTurn, OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";

/**
 * One user-guidance segment inside a Codex turn.
 */
export type ChatSubTurn = {
  id: string;
  userMessage: OpenCodexTurnItem | null;
  reasoningItems: OpenCodexTurnItem[];
  assistantAnswer: OpenCodexTurnItem | null;
};

/**
 * UI-oriented decomposition of a Codex turn.
 */
export type ChatTurnStructure = {
  subTurns: ChatSubTurn[];
  finalAnswer: OpenCodexTurnItem | null;
  hasOpenSubTurn: boolean;
};

/**
 * Builds the UI structure for one turn from its flat Codex items.
 *
 * @param turn Structured turn DTO.
 * @returns Sub-turns and final answer extracted for rendering.
 */
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

    if (currentSubTurn === null) {
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

/**
 * Finds assistant items that represent final answers.
 *
 * @param items Flat turn items.
 * @returns Explicit or legacy final answer items.
 */
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

/**
 * Finds the last item matching a predicate.
 *
 * @param items Items to inspect.
 * @param predicate Item predicate.
 * @returns Last matching item, or `null`.
 */
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

/**
 * Checks whether an item is part of the final answer set.
 *
 * @param item Item to check.
 * @param finalAnswerItems Final answer item identities.
 * @returns Whether the item is a final answer.
 */
function isAssistantAnswerItem(
  item: OpenCodexTurnItem,
  finalAnswerItems: OpenCodexTurnItem[]
): boolean {
  return finalAnswerItems.includes(item);
}

/**
 * Checks whether a turn item should appear in a reasoning block.
 *
 * @param item Item to classify.
 * @param finalAnswerContents Normalized final answer contents used for de-duplication.
 * @returns Whether the item is reasoning/activity content.
 */
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

/**
 * Returns the current open sub-turn or creates an orphan one.
 *
 * @param turnId Turn identifier.
 * @param subTurns Existing sub-turns.
 * @param currentSubTurn Current candidate.
 * @param orphanIndex Orphan sub-turn counter.
 * @returns Sub-turn that can receive more items.
 */
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

/**
 * Creates a sub-turn without a user message for recovered/partial data.
 *
 * @param turnId Turn identifier.
 * @param subTurnIndex Sub-turn index.
 * @param orphanIndex Orphan counter.
 * @returns Empty orphan sub-turn.
 */
function createOrphanSubTurn(turnId: string, subTurnIndex: number, orphanIndex: number): ChatSubTurn {
  return {
    id: buildSubTurnId(turnId, `orphan-${orphanIndex}`, subTurnIndex),
    userMessage: null,
    reasoningItems: [],
    assistantAnswer: null
  };
}

/**
 * Marks additional user messages as steering messages when Codex did not.
 *
 * @param item User turn item.
 * @param isAdditionalUserMessage Whether another user message already opened the turn.
 * @returns User item with preserved or inferred kind.
 */
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

/**
 * Builds a stable sub-turn identifier.
 *
 * @param turnId Parent turn identifier.
 * @param itemId Anchor item identifier.
 * @param index Sub-turn index.
 * @returns Stable sub-turn id.
 */
function buildSubTurnId(turnId: string, itemId: string, index: number): string {
  return ["subTurn", turnId, itemId, index].join(":");
}

/**
 * Normalizes text for content-based comparisons.
 *
 * @param content Raw content.
 * @returns Trimmed content with collapsed whitespace.
 */
function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

/**
 * Detects empty serialized reasoning activities.
 *
 * @param item Activity turn item.
 * @returns Whether the activity should be hidden.
 */
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

/**
 * Checks whether a parsed reasoning payload has no displayable text.
 *
 * @param value Parsed payload.
 * @returns Whether summary and content are empty.
 */
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

/**
 * Reads display text from a reasoning segment array.
 *
 * @param value Raw summary/content value.
 * @returns Concatenated reasoning text.
 */
function readReasoningText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value.map((entry) => readReasoningSegmentText(entry)).join("").trim();
}

/**
 * Reads text from one reasoning segment.
 *
 * @param value Raw segment.
 * @returns Segment text.
 */
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
