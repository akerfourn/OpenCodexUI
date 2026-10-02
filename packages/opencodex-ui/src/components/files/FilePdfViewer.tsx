import { useEffect, useRef, useState } from "react";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { Alert, LinearProgress } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { FileDocument } from "../../stores/files/FileDocument";
import { loadPdf } from "./pdfRuntime";
import { FilePdfPageX } from "./FilePdfPage";
import { FilePdfToolbarX } from "./FilePdfToolbar";
import "./pdfViewer.css";

/** Owns a lazily loaded PDF worker; hiding or replacing a document releases its resources. */
export function FilePdfViewer({ document }: { document: FileDocument }) {
  const { t } = useTranslation();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [width, setWidth] = useState(0);
  const bytes = document.pdfSnapshot?.dataBase64;

  useEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (bytes === undefined) return;
    let disposed = false;
    setPdf(null);
    setError(null);
    setPasswordRequired(false);
    const task = loadPdf(bytes);
    void task.promise.then((loaded) => {
      if (disposed) return;
      runInAction(() => { document.pdfPage = Math.min(document.pdfPage, loaded.numPages); });
      setPdf(loaded);
    }).catch((failure: unknown) => {
      if (disposed) return;
      setPasswordRequired(failure instanceof Error && failure.name === "PasswordException");
      setError(String(failure));
    });
    return () => {
      disposed = true;
      // Destruction can reject an already failed worker; no mounted viewer remains to report it.
      void task.destroy().catch(() => undefined);
    };
  }, [bytes, document]);

  const loading = pdf === null && error === null ? <LinearProgress /> : null;
  const feedback = error === null ? null : (
    <Alert severity="warning">
      {t(passwordRequired ? "files.pdfPasswordUnsupported" : "files.pdfUnavailable")}
      <details><summary>{t("files.details")}</summary>{error}</details>
    </Alert>
  );
  const page = pdf === null || width === 0 ? null : (
    <FilePdfPageX key={`${document.pdfPage}:${document.pdfZoom}:${width}`} pdf={pdf}
      pageNumber={document.pdfPage} zoom={document.pdfZoom} width={width} onScale={setScale} />
  );
  return (
    <div className="files-pdf-viewer">
      <FilePdfToolbarX document={document} pageCount={pdf?.numPages ?? 0} scale={scale} />
      {loading}
      {feedback}
      <div ref={viewport} className="files-pdf-viewport">{page}</div>
    </div>
  );
}
export const FilePdfViewerX = observer(FilePdfViewer);
