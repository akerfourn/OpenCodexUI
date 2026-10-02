import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";

/** Opens detached bytes with exclusively bundled resources; PDF scripting is never instantiated. */
export function loadPdf(dataBase64: string): PDFDocumentLoadingTask {
  const base = new URL("pdfjs/", document.baseURI);
  GlobalWorkerOptions.workerSrc = new URL("pdf.worker.mjs", base).href;
  const data = Uint8Array.from(atob(dataBase64), (character) => character.charCodeAt(0));
  return getDocument({
    data,
    cMapUrl: new URL("cmaps/", base).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("standard_fonts/", base).href,
    wasmUrl: new URL("wasm/", base).href,
    iccUrl: new URL("iccs/", base).href,
    enableXfa: false,
    isEvalSupported: false,
    canvasMaxAreaInBytes: 32 * 1024 * 1024
  });
}

/** Caps backing-store memory even for unusually large pages or high device pixel ratios. */
export function pdfPixelRatio(width: number, height: number, deviceRatio: number): number {
  return Math.min(deviceRatio, 2, 8192 / width, 8192 / height, Math.sqrt(16 * 1024 * 1024 / (width * height)));
}
