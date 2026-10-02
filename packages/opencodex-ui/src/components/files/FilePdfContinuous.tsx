import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { FileDocument } from "../../stores/files/FileDocument";
import { FilePdfPageX } from "./FilePdfPage";
import { pdfPageAt, pdfPageLayout, visiblePdfPages, type PdfPageSize } from "./pdfPageLayout";

/** Continuous reading with virtual page slots and a stable page-relative scroll anchor. */
export function FilePdfContinuous({ document, pdf, width, viewport, onScale }: {
  document: FileDocument; pdf: PDFDocumentProxy; width: number;
  viewport: HTMLDivElement; onScale: (scale: number) => void;
}) {
  const [sizes, setSizes] = useState<ReadonlyMap<number, PdfPageSize>>(new Map());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(viewport.clientHeight);
  const anchor = useRef({ page: document.pdfPage, fraction: document.pdfPageOffset });
  const pages = useMemo(() => pdfPageLayout(pdf.numPages, width, document.pdfZoom, sizes),
    [pdf, width, document.pdfZoom, sizes]);

  /** Corrects a placeholder's dimensions only after its page is actually needed. */
  const recordSize = useCallback((page: number, size: PdfPageSize): void => {
    setSizes((previous) => {
      const known = previous.get(page);
      if (known?.width === size.width && known.height === size.height) return previous;
      const next = new Map(previous);
      next.set(page, size);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    if (anchor.current.page !== document.pdfPage) {
      anchor.current = { page: document.pdfPage, fraction: 0 };
    }
    const placement = pages[anchor.current.page - 1];
    if (placement === undefined) return;
    viewport.scrollTop = placement.top + anchor.current.fraction * placement.height;
    setScrollTop(viewport.scrollTop);
    onScale(placement.scale);
  }, [pages, document.pdfPage, viewport, onScale]);

  useLayoutEffect(() => {
    /** Reports scrolling without turning the resulting page label update into a jump. */
    function scroll(): void {
      const top = viewport.scrollTop;
      const placement = pages[pdfPageAt(pages, top)];
      if (placement === undefined) return;
      const fraction = Math.max(0, Math.min(1, (top - placement.top) / placement.height));
      anchor.current = { page: placement.page, fraction };
      runInAction(() => {
        document.pdfPage = placement.page;
        document.pdfPageOffset = fraction;
      });
      setScrollTop(top);
      onScale(placement.scale);
    }
    const resize = new ResizeObserver(() => setViewportHeight(viewport.clientHeight));
    resize.observe(viewport);
    viewport.addEventListener("scroll", scroll);
    return () => { resize.disconnect(); viewport.removeEventListener("scroll", scroll); };
  }, [pages, document, viewport, onScale]);

  const last = pages[pages.length - 1];
  const totalHeight = last === undefined ? 0 : last.top + last.height;
  const maxWidth = useMemo(() => pages.reduce((maximum, page) => Math.max(maximum, page.width), 0), [pages]);
  const visible = visiblePdfPages(pages, scrollTop, viewportHeight).map((page) => (
    <div key={page.page} className="files-pdf-slot" style={{ top: page.top, minHeight: page.height }}>
      <FilePdfPageX key={`${page.page}:${document.pdfZoom}:${width}`} pdf={pdf} pageNumber={page.page}
        zoom={document.pdfZoom} width={width} onScale={ignoreScale} onSize={recordSize} />
    </div>
  ));
  return <div className="files-pdf-continuous" style={{ height: totalHeight, minWidth: maxWidth }}>{visible}</div>;
}

/** Continuous mode derives toolbar scale from the anchored page, not neighboring renders. */
function ignoreScale(): void {}

export const FilePdfContinuousX = observer(FilePdfContinuous);
