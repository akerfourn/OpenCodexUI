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
    return true;
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
