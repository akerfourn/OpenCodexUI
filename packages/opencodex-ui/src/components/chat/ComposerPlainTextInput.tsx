/**
 * Renders the Lexical-backed plain-text composer input.
 */
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { $getRoot, type EditorState } from "lexical";
import { useMemo, useRef } from "react";

import { ComposerPlainTextValuePlugin } from "./ComposerPlainTextValuePlugin";

type ComposerPlainTextInputProps = {
  value: string;
  placeholder: string;
  onChange(value: string): void;
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
  onChange,
  onKeyDown
}: ComposerPlainTextInputProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const initialConfig = useMemo<InitialConfigType>(() => ({
    namespace: "OpenCodexComposer",
    onError(error: Error) {
      throw error;
    }
  }), []);

  function handleChange(editorState: EditorState): void {
    editorState.read(() => {
      onChange($getRoot().getTextContent());
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

  const placeholderContent = (
    <span className="composer-editor-placeholder">
      {placeholder}
    </span>
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="composer-editor-shell">
        <PlainTextPlugin
          contentEditable={(
            <ContentEditable
              ref={editorRef}
              className="composer-editor"
              aria-label={placeholder}
              spellCheck
              onKeyDown={onKeyDown}
            />
          )}
          placeholder={placeholderContent}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <OnChangePlugin
          ignoreHistoryMergeTagChange
          ignoreSelectionChange
          onChange={handleChange}
        />
        <ComposerPlainTextValuePlugin value={value} />
      </div>
    </LexicalComposer>
  );
}
