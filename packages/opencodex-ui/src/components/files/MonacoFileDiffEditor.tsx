import { Alert, LinearProgress } from "@mui/material";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { FileDocument } from "../../stores/files/FileDocument";
import { modelFor, monaco } from "./monacoRuntime";

/** Displays source-owned Git snapshots through Monaco's two-way diff editor. */
export function MonacoFileDiffEditor({ document, visible, language }: {
  document: FileDocument;
  visible: boolean;
  language: string;
}) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const snapshot = document.gitDiffSnapshot;
  const context = document.gitDiffContext;
  const layout = document.diffLayout;
  const position = document.position;
  const annotations = document.annotations;

  useEffect(() => {
    if (
      container.current === null ||
      snapshot === null ||
      context === null ||
      snapshot.issue !== null
    ) return;

    const editor = monaco.editor.createDiffEditor(container.current, {
      automaticLayout: true,
      renderSideBySide: layout === "side-by-side",
      originalEditable: false,
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineNumbers: "on",
      padding: { top: 10 },
      wordWrap: "off",
      diffWordWrap: "off",
      renderOverviewRuler: false,
      maxComputationTime: 3000,
      maxFileSize: 2,
      originalAriaLabel: t("files.diffOriginal"),
      modifiedAriaLabel: t("files.diffModified"),
      ariaLabel: t("files.viewDiff")
    });
    const original = monaco.editor.createModel(
      snapshot.originalContent,
      language,
      diffModelUri(document, context.comparison, "original")
    );
    const modifiedUsesDocument = context.comparison === "workingTree" &&
      context.fileState !== "deleted";
    const modified = modifiedUsesDocument
      ? modelFor(document)
      : monaco.editor.createModel(
          snapshot.modifiedContent ?? "",
          language,
          diffModelUri(document, context.comparison, "modified")
        );
    editor.setModel({ original, modified });
    editor.getModifiedEditor().updateOptions({
      readOnly: !modifiedUsesDocument || document.isReadOnly
    });
    if (modifiedUsesDocument) {
      editor.getModifiedEditor().addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => void document.save()
      );
    }
    editorRef.current = editor;

    return () => {
      editor.dispose();
      original.dispose();
      if (!modifiedUsesDocument) modified.dispose();
      editorRef.current = null;
    };
  }, [context, document, language, snapshot, t]);

  useEffect(() => {
    editorRef.current?.updateOptions({ renderSideBySide: layout === "side-by-side" });
  }, [layout]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModifiedEditor().getModel();
    if (model === null || model === undefined || context?.comparison !== "workingTree") return;
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
  }, [annotations, context]);

  useEffect(() => {
    if (!visible) return;
    const editor = editorRef.current;
    editor?.layout();
    if (position !== null) {
      const line = Math.max(1, position.line);
      const column = Math.max(1, position.column ?? 1);
      editor?.getModifiedEditor().setSelection({
        startLineNumber: line,
        startColumn: column,
        endLineNumber: position.endLine ?? line,
        endColumn: position.endColumn ?? column
      });
      editor?.getModifiedEditor().revealLineInCenter(line);
      runInAction(() => {
        document.position = null;
      });
    }
    editor?.focus();
  }, [document, position, visible]);

  const issue = snapshot?.issue ?? null;
  const issueMessage = issue === null ? null : t(`files.diffIssues.${issue}`);
  const feedback = document.isGitDiffLoading ? (
    <LinearProgress />
  ) : document.gitDiffError !== null ? (
    <Alert severity="error">
      {t("files.diffReadError")}
      <details>
        <summary>{t("files.details")}</summary>
        {document.gitDiffError}
      </details>
    </Alert>
  ) : issueMessage !== null ? (
    <Alert severity={issue === "conflicted" ? "warning" : "info"}>{issueMessage}</Alert>
  ) : null;

  return <>{feedback}<div ref={container} className="files-editor" /></>;
}

export const MonacoFileDiffEditorX = observer(MonacoFileDiffEditor);

/** Creates a stable, isolated Monaco URI for a temporary Git snapshot model. */
function diffModelUri(
  document: FileDocument,
  comparison: "workingTree" | "staged",
  side: "original" | "modified"
): monaco.Uri {
  return monaco.Uri.from({
    scheme: "opencodex-git-diff",
    path: `/${encodeURIComponent(document.id)}/${comparison}/${side}`
  });
}
