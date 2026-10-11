import { $getNodeByKey, $isTextNode, type LexicalEditor } from "lexical";
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import type {
  OpenCodexFileSearchMode,
  OpenCodexFileSearchResult,
  OpenCodexSkillSearchResult
} from "@open-codex-ui/opencodex-protocol";
import {
  createTriggerKey,
  mapFileSuggestions,
  mapSkillSuggestions,
  readReferenceTrigger,
  replaceTriggerWithReferenceLink,
  type ComposerReferenceSuggestion,
  type ReferenceTriggerState
} from "./composerReferences";

export interface ComposerReferenceSuggestionsOptions {
  disabled: boolean;
  editorRef: RefObject<LexicalEditor | null>;
  onSearchFiles(query: string, searchMode: OpenCodexFileSearchMode): Promise<OpenCodexFileSearchResult[]>;
  onSearchSkills(query: string): Promise<OpenCodexSkillSearchResult[]>;
}

export interface ComposerReferenceSuggestionsState {
  activeTrigger: ReferenceTriggerState | null;
  highlightedIndex: number;
  suggestions: ComposerReferenceSuggestion[];
  handleKeyDown(event: KeyboardEvent<HTMLDivElement>): boolean;
  insertReference(suggestion: ComposerReferenceSuggestion | undefined): void;
  /** Detects the reference query inside the caller's active Lexical read transaction. */
  updateFromEditor(): void;
}

/** Owns reference queries, delayed source searches, keyboard selection and Lexical insertion. */
export function useComposerReferenceSuggestions({
  disabled, editorRef, onSearchFiles, onSearchSkills
}: ComposerReferenceSuggestionsOptions): ComposerReferenceSuggestionsState {
  const activeTriggerRef = useRef<ReferenceTriggerState | null>(null);
  const [activeTrigger, setActiveTrigger] = useState<ReferenceTriggerState | null>(null);
  const [cancelledTriggerKey, setCancelledTriggerKey] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<ComposerReferenceSuggestion[]>([]);

  useEffect(() => {
    activeTriggerRef.current = activeTrigger;
  }, [activeTrigger]);

  useEffect(() => {
    if (activeTrigger === null) {
      setSuggestions([]);
      return;
    }

    let isCurrent = true;
    const timeout = window.setTimeout(() => {
      const searchPromise = activeTrigger.kind === "file"
        ? onSearchFiles(activeTrigger.query, activeTrigger.searchMode).then(mapFileSuggestions)
        : onSearchSkills(activeTrigger.query).then(mapSkillSuggestions);

      void searchPromise.then((results) => {
        if (!isCurrent) {
          return;
        }

        setSuggestions(results);
        setHighlightedIndex(0);
      }).catch(() => {
        if (isCurrent) {
          setSuggestions([]);
        }
      });
    }, 120);

    return () => {
      isCurrent = false;
      window.clearTimeout(timeout);
    };
  }, [activeTrigger, onSearchFiles, onSearchSkills]);

  /** Handles reference shortcuts after the caller has offered the event to emoji suggestions. */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): boolean {
    if (disabled) return false;
    if (activeTriggerRef.current === null || suggestions.length === 0) {
      if (event.key === "Escape" && activeTriggerRef.current !== null) {
        cancelActiveTrigger();
        event.stopPropagation();
        event.preventDefault();
        return true;
      }

      return false;
    }

    if (event.key === "Escape") {
      cancelActiveTrigger();
      event.stopPropagation();
      event.preventDefault();
      return true;
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
      insertReference(suggestions[highlightedIndex] ?? suggestions[0]);
      event.stopPropagation();
      event.preventDefault();
      return true;
    }

    return false;
  }

  /** Dismisses this query until the trigger changes or disappears. */
  function cancelActiveTrigger(): void {
    const trigger = activeTriggerRef.current;

    if (trigger !== null) {
      setCancelledTriggerKey(createTriggerKey(trigger));
    }

    setActiveTrigger(null);
    setSuggestions([]);
  }

  /** Replaces only the detected query and leaves the selection after its tokenized link. */
  function insertReference(suggestion: ComposerReferenceSuggestion | undefined): void {
    const trigger = activeTriggerRef.current;

    if (disabled || trigger === null || suggestion === undefined) {
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

      replaceTriggerWithReferenceLink(node, trigger, suggestion);
    });
  }

  /** Reads the current Lexical selection while honoring an Escape dismissal. */
  function updateFromEditor(): void {
    const trigger = readReferenceTrigger();

    if (trigger === null) {
      setActiveTrigger(null);
      setCancelledTriggerKey(null);
      return;
    }

    const currentKey = createTriggerKey(trigger);

    if (currentKey === cancelledTriggerKey) {
      setActiveTrigger(null);
      return;
    }

    setActiveTrigger(trigger);
  }

  return { activeTrigger, highlightedIndex, suggestions, handleKeyDown, insertReference, updateFromEditor };
}
