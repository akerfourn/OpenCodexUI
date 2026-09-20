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
  /** Requests explicit resolution before replacing local content. */
  function reload(): void {
    files.reload(document);
  }
  const error = document.error === null ? null : <FileErrorX error={document.error} />;
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
  const unavailable =
    document.target !== null && !root.sourcesStore.isSourceReady(document.target.sourceId) ? (
      <Alert severity="warning">{t("files.sourceUnavailable")}</Alert>
    ) : null;
  const editor =
    document.snapshot !== null || document.target === null ? (
      <Editor document={document} visible={visible} />
    ) : null;
  return (
    <div className="files-document">
      <FileDocumentToolbarX document={document} files={files} root={root} />
      {loading}
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
