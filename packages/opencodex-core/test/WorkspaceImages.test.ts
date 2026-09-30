import { mkdtemp, writeFile, mkdir, symlink, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OpenCodexFileTarget, OpenCodexImageSnapshot } from "@open-codex-ui/opencodex-protocol";
import { runLocalFileOperation } from "../src/backend/files/runFileOperation.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64"
);
let root: string;
let target: OpenCodexFileTarget;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "opencodex-images-"));
  target = { sourceId: "source", projectId: "project", workspaceId: "workspace",
    workspacePath: root, path: "image.png" };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Reads an image through the same bounded worker used by local and remote sources. */
async function readImage(): Promise<OpenCodexImageSnapshot> {
  const result = await runLocalFileOperation({ type: "workspaceFiles.read", target, previewImages: true });
  if (!result.ok) throw new Error(result.details);
  return result.value as OpenCodexImageSnapshot;
}

describe("workspace image reads", () => {
  it("should transfer exact PNG bytes while keeping text-only callers strict", async () => {
    await writeFile(join(root, target.path), png);
    expect(await readImage()).toMatchObject({ kind: "image", mimeType: "image/png",
      dataUrl: `data:image/png;base64,${png.toString("base64")}`, byteLength: png.length, readOnly: true });
    expect(await runLocalFileOperation({ type: "workspaceFiles.read", target }))
      .toMatchObject({ ok: false, code: "binary" });
  });

  it.each([
    ["ffd8ffe0", "image/jpeg"],
    ["474946383961", "image/gif"],
    ["524946461000000057454250", "image/webp"],
    ["424d10000000", "image/bmp"],
    ["000001000100", "image/x-icon"],
    ["000000206674797061766966", "image/avif"]
  ])("should recognize %s from its header even with an unrelated extension", async (hex, mimeType) => {
    const bytes = Buffer.from(hex, "hex");
    target = { ...target, path: "image.dat" };
    await writeFile(join(root, target.path), bytes);
    expect(await readImage()).toMatchObject({ kind: "image", mimeType,
      dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}` });
  });

  it("should preview SVG as isolated image bytes and leave ordinary text editable", async () => {
    target = { ...target, path: "drawing.SVG" };
    const svg = '\uFEFF<?xml version="1.0"?>\n<!-- drawing -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    await writeFile(join(root, target.path), svg);
    expect(await readImage()).toMatchObject({ kind: "image", mimeType: "image/svg+xml",
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` });
    await writeFile(join(root, target.path), "ordinary text");
    expect(await runLocalFileOperation({ type: "workspaceFiles.read", target, previewImages: true }))
      .toMatchObject({ ok: true, value: { content: "ordinary text", readOnly: false } });
  });

  it("should allow images above the text limit but reject images above 10 MiB and large disguised text", async () => {
    const large = Buffer.alloc(2 * 1024 * 1024 + 1);
    png.copy(large);
    await writeFile(join(root, target.path), large);
    expect((await readImage()).byteLength).toBe(large.length);
    await writeFile(join(root, target.path), Buffer.alloc(2 * 1024 * 1024 + 1, 65));
    expect(await runLocalFileOperation({ type: "workspaceFiles.read", target, previewImages: true }))
      .toMatchObject({ ok: false, code: "tooLarge", details: expect.stringContaining("2 MiB") });
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
    png.copy(oversized);
    await writeFile(join(root, target.path), oversized);
    expect(await runLocalFileOperation({ type: "workspaceFiles.read", target, previewImages: true }))
      .toMatchObject({ ok: false, code: "tooLarge", details: expect.stringContaining("10 MiB") });
  });

  it("should detect external image changes and refuse a text save over PNG bytes", async () => {
    await writeFile(join(root, target.path), png);
    const original = await readImage();
    const check = { type: "workspaceFiles.check" as const, target, revision: original.revision, previewImages: true };
    expect(await runLocalFileOperation(check)).toEqual({ ok: true, value: true });
    expect(await runLocalFileOperation({ type: "workspaceFiles.save", target,
      revision: original.revision, bom: false, content: "overwrite" })).toMatchObject({ ok: false, code: "binary" });
    expect(await readFile(join(root, target.path))).toEqual(png);
    await writeFile(join(root, target.path), Buffer.concat([png, Buffer.from("changed")]));
    expect(await runLocalFileOperation(check)).toEqual({ ok: true, value: false });
  });

  it("should enforce workspace containment and external link grants for images", async () => {
    await writeFile(join(root, "outside.png"), png);
    const workspacePath = join(root, "workspace");
    await mkdir(workspacePath);
    target = { ...target, workspacePath };
    await symlink(join(root, "outside.png"), join(workspacePath, target.path), "file");
    const request = { type: "workspaceFiles.read" as const, target, previewImages: true };
    expect(await runLocalFileOperation(request)).toMatchObject({ ok: false, code: "accessDenied" });
    expect(await runLocalFileOperation({ ...request, permissions: [{ ...target,
      destination: join(root, "outside.png"), access: "readOnly" }] }))
      .toMatchObject({ ok: true, value: { kind: "image", readOnly: true } });
    expect(await runLocalFileOperation({ ...request, target: { ...target, path: "../outside.png" } }))
      .toMatchObject({ ok: false, code: "invalidPath" });
  });
});
