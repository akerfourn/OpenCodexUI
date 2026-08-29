/**
 * Renders the Lexical-backed plain-text composer input.
 */
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { LinkNode } from "@lexical/link";
import DragHandleRoundedIcon from "@mui/icons-material/DragHandleRounded";
import Popper from "@mui/material/Popper";
import {
  $getNodeByKey,
  $getRoot,
  $isTextNode,
  type EditorState,
  type LexicalEditor
} from "lexical";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, UIEvent } from "react";

import type {
  OpenCodexComposerReference,
  OpenCodexFileSearchResult,
  OpenCodexSkillSearchResult
} from "@open-codex-ui/opencodex-protocol";

import { ComposerFileSuggestionKeyPlugin } from "./ComposerFileSuggestionKeyPlugin";
import {
  ComposerFileSuggestions
} from "./ComposerFileSuggestions";
import { ComposerPlainTextValuePlugin } from "./ComposerPlainTextValuePlugin";
import {
  createTriggerKey,
  isSkillUrl,
  mapFileSuggestions,
  mapSkillSuggestions,
  readReferenceTrigger,
  replaceTriggerWithReferenceLink,
  serializeComposerContent,
  type ComposerReferenceSuggestion,
  type ReferenceTriggerState
} from "./composerReferences";
import {
  COMPOSER_MIN_HEIGHT_PX,
  isComposerEditorAtBottom,
  readComposerMaxHeight
} from "./composerResize";
import { useComposerResize } from "./useComposerResize";

