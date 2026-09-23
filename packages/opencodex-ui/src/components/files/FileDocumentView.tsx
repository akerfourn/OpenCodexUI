import { FileViewerBoundary } from "./FileViewerBoundary";
import { FileViewerFallbackX } from "./FileViewerFallback";
import { lazy, Suspense, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, LinearProgress } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { FileDocument } from "../../stores/files/FileDocument";
import type { ProjectFilesStore } from "../../stores/files/ProjectFilesStore";
import type { RootStore } from "../../stores/RootStore";
import { FileDocumentToolbarX } from "./FileDocumentToolbar";
import { FileErrorX } from "./FileError";

const Editor = lazy(async () => {
  const module = await import("./MonacoFileEditor");
  return { default: module.MonacoFileEditorX };
});

/** Holds document feedback independently of the editor and its lazy bundle. */
export function FileDocumentView({
  document,
  files,
  root,
  visible
}: {
  document: FileDocument;
  files: ProjectFilesStore;
  root: RootStore;
  visible: boolean;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!visible) return;
    const check = (): void => {
      if (globalThis.document.visibilityState !== "hidden") void document.checkExternal();
    };
    check();
    const timer = window.setInterval(check, 5000);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [document, visible]);
  useEffect(() => {
    if (visible && !document.isLoading && document.viewMode === "diff") {
      void document.loadGitDiff();
    }
  }, [document, document.isLoading, document.viewMode, visible]);
  /** Requests explicit resolution before replacing local content. */
  function reload(): void {
    files.reload(document);
  }
  const diffCanRenderWithoutFile = document.gitDiffContext?.comparison === "staged" ||
    document.gitDiffContext?.fileState === "deleted";
  const hasDiffResult = document.gitDiffSnapshot !== null;
  const diffIssue = document.gitDiffSnapshot?.issue ?? null;
  const fileErrorIsDiffIssue = document.viewMode === "diff" && (
    diffIssue !== null ||
    (document.gitDiffContext?.fileState === "deleted" && document.error?.code === "inaccessible")
  );
  const error = document.error === null || fileErrorIsDiffIssue ? null : <FileErrorX error={document.error} />;
  const conflict = document.hasConflict ? (
    <Alert
      severity="warning"
      action={
        <Button color="inherit" size="small" onClick={reload}>
          {t("files.reload")}
        </Button>
      }
    >
      {t("files.conflict")}
    </Alert>
  ) : null;
  const format =
    document.snapshot?.eol === "mixed" ? <Alert severity="info">{t("files.mixedEol")}</Alert> : null;
  const loading = document.isLoading ? <LinearProgress /> : null;
  const diffLoading = document.isGitDiffLoading ? <LinearProgress /> : null;
  const diffError = document.gitDiffError === null ? null : (
    <Alert
      severity="error"
      action={(
        <Button size="small" color="inherit" onClick={() => document.retryGitDiff()}>
          {t("files.retry")}
        </Button>
      )}
    >
      {t("files.diffReadError")}
      <details>
        <summary>{t("files.details")}</summary>
        {document.gitDiffError}
      </details>
    </Alert>
  );
  const unavailable =
    document.target !== null && !root.sourcesStore.isSourceReady(document.target.sourceId) ? (
      <Alert severity="warning">{t("files.sourceUnavailable")}</Alert>
    ) : null;
  const shouldShowEditor = document.viewMode === "diff"
    ? hasDiffResult && (diffCanRenderWithoutFile || document.snapshot !== null || diffIssue !== null)
    : document.snapshot !== null || document.target === null;
  const editor = shouldShowEditor ? (
      <Editor document={document} visible={visible} languages={root.fileLanguagesStore} />
    ) : null;
  return (
    <div className="files-document">
      <FileDocumentToolbarX document={document} files={files} root={root} />
      {loading}
      {diffLoading}
      {diffError}
      {unavailable}
      {error}
      {conflict}
      {format}
      <FileViewerBoundary fallback={<FileViewerFallbackX document={document} />}>
        <Suspense fallback={<LinearProgress />}>{editor}</Suspense>
      </FileViewerBoundary>
    </div>
  );
}
export const FileDocumentViewX = observer(FileDocumentView);
