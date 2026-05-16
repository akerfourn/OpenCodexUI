/**
 * Renders the Lexical-backed plain-text composer input.
 */
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { $createLinkNode, $isLinkNode, LinkNode } from "@lexical/link";
import {
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey
} from "lexical";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

import type { OpenCodexFileSearchResult } from "@open-codex-ui/opencodex-protocol";

import { ComposerFileSuggestionKeyPlugin } from "./ComposerFileSuggestionKeyPlugin";
import { ComposerFileSuggestions } from "./ComposerFileSuggestions";
import { ComposerPlainTextValuePlugin } from "./ComposerPlainTextValuePlugin";

type ComposerPlainTextInputProps = {
  value: string;
  placeholder: string;
  canOpenFileLinks: boolean;
  onChange(value: string, markdown: string): void;
  onSearchFiles(query: string): Promise<OpenCodexFileSearchResult[]>;
  onOpenFileLink(href: string): void;
  onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void;
};

type FileTriggerState = {
  nodeKey: NodeKey;
  startOffset: number;
  endOffset: number;
  query: string;
};

/**
 * Renders a plain-text Lexical editor with the same external contract as a textarea.
 *
 * @param props Component props.
 * @returns Rendered composer input.
 */
export function ComposerPlainTextInput({
  value,
  placeholder,
  canOpenFileLinks,
  onChange,
  onSearchFiles,
  onOpenFileLink,
  onKeyDown
}: ComposerPlainTextInputProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lexicalEditorRef = useRef<LexicalEditor | null>(null);
  const activeTriggerRef = useRef<FileTriggerState | null>(null);
  const [activeTrigger, setActiveTrigger] = useState<FileTriggerState | null>(null);
  const [cancelledTriggerKey, setCancelledTriggerKey] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<OpenCodexFileSearchResult[]>([]);
  const initialConfig = useMemo<InitialConfigType>(() => ({
    namespace: "OpenCodexComposer",
    nodes: [LinkNode],
    onError(error: Error) {
      throw error;
    }
  }), []);

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
      void onSearchFiles(activeTrigger.query).then((results) => {
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
  }, [activeTrigger, onSearchFiles]);

  function handleChange(editorState: EditorState): void {
    editorState.read(() => {
      onChange($getRoot().getTextContent(), serializeMarkdown());
      updateFileTrigger();
    });

    requestAnimationFrame(scrollEditorToBottom);
  }

  function scrollEditorToBottom(): void {
    const editorElement = editorRef.current;

    if (editorElement === null || editorElement.scrollHeight <= editorElement.clientHeight) {
      return;
    }

    editorElement.scrollTop = editorElement.scrollHeight;
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (handleSuggestionKeyDown(event)) {
      return;
    }

    onKeyDown(event);
  }

  function handleEditorClick(event: MouseEvent<HTMLDivElement>): void {
    if (!canOpenFileLinks) {
      return;
    }

    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const link = target.closest("a");

    if (link === null) {
      return;
    }

    const href = link.getAttribute("href");

    if (href === null || href.trim().length === 0) {
      return;
    }

    event.preventDefault();
    onOpenFileLink(href);
  }

  function handleSuggestionKeyDown(event: KeyboardEvent<HTMLDivElement>): boolean {
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
      insertFileReference(suggestions[highlightedIndex] ?? suggestions[0]);
      event.stopPropagation();
      event.preventDefault();
      return true;
    }

    return false;
  }

  function cancelActiveTrigger(): void {
    const trigger = activeTriggerRef.current;

    if (trigger !== null) {
      setCancelledTriggerKey(createTriggerKey(trigger));
    }

    setActiveTrigger(null);
    setSuggestions([]);
  }

  function insertFileReference(suggestion: OpenCodexFileSearchResult | undefined): void {
    const trigger = activeTriggerRef.current;

    if (trigger === null || suggestion === undefined) {
      return;
    }

    setActiveTrigger(null);
    setSuggestions([]);
    setCancelledTriggerKey(null);

    const editor = lexicalEditorRef.current;

    if (editor === null) {
      return;
    }

    editor.focus();
    editor.update(() => {
      const node = $getNodeByKey(trigger.nodeKey);

      if (!$isTextNode(node)) {
        return;
      }

      replaceTriggerWithFileLink(node, trigger, suggestion);
    });
  }

  const placeholderContent = (
    <span className="composer-editor-placeholder">
      {placeholder}
    </span>
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="composer-input-wrapper">
        <ComposerFileSuggestions
          suggestions={suggestions}
          highlightedIndex={highlightedIndex}
          onSelect={insertFileReference}
        />
        <div className="composer-editor-shell">
          <PlainTextPlugin
            contentEditable={(
              <ContentEditable
                ref={editorRef}
                className="composer-editor"
                aria-label={placeholder}
                spellCheck
                onClick={handleEditorClick}
                onKeyDown={handleEditorKeyDown}
              />
            )}
            placeholder={placeholderContent}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <OnChangePlugin
            ignoreHistoryMergeTagChange
            ignoreSelectionChange={false}
            onChange={handleChange}
          />
          <ComposerPlainTextValuePlugin value={value} />
          <ComposerFileSuggestionKeyPlugin
            hasActiveTrigger={activeTrigger !== null}
            highlightedIndex={highlightedIndex}
            suggestions={suggestions}
            onSelect={insertFileReference}
          />
          <EditorRefPlugin editorRef={lexicalEditorRef} />
        </div>
      </div>
    </LexicalComposer>
  );

  function updateFileTrigger(): void {
    const trigger = readFileTrigger();

    if (trigger === null) {
      setActiveTrigger(null);
      return;
    }

    const currentKey = createTriggerKey(trigger);

    if (currentKey === cancelledTriggerKey) {
      setActiveTrigger(null);
      return;
    }

    setActiveTrigger(trigger);
  }
}

