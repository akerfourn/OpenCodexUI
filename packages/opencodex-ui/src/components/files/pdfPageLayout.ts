/** Intrinsic PDF dimensions before applying viewer zoom. */
export interface PdfPageSize { width: number; height: number }
/** Positioned page reservation, including pages not currently rendered. */
export interface PdfPagePlacement { page: number; top: number; width: number; height: number; scale: number }

/** Reserves all page positions without decoding offscreen pages. */
export function pdfPageLayout(count: number, width: number, zoom: number | null,
  sizes: ReadonlyMap<number, PdfPageSize>): PdfPagePlacement[] {
  const fallback = sizes.get(1) ?? { width: 595, height: 842 };
  const pages: PdfPagePlacement[] = [];
  let top = 0;
  for (let page = 1; page <= count; page += 1) {
    const size = sizes.get(page) ?? fallback;
    const scale = zoom ?? Math.max(0.1, (width - 32) / size.width);
    const height = size.height * scale;
    pages.push({ page, top, width: size.width * scale, height, scale });
    top += height + 16;
  }
  return pages;
}

/** Locates the page at a scroll position in logarithmic time. */
export function pdfPageAt(pages: readonly PdfPagePlacement[], top: number): number {
  let low = 0;
  let high = pages.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const page = pages[middle];
    if (page !== undefined && page.top <= top) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** Renders the viewport and one neighboring page on each side, never the entire PDF. */
export function visiblePdfPages(pages: readonly PdfPagePlacement[], top: number,
  height: number): PdfPagePlacement[] {
  if (pages.length === 0) return [];
  return pages.slice(Math.max(0, pdfPageAt(pages, top) - 1), pdfPageAt(pages, top + height) + 2);
}
