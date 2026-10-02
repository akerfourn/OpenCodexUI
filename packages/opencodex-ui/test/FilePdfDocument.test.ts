import { describe, expect, it, vi } from "vitest";
import { FileDocument } from "../src/stores/files/FileDocument";
import type { OpenCodexPdfSnapshot } from "@open-codex-ui/opencodex-protocol";

const target = { sourceId: "remote", projectId: "project", workspaceId: "ws", workspacePath: "/remote", path: "report.pdf" };
const pdf: OpenCodexPdfSnapshot = { kind: "pdf", dataBase64: "JVBERi0=", byteLength: 5, revision: "v1", readOnly: true };

/** Creates an isolated document backed by a controlled source boundary. */
async function fixture(workspaceId = "ws") {
  const request = vi.fn().mockResolvedValue({ ok: true, value: pdf });
  const document = new FileDocument(workspaceId, "report.pdf", { ...target, workspaceId }, workspaceId, { request });
  await document.reload();
  return { document, request };
}

describe("PDF documents", () => {
  it("should remain read-only and isolate reading position between workspaces", async () => {
    const first = await fixture();
    const second = await fixture("other");
    first.document.pdfPage = 3;
    first.document.pdfZoom = 2;
    first.document.edit("cannot overwrite PDF");
    expect(first.document.isReadOnly).toBe(true);
    expect(first.document.isDirty).toBe(false);
    expect(first.document.canPreviewMarkdown).toBe(false);
    expect(second.document.pdfPage).toBe(1);
    expect(second.document.pdfZoom).toBeNull();
    expect(first.request).toHaveBeenCalledWith({ type: "workspaceFiles.read", target, previewImages: true, previewPdf: true });
  });

  it("should retain bytes after failed reads and preserve navigation when the disk changes", async () => {
    const { document, request } = await fixture();
    document.pdfPage = 2;
    document.pdfZoom = 0.5;
    request.mockResolvedValueOnce({ ok: false, code: "unavailable", details: "Source disconnected" });
    await document.reload();
    expect(document.pdfSnapshot).toEqual(pdf);
    expect(document.error?.code).toBe("unavailable");
    request.mockResolvedValueOnce({ ok: true, value: false })
      .mockResolvedValueOnce({ ok: true, value: { ...pdf, revision: "v2" } });
    await document.checkExternal();
    expect(document.pdfSnapshot?.revision).toBe("v2");
    expect(document.pdfPage).toBe(2);
    expect(document.pdfZoom).toBe(0.5);
    expect(document.error).toBeNull();
  });

  it("should ignore late reads after disposal and clear old PDF data on format changes", async () => {
    const { document, request } = await fixture();
    request.mockResolvedValueOnce({ ok: true, value: { kind: "image", dataUrl: "data:image/png;base64,",
      mimeType: "image/png", byteLength: 0, revision: "v2", readOnly: true } });
    await document.reload();
    expect(document.pdfSnapshot).toBeNull();
    expect(document.imageSnapshot?.kind).toBe("image");
    let resolve!: (value: unknown) => void;
    request.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = document.reload();
    document.dispose();
    resolve({ ok: true, value: pdf });
    await pending;
    expect(document.pdfSnapshot).toBeNull();
  });
});