function serializeMarkdown(): string {
  return $getRoot().getChildren().map(serializeNode).join("\n");
}

function serializeNode(node: LexicalNode): string {
  if ($isLinkNode(node)) {
    const text = node.getChildren().map(serializeNode).join("");
    return `[${text}](${node.getURL()})`;
  }

  if ("getChildren" in node && typeof node.getChildren === "function") {
    return node.getChildren().map(serializeNode).join("");
  }

  return node.getTextContent();
}

function readFileTrigger(): FileTriggerState | null {
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
  const cursorOffset = anchor.offset;
  const beforeCursor = text.slice(0, cursorOffset);
  const startOffset = beforeCursor.lastIndexOf("@");

  if (startOffset < 0) {
    return null;
  }

  if (startOffset > 0 && !/\s/.test(beforeCursor[startOffset - 1] ?? "")) {
    return null;
  }

  const query = beforeCursor.slice(startOffset + 1);

  if (query.includes("\n")) {
    return null;
  }

  return {
    nodeKey: node.getKey(),
    startOffset,
    endOffset: cursorOffset,
    query: query.trim()
  };
}

function createTriggerKey(trigger: FileTriggerState): string {
  return `${trigger.nodeKey}:${trigger.startOffset}:${trigger.query}`;
}

function replaceTriggerWithFileLink(
  node: Extract<LexicalNode, { getTextContent(): string }>,
  trigger: FileTriggerState,
  suggestion: OpenCodexFileSearchResult
): void {
  if (!$isTextNode(node)) {
    return;
  }

  const text = node.getTextContent();
  const before = text.slice(0, trigger.startOffset);
  const after = text.slice(trigger.endOffset);
  const link = $createLinkNode(suggestion.relativePath, {
    title: suggestion.relativePath
  });
  const trailingText = after.startsWith(" ") ? after : ` ${after}`;
  const trailingNode = $createTextNode(trailingText);

  link.append($createTextNode(suggestion.fileName).setMode("token"));

  if (before.length > 0) {
    node.setTextContent(before);
    node.insertAfter(link);
  } else {
    node.replace(link);
  }

  link.insertAfter(trailingNode);
  trailingNode.select(1, 1);
}
