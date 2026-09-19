import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileAttachments, readTransferFiles } from "../src/components/chat/fileAttachments";

/** Browser file I/O double; real file contents and attachment conversion remain under test. */
class TestFileReader extends EventTarget {
  result: string | null = null;
  error: Error | null = null;

  /** Delivers browser-style data URLs asynchronously. */
  readAsDataURL(file: File): void {
    void file.arrayBuffer().then((bytes) => {
      this.result = `data:${file.type || "application/octet-stream"};base64,${Buffer.from(bytes).toString("base64")}`;
      this.dispatchEvent(new Event("load"));
    });
  }
}

beforeEach(() => { vi.stubGlobal("FileReader", TestFileReader); });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Models the browser clipboard lists without accessing the system clipboard. */
function clipboard(files: File[], items: Partial<DataTransferItem>[] = []): DataTransfer {
  return { files, items } as unknown as DataTransfer;
}

describe("clipboard attachments", () => {
  it("should prefer the file list without duplicating files exposed through items", () => {
    const file = new File(["report"], "report.pdf", { type: "application/pdf" });
    const item = { kind: "file", getAsFile: () => file };
    expect(readTransferFiles(clipboard([file], [item]))).toEqual([file]);
    expect(readTransferFiles(clipboard([], [item]))).toEqual([file]);
  });

  it("should leave text, copied paths and web URLs to the normal paste handler", () => {
    const getAsFile = vi.fn();
    expect(readTransferFiles(clipboard([], [
      { kind: "string", type: "text/plain", getAsFile },
      { kind: "string", type: "text/uri-list", getAsFile }
    ]))).toEqual([]);
    expect(getAsFile).not.toHaveBeenCalled();
    expect(readTransferFiles(clipboard([], [{ kind: "file", getAsFile: () => null }]))).toEqual([]);
  });

  it("should preserve image previews and encode documents regardless of MIME type", async () => {
    const attachments = await readFileAttachments([
      new File(["image"], "screenshot.png", { type: "image/png" }),
      new File(["pdf"], "report.pdf", { type: "application/pdf" }),
      new File(["text"], "notes.md")
    ]);
    expect(attachments).toEqual([
      expect.objectContaining({ kind: "image", name: "screenshot.png", source: "dataUrl", value: "data:image/png;base64,aW1hZ2U=" }),
      expect.objectContaining({ kind: "file", name: "report.pdf", source: "dataUrl", value: "data:application/octet-stream;base64,cGRm" }),
      expect.objectContaining({ kind: "file", name: "notes.md", source: "dataUrl", value: "data:application/octet-stream;base64,dGV4dA==" })
    ]);
    expect(new Set(attachments.map((attachment) => attachment.id)).size).toBe(3);
  });

  it("should enforce the combined size limit before reading clipboard bytes", async () => {
    const read = vi.spyOn(TestFileReader.prototype, "readAsDataURL");
    const files = [{ size: 15 * 1024 * 1024 }, { size: 6 * 1024 * 1024 }] as File[];
    await expect(readFileAttachments(files)).rejects.toThrow("20 MiB");
    expect(read).not.toHaveBeenCalled();
  });

  it("should surface file access failures instead of silently dropping attachments", async () => {
    vi.spyOn(TestFileReader.prototype, "readAsDataURL").mockImplementation(function () {
      this.error = new Error("File was removed");
      this.dispatchEvent(new Event("error"));
    });
    await expect(readFileAttachments([new File([""], "missing.txt")])).rejects.toThrow("File was removed");
  });
});
