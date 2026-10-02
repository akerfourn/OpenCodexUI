import { mkdtemp, writeFile, readFile, rm, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { OpenCodexFileTarget, OpenCodexPdfSnapshot } from "@open-codex-ui/opencodex-protocol";
import { runLocalFileOperation } from "../src/backend/files/runFileOperation.js";

let root: string;
let target: OpenCodexFileTarget;
const bytes = Buffer.from("%PDF-1.7\nsource-owned bytes\n%%EOF");
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "files-pdf-"));
  target = { sourceId: "source", projectId: "project", workspaceId: "workspace", workspacePath: root, path: "report.pdf" };
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

/** Uses the same worker as production and keeps binary snapshots strongly typed. */
async function readPdf(): Promise<OpenCodexPdfSnapshot> {
  const result = await runLocalFileOperation({ type: "workspaceFiles.read", target, previewPdf: true });
  if (!result.ok) throw new Error(result.details);
  return result.value as OpenCodexPdfSnapshot;
}

describe("PDF source reads", () => {
  it("should transfer exact bytes and refuse text editing even for ASCII-only PDFs", async () => {
    await writeFile(join(root, target.path), bytes);
    const snapshot = await readPdf();
    expect(snapshot).toMatchObject({ kind: "pdf", dataBase64: bytes.toString("base64"), byteLength: bytes.length, readOnly: true });
    expect(await runLocalFileOperation({ type: "workspaceFiles.save", target, revision: snapshot.revision,
      content: "overwrite", bom: false })).toMatchObject({ ok: false, code: "binary" });
    expect(await readFile(join(root, target.path))).toEqual(bytes);
  });

  it("should recognize a PDF header without relying on the filename", async () => {
    target = { ...target, path: "download.dat" };
    await writeFile(join(root, target.path), bytes);
    expect((await readPdf()).kind).toBe("pdf");
  });

  it("should leave text mentioning PDF headers editable", async () => {
    target = { ...target, path: "notes.md" };
    const content = "A PDF starts with %PDF-1.7.";
    await writeFile(join(root, target.path), content);
    expect(await runLocalFileOperation({ type: "workspaceFiles.read", target, previewPdf: true }))
      .toMatchObject({ ok: true, value: { content, readOnly: false } });
  });

  it("should pass malformed .PDF files to the viewer for explicit decoding feedback", async () => {
    target = { ...target, path: "broken.PDF" };
    await writeFile(join(root, target.path), "damaged");
    expect((await readPdf()).dataBase64).toBe(Buffer.from("damaged").toString("base64"));
  });

  it("should enforce the 10 MiB limit and detect external replacement", async () => {
    await writeFile(join(root, target.path), bytes);
    const snapshot = await readPdf();
    const check = { type: "workspaceFiles.check" as const, target, previewPdf: true, revision: snapshot.revision };
    expect(await runLocalFileOperation(check)).toEqual({ ok: true, value: true });
    await writeFile(join(root, target.path), Buffer.concat([bytes, Buffer.from("changed")]));
    expect(await runLocalFileOperation(check)).toEqual({ ok: true, value: false });
    await writeFile(join(root, target.path), Buffer.alloc(10 * 1024 * 1024 + 1));
    expect(await runLocalFileOperation({ type: "workspaceFiles.read", target, previewPdf: true }))
      .toMatchObject({ ok: false, code: "tooLarge", details: expect.stringContaining("10 MiB") });
  });

  it("should enforce external symlink grants before returning PDF bytes", async () => {
    await writeFile(join(root, "outside.pdf"), bytes);
    const workspacePath = join(root, "workspace");
    await mkdir(workspacePath);
    target = { ...target, workspacePath };
    await symlink(join(root, "outside.pdf"), join(workspacePath, target.path));
    const request = { type: "workspaceFiles.read" as const, target, previewPdf: true };
    expect(await runLocalFileOperation(request)).toMatchObject({ ok: false, code: "accessDenied" });
    expect(await runLocalFileOperation({ ...request, permissions: [{ ...target,
      destination: join(root, "outside.pdf"), access: "readOnly" }] }))
      .toMatchObject({ ok: true, value: { kind: "pdf", readOnly: true } });
  });
});
