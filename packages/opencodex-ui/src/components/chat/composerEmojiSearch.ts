/** Reads and replaces inline `::emoji` triggers in the chat composer. */
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalNode,
  type NodeKey
} from "lexical";

import {
  getComposerEmojiAliases,
  getComposerEmojis,
  normalizeComposerEmojiSearchText,
  COMPOSER_EMOJI_CATEGORIES
} from "./composerEmojis";
import type { OpenCodexEmojiCatalogOverrides } from "@open-codex-ui/opencodex-protocol";

export type EmojiTriggerState = {
  nodeKey: NodeKey;
  startOffset: number;
  endOffset: number;
  query: string;
};

const EMOJI_CATEGORY_ALIASES: Record<keyof typeof COMPOSER_EMOJI_CATEGORIES, readonly string[]> = {
  emotions: ["émotion", "émotions", "sentiment", "sentiments", "emotion", "feelings"],
  reactions: ["réaction", "réactions", "reaction", "reactions", "réponse", "feedback"]
};

/**
 * Reads an inline emoji trigger at the collapsed Lexical selection.
 *
 * @returns The trigger range, or `null` when the selection is elsewhere.
 */
export function readEmojiTrigger(): EmojiTriggerState | null {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchor = selection.anchor;
  const node = anchor.getNode();

  if (!$isTextNode(node)) {
    return null;
  }

  const text = node.getTextContent();
  const beforeCursor = text.slice(0, anchor.offset);
  const startOffset = beforeCursor.lastIndexOf("::");

  if (startOffset < 0) {
    return null;
  }

  if (startOffset > 0 && !/\s/.test(beforeCursor[startOffset - 1] ?? "")) {
    return null;
  }

  const rawQuery = beforeCursor.slice(startOffset + 2);

  if (rawQuery.includes("\n")) {
    return null;
  }

  return {
    nodeKey: node.getKey(),
    startOffset,
    endOffset: anchor.offset,
    query: rawQuery.trim()
  };
}

/**
 * Creates a stable key for one inline emoji trigger.
 *
 * @param trigger Trigger state.
 * @returns A key suitable for cancellation tracking.
 */
export function createEmojiTriggerKey(trigger: EmojiTriggerState): string {
  return `${trigger.nodeKey}:${trigger.startOffset}:${trigger.query}`;
}

/**
 * Searches the curated emoji catalogue using normalized multi-term aliases.
 *
 * @param query User-entered search text after `::`.
 * @returns Matching emojis ordered by relevance and catalogue order.
 */
export function searchComposerEmojis(
  query: string,
  overrides?: OpenCodexEmojiCatalogOverrides
): string[] {
  const emojis = getComposerEmojis();
  const normalizedQuery = normalizeComposerEmojiSearchText(query);

  if (normalizedQuery.length === 0) {
    return emojis;
  }

  const queryTerms = normalizedQuery.split(/\s+/u).filter((term) => term.length > 0);

  return emojis
    .map((emoji, index) => ({
      emoji,
      index,
      score: scoreEmoji(emoji, queryTerms, overrides)
    }))
    .filter((item): item is { emoji: string; index: number; score: number } => item.score !== null)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((item) => item.emoji);
}

/**
 * Replaces an inline trigger with its selected emoji and keeps the caret after it.
 *
 * @param node Text node containing the trigger.
 * @param trigger Trigger range to replace.
 * @param emoji Emoji to insert.
 */
export function replaceEmojiTrigger(
  node: LexicalNode,
  trigger: EmojiTriggerState,
  emoji: string
): void {
  if (!$isTextNode(node)) {
    return;
  }

  const text = node.getTextContent();
  const before = text.slice(0, trigger.startOffset);
  const after = text.slice(trigger.endOffset);
  const nextText = `${before}${emoji}${after}`;

  node.setTextContent(nextText);
  const nextOffset = before.length + emoji.length;
  node.select(nextOffset, nextOffset);
}

/** Scores one emoji against all normalized query terms. */
function scoreEmoji(
  emoji: string,
  queryTerms: string[],
  overrides?: OpenCodexEmojiCatalogOverrides
): number | null {
  const aliases = [
    emoji,
    ...getComposerEmojiAliases(emoji, overrides),
    ...readEmojiCategoryAliases(emoji)
  ].map(normalizeComposerEmojiSearchText);
  let bestScore: number | null = null;

  for (const alias of aliases) {
    if (!queryTerms.every((term) => alias.includes(term))) {
      continue;
    }

    const query = queryTerms.join(" ");
    const score = alias === query ? 0 : alias.startsWith(query) ? 1 : 2;
    bestScore = bestScore === null ? score : Math.min(bestScore, score);
  }

  return bestScore;
}

/** Reads category-level aliases for an emoji. */
function readEmojiCategoryAliases(emoji: string): readonly string[] {
  const aliases: string[] = [];

  for (const [category, categoryEmojis] of Object.entries(COMPOSER_EMOJI_CATEGORIES)) {
    if (categoryEmojis.some((categoryEmoji) => categoryEmoji === emoji)) {
      aliases.push(...EMOJI_CATEGORY_ALIASES[category as keyof typeof EMOJI_CATEGORY_ALIASES]);
    }
  }

  return aliases;
}
