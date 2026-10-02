import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, LinearProgress } from "@mui/material";
import { useTranslation } from "react-i18next";
import { TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { PdfPageSize } from "./pdfPageLayout";
import { pdfPixelRatio } from "./pdfRuntime";

/** Renders one page at a time, bounding canvas memory and cancelling superseded work. */
export function FilePdfPage({ pdf, pageNumber, zoom, width, onScale, onSize }: {
  pdf: PDFDocumentProxy; pageNumber: number; zoom: number | null; width: number; onScale: (scale: number) => void;
  onSize?: (page: number, size: PdfPageSize) => void;
}) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    let disposed = false;
    let page: PDFPageProxy | null = null;
    let render: RenderTask | null = null;
    let text: TextLayer | null = null;
    /** Uses private DOM nodes so cancelled work can never overwrite a newer page. */
    async function draw(): Promise<void> {
      try {
        page = await pdf.getPage(pageNumber);
        if (disposed || element === null) return;
        const original = page.getViewport({ scale: 1 });
        onSize?.(pageNumber, { width: original.width, height: original.height });
        const scale = zoom ?? Math.max(0.1, (width - 32) / original.width);
        onScale(scale);
        const viewport = page.getViewport({ scale });
        const ratio = pdfPixelRatio(viewport.width, viewport.height, window.devicePixelRatio || 1);
        const canvas = globalThis.document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const layer = globalThis.document.createElement("div");
        layer.className = "files-pdf-text";
        layer.style.setProperty("--total-scale-factor", String(scale * page.userUnit));
        element.style.width = `${viewport.width}px`;
        element.style.height = `${viewport.height}px`;
        element.replaceChildren(canvas, layer);
        render = page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        await render.promise;
        if (disposed) return;
        text = new TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport });
        await text.render();
      } catch (failure) {
        if (!disposed) setError(String(failure));
      } finally {
        if (!disposed) setBusy(false);
      }
    }
    void draw();
    return () => {
      disposed = true;
      render?.cancel();
      text?.cancel();
      element.replaceChildren();
      // The document owns final cleanup; page cleanup can defer while rendering is cancelled.
      page?.cleanup();
    };
  }, [pdf, pageNumber, zoom, width, onScale, onSize]);
  const loading = busy ? <LinearProgress /> : null;
  const feedback = error === null ? null : (
    <Alert severity="warning">{t("files.pdfUnavailable")}
      <details><summary>{t("files.details")}</summary>{error}</details>
    </Alert>
  );
  return <>{loading}{feedback}<div ref={container} className="files-pdf-page" /></>;
}
export const FilePdfPageX = observer(FilePdfPage);
