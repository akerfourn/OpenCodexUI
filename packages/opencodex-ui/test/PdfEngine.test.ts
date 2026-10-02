import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { pdfPixelRatio } from "../src/components/files/pdfRuntime";

/** Builds a small valid PDF with explicit byte offsets and no remote resources. */
function pdfFixture(): Uint8Array {
  const stream = "BT /F1 18 Tf 20 100 Td (Offline PDF preview) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 160] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  let content = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(content.length);
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = content.length;
  content += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) content += `${String(offset).padStart(10, "0")} 00000 n \n`;
  content += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(content);
}

describe("bundled PDF engine", () => {
  it("should decode pages and selectable text with the real offline engine", async () => {
    const root = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
    const task = getDocument({ data: pdfFixture(), standardFontDataUrl: join(root, "standard_fonts") + sep });
    try {
      const pdf = await task.promise;
      expect(pdf.numPages).toBe(1);
      const page = await pdf.getPage(1);
      expect(page.getViewport({ scale: 1 }).width).toBe(300);
      const text = await page.getTextContent();
      expect(text.items).toEqual(expect.arrayContaining([expect.objectContaining({ str: "Offline PDF preview" })]));
      expect((await page.getOperatorList()).fnArray.length).toBeGreaterThan(0);
    } finally { await task.destroy(); }
  });

  it("should reject corrupt documents so the viewer can show its fallback", async () => {
    const task = getDocument({ data: new TextEncoder().encode("broken PDF") });
    try {
      await expect(task.promise).rejects.toMatchObject({ name: "InvalidPDFException" });
    } finally { await task.destroy(); }
  });

  it("should bound raster memory for oversized pages and high-DPI screens", () => {
    const ratio = pdfPixelRatio(10000, 20000, 4);
    expect(10000 * 20000 * ratio * ratio).toBeLessThanOrEqual(16 * 1024 * 1024 + 1);
    expect(pdfPixelRatio(300, 160, 3)).toBe(2);
    expect(pdfPixelRatio(1, 100000, 1) * 100000).toBeLessThanOrEqual(8192);
  });
});
