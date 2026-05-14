import type { OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";

/**
 * Returns the items that belong in the collapsible prelude block.
 *
 * @param items Turn items.
 *
 * @returns Prelude items without duplicated final-answer content.
 */
export function getPreludeItems(items: OpenCodexTurnItem[]): OpenCodexTurnItem[] {
  const finalAssistantContents = new Set(
    items
      .filter((item) => item.role === "assistant" && item.phase === "final_answer")
      .map((item) => normalizeContent(item.content))
      .filter((content) => content.length > 0)
  );

  return items.filter((item) => isPreludeItemWithFinals(item, finalAssistantContents));
}

/**
 * Checks whether an item is part of the collapsible prelude block.
 *
 * @param item Turn item.
 *
 * @returns `true` when the item is an activity or commentary item.
 */
export function isPreludeItem(item: OpenCodexTurnItem): boolean {
  return isPreludeItemWithFinals(item, new Set());
}

function isPreludeItemWithFinals(
  item: OpenCodexTurnItem,
  finalAssistantContents: Set<string>
): boolean {
  if (item.role === "activity") {
    return !isEmptyReasoningActivity(item);
  }

  if (item.role !== "assistant" || item.phase !== "commentary") {
    return false;
  }

  const content = normalizeContent(item.content);
  return content.length === 0 || !finalAssistantContents.has(content);
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

  return value
    .map((entry) => readReasoningSegmentText(entry))
    .join("")
    .trim();
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
