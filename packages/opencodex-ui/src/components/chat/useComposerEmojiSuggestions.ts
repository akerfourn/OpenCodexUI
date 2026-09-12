/** Manages inline emoji autocomplete for the main chat composer. */
import {
  $getNodeByKey,
  $isTextNode,
  type LexicalEditor
} from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import type { OpenCodexEmojiCatalogOverrides } from "@open-codex-ui/opencodex-protocol";

import {
  createEmojiTriggerKey,
  readEmojiTrigger,
  replaceEmojiTrigger,
  searchComposerEmojis,
  type EmojiTriggerState
} from "./composerEmojiSearch";

export interface ComposerEmojiSuggestionsState {
  activeTrigger: EmojiTriggerState | null;
  highlightedIndex: number;
  suggestions: string[];
  handleKeyDown(event: KeyboardEvent<HTMLDivElement>): boolean;
  insertEmoji(emoji: string | undefined): void;
  updateFromEditor(): void;
}

/**
 * Manages trigger detection, filtering, keyboard navigation and replacement.
 *
 * @param enabled Whether this editor should support inline emoji suggestions.
 * @param editorRef Active Lexical editor reference.
 * @returns Inline emoji state and handlers.
 */
export function useComposerEmojiSuggestions(
  enabled: boolean,
  editorRef: RefObject<LexicalEditor | null>,
  overrides?: OpenCodexEmojiCatalogOverrides
): ComposerEmojiSuggestionsState {
  const activeTriggerRef = useRef<EmojiTriggerState | null>(null);
  const [activeTrigger, setActiveTrigger] = useState<EmojiTriggerState | null>(null);
  const [cancelledTriggerKey, setCancelledTriggerKey] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    activeTriggerRef.current = activeTrigger;
  }, [activeTrigger]);

  const updateFromEditor = useCallback((): void => {
    if (!enabled) {
      setActiveTrigger(null);
      setSuggestions([]);
      return;
    }

    const trigger = readEmojiTrigger();

    if (trigger === null) {
      setActiveTrigger(null);
      setSuggestions([]);
      setCancelledTriggerKey(null);
      return;
    }

    const currentKey = createEmojiTriggerKey(trigger);

    if (currentKey === cancelledTriggerKey) {
      setActiveTrigger(null);
      setSuggestions([]);
      return;
    }

    setActiveTrigger(trigger);
    setSuggestions(searchComposerEmojis(trigger.query, overrides));
    setHighlightedIndex(0);
  }, [cancelledTriggerKey, enabled, overrides]);

  const cancelActiveTrigger = useCallback((): void => {
    const trigger = activeTriggerRef.current;

    if (trigger !== null) {
      setCancelledTriggerKey(createEmojiTriggerKey(trigger));
    }

    setActiveTrigger(null);
    setSuggestions([]);
  }, []);

  const insertEmoji = useCallback((emoji: string | undefined): void => {
    const trigger = activeTriggerRef.current;

    if (trigger === null || emoji === undefined) {
      return;
    }

    setActiveTrigger(null);
    setSuggestions([]);
    setCancelledTriggerKey(null);

    const editor = editorRef.current;

    if (editor === null) {
      return;
    }

    editor.focus();
    editor.update(() => {
      const node = $getNodeByKey(trigger.nodeKey);

      if (!$isTextNode(node)) {
        return;
      }

      replaceEmojiTrigger(node, trigger, emoji);
    });
  }, [editorRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): boolean {
    if (!enabled || activeTriggerRef.current === null) {
      return false;
    }

    if (event.key === "Escape") {
      cancelActiveTrigger();
      event.stopPropagation();
      event.preventDefault();
      return true;
    }

    if (suggestions.length === 0) {
      return false;
    }

    if (event.key === "ArrowDown") {
      setHighlightedIndex((current) => Math.min(current + 1, suggestions.length - 1));
      event.stopPropagation();
      event.preventDefault();
      return true;
    }

    if (event.key === "ArrowUp") {
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      event.stopPropagation();
      event.preventDefault();
      return true;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      insertEmoji(suggestions[highlightedIndex] ?? suggestions[0]);
      event.stopPropagation();
      event.preventDefault();
      return true;
    }

    return false;
  }

  return {
    activeTrigger,
    highlightedIndex,
    suggestions,
    handleKeyDown,
    insertEmoji,
    updateFromEditor
  };
}
