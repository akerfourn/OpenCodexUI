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
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type EditorState,
  type LexicalEditor
} from "lexical";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, UIEvent } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexComposerReference,
  OpenCodexFileSearchMode,
  OpenCodexFileSearchResult,
  OpenCodexSkillSearchResult
} from "@open-codex-ui/opencodex-protocol";

import { ComposerFileSuggestionKeyPlugin } from "./ComposerFileSuggestionKeyPlugin";
import { ComposerPlainTextValuePlugin } from "./ComposerPlainTextValuePlugin";
import { ComposerSuggestionPopups } from "./ComposerSuggestionPopups";
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
import { useComposerEmojiSuggestions } from "./useComposerEmojiSuggestions";
import { useComposerResize } from "./useComposerResize";

type ComposerPlainTextInputProps = {
  value: string;
  placeholder: string;
  canOpenFileLinks: boolean;
  resizeLabel: string;
  disabled?: boolean;
  enableEmojiSuggestions?: boolean;
  renderSuggestionsInPortal?: boolean;
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
  editorMinHeight?: number;
  onChange(value: string, markdown: string, references: OpenCodexComposerReference[]): void;
  onSearchFiles(
    query: string,
    searchMode: OpenCodexFileSearchMode
  ): Promise<OpenCodexFileSearchResult[]>;
  onSearchSkills(query: string): Promise<OpenCodexSkillSearchResult[]>;
  onOpenFileLink(href: string): void;
  onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void;
};

export interface ComposerPlainTextInputHandle {
  /** Inserts plain text at the current editor selection. */
  insertText(text: string): void;
}

/**
 * Renders a plain-text Lexical editor with the same external contract as a textarea.
 *
 * @param props Component props.
 * @returns Rendered composer input.
 */
export const ComposerPlainTextInput = forwardRef<
  ComposerPlainTextInputHandle,
  ComposerPlainTextInputProps
>(function ComposerPlainTextInput({
  value,
  placeholder,
  canOpenFileLinks,
  resizeLabel,
  disabled = false,
  enableEmojiSuggestions = false,
  renderSuggestionsInPortal = false,
  wrapperClassName,
  wrapperStyle,
  editorMinHeight = COMPOSER_MIN_HEIGHT_PX,
  onChange,
  onSearchFiles,
  onSearchSkills,
  onOpenFileLink,
  onKeyDown
}, ref) {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lexicalEditorRef = useRef<LexicalEditor | null>(null);
  const previousMarkdownRef = useRef<string | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const activeTriggerRef = useRef<ReferenceTriggerState | null>(null);
  const [activeTrigger, setActiveTrigger] = useState<ReferenceTriggerState | null>(null);
  const [cancelledTriggerKey, setCancelledTriggerKey] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<ComposerReferenceSuggestion[]>([]);
  const emojiSuggestionsState = useComposerEmojiSuggestions(
    enableEmojiSuggestions,
    lexicalEditorRef
  );
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

  const insertText = useCallback((text: string): void => {
    if (text.length === 0) {
      return;
    }

    const editor = lexicalEditorRef.current;

    if (editor === null) {
      return;
    }

    editor.focus();
    editor.update(() => {
      const selection = $getSelection();

      if ($isRangeSelection(selection)) {
        selection.insertText(text);
        return;
      }

      $getRoot().selectEnd();
      const endSelection = $getSelection();

      if ($isRangeSelection(endSelection)) {
        endSelection.insertText(text);
      }
    });
  }, []);

  useImperativeHandle(ref, () => ({ insertText }), [insertText]);

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
      emojiSuggestionsState.updateFromEditor();
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
    if (emojiSuggestionsState.handleKeyDown(event)) {
      return;
    }

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

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={inputWrapperClassName} style={wrapperStyle}>
        <ComposerSuggestionPopups
          anchorElement={suggestionsAnchor}
          disabled={disabled}
          renderInPortal={renderSuggestionsInPortal}
          fileSuggestions={suggestions}
          fileHighlightedIndex={highlightedIndex}
          emojiEnabled={enableEmojiSuggestions}
          emojiActive={emojiSuggestionsState.activeTrigger !== null}
          emojiHighlightedIndex={emojiSuggestionsState.highlightedIndex}
          emojiSuggestions={emojiSuggestionsState.suggestions}
          emojiEmptyMessage={t("composer.emoji.noMatch")}
          onFileSelect={insertReference}
          onEmojiSelect={emojiSuggestionsState.insertEmoji}
        />
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
});

function isSkillLink(link: HTMLAnchorElement): boolean {
  return link.relList.contains("opencodex-skill") || isSkillUrl(link.getAttribute("href") ?? "");
}
