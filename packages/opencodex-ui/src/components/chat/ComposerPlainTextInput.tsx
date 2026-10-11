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
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type EditorState,
  type LexicalEditor
} from "lexical";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef
} from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, UIEvent } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexComposerReference,
  OpenCodexEmojiCatalogOverrides,
  OpenCodexFileSearchMode,
  OpenCodexFileSearchResult,
  OpenCodexSkillSearchResult
} from "@open-codex-ui/opencodex-protocol";

import { ComposerFileSuggestionKeyPlugin } from "./ComposerFileSuggestionKeyPlugin";
import { ComposerPlainTextValuePlugin } from "./ComposerPlainTextValuePlugin";
import { ComposerSuggestionPopups } from "./ComposerSuggestionPopups";
import {
  isSkillUrl,
  serializeComposerContent
} from "./composerReferences";
import {
  COMPOSER_MIN_HEIGHT_PX,
  isComposerEditorAtBottom,
  readComposerMaxHeight
} from "./composerResize";
import { useComposerEmojiSuggestions } from "./useComposerEmojiSuggestions";
import { useComposerReferenceSuggestions } from "./useComposerReferenceSuggestions";
import { useComposerResize } from "./useComposerResize";

type ComposerPlainTextInputProps = {
  value: string;
  placeholder: string;
  canOpenFileLinks: boolean;
  resizeLabel: string;
  disabled?: boolean;
  enableEmojiSuggestions?: boolean;
  emojiOverrides?: OpenCodexEmojiCatalogOverrides;
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
  /** Appends dictated text without replacing selected draft content. */
  appendText(text: string): void;
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
  emojiOverrides,
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
  const emojiSuggestionsState = useComposerEmojiSuggestions(
    enableEmojiSuggestions && !disabled,
    lexicalEditorRef,
    emojiOverrides
  );
  const referenceSuggestionsState = useComposerReferenceSuggestions({
    disabled, editorRef: lexicalEditorRef, onSearchFiles, onSearchSkills
  });
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
    editable: !disabled,
    nodes: [LinkNode],
    onError(error: Error) {
      throw error;
    }
  }), [disabled]);

  const insertText = useCallback((text: string): void => {
    if (disabled || text.length === 0) {
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
  }, [disabled]);

  const appendText = useCallback((text: string): void => {
    const editor = lexicalEditorRef.current;
    if (disabled || editor === null || text.trim().length === 0) return;
    editor.update(() => {
      const root = $getRoot();
      const existing = root.getTextContent();
      const separator = existing.length > 0 && !/\s$/.test(existing) ? " " : "";
      root.selectEnd().insertText(separator + text.trim());
    });
  }, [disabled]);

  useImperativeHandle(ref, () => ({ insertText, appendText }), [insertText, appendText]);

  function handleChange(editorState: EditorState): void {
    let didChangeContent = false;

    editorState.read(() => {
      const serialized = serializeComposerContent();
      didChangeContent = previousMarkdownRef.current !== serialized.markdown;
      previousMarkdownRef.current = serialized.markdown;

      if (didChangeContent) {
        onChange($getRoot().getTextContent(), serialized.markdown, serialized.references);
      }

      referenceSuggestionsState.updateFromEditor();
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
    if (disabled) return;
    if (emojiSuggestionsState.handleKeyDown(event)) {
      return;
    }

    if (referenceSuggestionsState.handleKeyDown(event)) {
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
          fileSuggestions={referenceSuggestionsState.suggestions}
          fileHighlightedIndex={referenceSuggestionsState.highlightedIndex}
          emojiEnabled={enableEmojiSuggestions}
          emojiActive={emojiSuggestionsState.activeTrigger !== null}
          emojiHighlightedIndex={emojiSuggestionsState.highlightedIndex}
          emojiSuggestions={emojiSuggestionsState.suggestions}
          emojiEmptyMessage={t("composer.emoji.noMatch")}
          onFileSelect={referenceSuggestionsState.insertReference}
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
          <ComposerPlainTextValuePlugin value={value} disabled={disabled} />
          <ComposerFileSuggestionKeyPlugin
            hasActiveTrigger={!disabled && referenceSuggestionsState.activeTrigger !== null}
            highlightedIndex={referenceSuggestionsState.highlightedIndex}
            suggestions={disabled ? [] : referenceSuggestionsState.suggestions}
            onSelect={referenceSuggestionsState.insertReference}
          />
          <EditorRefPlugin editorRef={lexicalEditorRef} />
        </div>
      </div>
    </LexicalComposer>
  );
});

/** Identifies skill tokens so ordinary file-link opening does not handle them. */
function isSkillLink(link: HTMLAnchorElement): boolean {
  return link.relList.contains("opencodex-skill") || isSkillUrl(link.getAttribute("href") ?? "");
}
