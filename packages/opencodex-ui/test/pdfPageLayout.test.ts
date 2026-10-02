import { describe, expect, it } from "vitest";
import { pdfPageAt, pdfPageLayout, visiblePdfPages } from "../src/components/files/pdfPageLayout";

const sizes = new Map([[1, { width: 600, height: 800 }]]);

describe("continuous PDF layout", () => {
  it("should reserve offscreen pages without requiring their metadata", () => {
    const pages = pdfPageLayout(1000, 632, null, sizes);
    expect(pages[0]).toMatchObject({ page: 1, top: 0, width: 600, height: 800, scale: 1 });
    expect(pages[999].top).toBe(999 * 816);
    expect(visiblePdfPages(pages, 816 * 50, 800).map((page) => page.page)).toEqual([50, 51, 52]);
  });

  it("should locate page boundaries and retain a valid range at both ends", () => {
    const pages = pdfPageLayout(3, 632, null, sizes);
    expect(pdfPageAt(pages, -20)).toBe(0);
    expect(pdfPageAt(pages, 815)).toBe(0);
    expect(pdfPageAt(pages, 816)).toBe(1);
    expect(pdfPageAt(pages, 99999)).toBe(2);
    expect(visiblePdfPages(pages, 0, 800).map((page) => page.page)).toEqual([1, 2]);
    expect(visiblePdfPages([], 0, 800)).toEqual([]);
  });

  it("should accommodate mixed page sizes and preserve a page-relative reading anchor on zoom", () => {
    const mixed = new Map([...sizes, [2, { width: 800, height: 400 }] as const]);
    const fitted = pdfPageLayout(3, 632, null, mixed);
    expect(fitted[1]).toMatchObject({ width: 600, height: 300, scale: 0.75 });
    const zoomed = pdfPageLayout(3, 632, 2, mixed);
    const top = zoomed[1].top + zoomed[1].height * 0.5;
    expect(pdfPageAt(zoomed, top)).toBe(1);
    expect((top - zoomed[1].top) / zoomed[1].height).toBe(0.5);
  });
});