type ComposerPlainTextInputProps = {
  value: string;
  placeholder: string;
  canOpenFileLinks: boolean;
  resizeLabel: string;
  disabled?: boolean;
  renderSuggestionsInPortal?: boolean;
  wrapperClassName?: string;
  editorMinHeight?: number;
  onChange(value: string, markdown: string, references: OpenCodexComposerReference[]): void;
  onSearchFiles(query: string): Promise<OpenCodexFileSearchResult[]>;
  onSearchSkills(query: string): Promise<OpenCodexSkillSearchResult[]>;
  onOpenFileLink(href: string): void;
  onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void;
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
  resizeLabel,
  disabled = false,
  renderSuggestionsInPortal = false,
  wrapperClassName,
  editorMinHeight = COMPOSER_MIN_HEIGHT_PX,
  onChange,
  onSearchFiles,
  onSearchSkills,
  onOpenFileLink,
  onKeyDown
}: ComposerPlainTextInputProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lexicalEditorRef = useRef<LexicalEditor | null>(null);
  const previousMarkdownRef = useRef<string | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const activeTriggerRef = useRef<ReferenceTriggerState | null>(null);
  const [activeTrigger, setActiveTrigger] = useState<ReferenceTriggerState | null>(null);
  const [cancelledTriggerKey, setCancelledTriggerKey] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<ComposerReferenceSuggestion[]>([]);
  const {
    editorHeight,
    manualEditorHeight,
    isEditorResizeEnabled,
    scrollEditorToBottom,
    handleEditorResizeStart,
    handleEditorResizeKeyDown
  } = useComposerResize(editorRef, value, editorMinHeight);
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
      const searchPromise = activeTrigger.kind === "file"
        ? onSearchFiles(activeTrigger.query).then(mapFileSuggestions)
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

  function handleChange(editorState: EditorState): void {
    let didChangeContent = false;

    editorState.read(() => {
      const serialized = serializeComposerContent();
      didChangeContent = previousMarkdownRef.current !== serialized.markdown;
      previousMarkdownRef.current = serialized.markdown;

      if (didChangeContent) {
        onChange($getRoot().getTextContent(), serialized.markdown, serialized.references);
      }

      updateReferenceTrigger();
    });

    if (!didChangeContent || !shouldStickToBottomRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      if (!shouldStickToBottomRef.current) {
        return;
      }

      scrollEditorToBottom();
      shouldStickToBottomRef.current = true;
    });
  }

  function handleEditorScroll(event: UIEvent<HTMLDivElement>): void {
    shouldStickToBottomRef.current = isComposerEditorAtBottom(event.currentTarget);
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (handleSuggestionKeyDown(event)) {
      return;
    }

    onKeyDown(event);
  }

  function handleEditorClick(event: MouseEvent<HTMLDivElement>): void {
    if (disabled) {
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

    if (isSkillLink(link)) {
      return;
    }

    if (!canOpenFileLinks) {
      return;
    }

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
      insertReference(suggestions[highlightedIndex] ?? suggestions[0]);
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

  function insertReference(suggestion: ComposerReferenceSuggestion | undefined): void {
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

      replaceTriggerWithReferenceLink(node, trigger, suggestion);
    });
  }

  const placeholderContent = (
    <span className="composer-editor-placeholder">
      {placeholder}
    </span>
  );
  const resizeHandle = !disabled && isEditorResizeEnabled ? (
    <div
      className="composer-editor-resize-handle"
      role="separator"
      aria-label={resizeLabel}
      aria-orientation="horizontal"
      aria-valuemin={editorMinHeight}
      aria-valuemax={readComposerMaxHeight(window.innerHeight, editorMinHeight)}
      aria-valuenow={manualEditorHeight ?? editorHeight}
      tabIndex={0}
      onKeyDown={handleEditorResizeKeyDown}
      onPointerDown={handleEditorResizeStart}
    >
      <DragHandleRoundedIcon fontSize="small" />
    </div>
  ) : null;
  const editorShellClassName = isEditorResizeEnabled
    ? "composer-editor-shell composer-editor-shell-resizable"
    : "composer-editor-shell";
  const inputWrapperClassName = wrapperClassName === undefined
    ? "composer-input-wrapper"
    : `composer-input-wrapper ${wrapperClassName}`;
  const suggestionsAnchor = editorRef.current;
  const hasSuggestions = !disabled && suggestions.length > 0;
  const suggestionsContent = disabled ? null : (
    <ComposerFileSuggestions
      suggestions={suggestions}
      highlightedIndex={highlightedIndex}
      isPortaled={renderSuggestionsInPortal}
      onSelect={insertReference}
    />
  );
  const suggestionsView = renderSuggestionsInPortal ? (
    <Popper
      open={hasSuggestions && suggestionsAnchor !== null}
      anchorEl={suggestionsAnchor}
      placement="top-start"
      modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}
      sx={{
        width: suggestionsAnchor?.getBoundingClientRect().width,
        zIndex: (theme) => theme.zIndex.modal + 1
      }}
    >
      {suggestionsContent}
    </Popper>
  ) : suggestionsContent;

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={inputWrapperClassName}>
        {suggestionsView}
        <div className={editorShellClassName}>
          {resizeHandle}
          <PlainTextPlugin
            contentEditable={(
              <ContentEditable
                ref={editorRef}
                className="composer-editor"
                style={manualEditorHeight === null ? undefined : { height: manualEditorHeight }}
                aria-label={placeholder}
                aria-disabled={disabled}
                contentEditable={!disabled}
                spellCheck
                onClick={handleEditorClick}
                onKeyDown={handleEditorKeyDown}
                onScroll={handleEditorScroll}
              />
            )}
            placeholder={placeholderContent}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <OnChangePlugin
            ignoreHistoryMergeTagChange
            ignoreSelectionChange={false}
            onChange={handleChange}
          />
          <ComposerPlainTextValuePlugin value={value} />
          <ComposerFileSuggestionKeyPlugin
            hasActiveTrigger={!disabled && activeTrigger !== null}
            highlightedIndex={highlightedIndex}
            suggestions={disabled ? [] : suggestions}
            onSelect={insertReference}
          />
          <EditorRefPlugin editorRef={lexicalEditorRef} />
        </div>
      </div>
    </LexicalComposer>
  );

  function updateReferenceTrigger(): void {
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
}

function isSkillLink(link: HTMLAnchorElement): boolean {
  return link.relList.contains("opencodex-skill") || isSkillUrl(link.getAttribute("href") ?? "");
}
