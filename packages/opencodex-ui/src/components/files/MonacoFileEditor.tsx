import { runInAction } from "mobx";
import { useEffect, useRef } from "react";
import { useTheme } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { FileDocument } from "../../stores/files/FileDocument";
import { modelFor, monaco } from "./monacoRuntime";

/** Lazy text viewer; models and view state survive chat and project navigation. */
export function MonacoFileEditor({ document, visible }: { document: FileDocument; visible: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const theme = useTheme();
  const readOnly = document.isReadOnly;
  const version = document.version;
  const position = document.position;
  const annotations = document.annotations;

  useEffect(() => {
    if (container.current === null) return;
    const model = modelFor(document);
    if (model.getValue() !== document.content) model.setValue(document.content);
    const editor = monaco.editor.create(container.current, {
      model,
      automaticLayout: true,
      readOnly: document.isReadOnly,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineNumbers: "on",
      padding: { top: 10 },
      wordWrap: "off",
      ariaLabel: document.name,
      fixedOverflowWidgets: true
    });
    editorRef.current = editor;
    editor.restoreViewState(document.viewState as monaco.editor.ICodeEditorViewState | null);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void document.save();
    });
    return () => {
      document.viewState = editor.saveViewState();
      editor.dispose();
      editorRef.current = null;
    };
  }, [document]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);
  useEffect(() => {
    monaco.editor.setTheme(theme.palette.mode === "dark" ? "vs-dark" : "vs");
  }, [theme.palette.mode]);
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (model === null || model === undefined || model.getValue() === document.content) return;
    const state = editor?.saveViewState();
    model.setValue(document.content);
    if (state !== undefined && state !== null) editor?.restoreViewState(state);
  }, [document, version]);
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model === undefined || model === null) return;
    monaco.editor.setModelMarkers(
      model,
      "opencodex",
      annotations.map((annotation) => ({
        startLineNumber: annotation.line,
        startColumn: annotation.column ?? 1,
        endLineNumber: annotation.endLine ?? annotation.line,
        endColumn:
          annotation.endColumn ??
          model.getLineMaxColumn(Math.max(1, Math.min(model.getLineCount(), annotation.line))),
        message: annotation.message,
        severity: {
          error: monaco.MarkerSeverity.Error,
          warning: monaco.MarkerSeverity.Warning,
          info: monaco.MarkerSeverity.Info
        }[annotation.severity]
      }))
    );
  }, [document, annotations]);
  useEffect(() => {
    if (!visible) return;
    const editor = editorRef.current;
    editor?.layout();
    if (position !== null) {
      const line = Math.max(1, position.line);
      const column = Math.max(1, position.column ?? 1);
      editor?.setSelection({
        startLineNumber: line,
        startColumn: column,
        endLineNumber: position.endLine ?? line,
        endColumn: position.endColumn ?? column
      });
      editor?.revealLineInCenter(line);
      runInAction(() => {
        document.position = null;
      });
    }
    editor?.focus();
  }, [document, position, visible]);

  return <div ref={container} className="files-editor" />;
}

export const MonacoFileEditorX = observer(MonacoFileEditor);
