import { mkdtemp, writeFile, readFile, mkdir, symlink, rm, chmod, stat, lstat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OpenCodexFileSnapshot, OpenCodexFileTarget } from "@open-codex-ui/opencodex-protocol";
import { runLocalFileOperation } from "../src/backend/files/runFileOperation.js";

let root: string;
let target: OpenCodexFileTarget;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "opencodex-files-test-"));
  target = {
    sourceId: "source",
    projectId: "project",
    workspaceId: "workspace",
    workspacePath: root,
    path: "file.txt"
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Reads a successfully loaded snapshot for follow-up mutations. */
async function snapshot(): Promise<OpenCodexFileSnapshot> {
  const result = await runLocalFileOperation({ type: "workspaceFiles.read", target });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.details);
  return result.value as OpenCodexFileSnapshot;
}

describe("workspace filesystem", () => {
  it("should distinguish a dotted directory from an extensionless file without reading contents", async () => {
    await mkdir(join(root, "folder.with.dots"));
    await writeFile(join(root, "LICENSE"), "text");
    expect(await runLocalFileOperation({ type: "workspaceFiles.stat", target: { ...target, path: "folder.with.dots" } }))
      .toMatchObject({ ok: true, value: { kind: "directory" } });
    expect(await runLocalFileOperation({ type: "workspaceFiles.stat", target: { ...target, path: "LICENSE" } }))
      .toMatchObject({ ok: true, value: { kind: "file" } });
    expect(await runLocalFileOperation({ type: "workspaceFiles.stat", target: { ...target, path: "" } }))
      .toMatchObject({ ok: true, value: { kind: "directory" } });
  });

  it("should list dotfiles and untracked children with directories first without recursing", async () => {
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, ".env"), "KEY=value");
    await writeFile(join(root, "z.txt"), "text");
    const result = await runLocalFileOperation({
      type: "workspaceFiles.list",
      target: { ...target, path: "" }
    });
    expect(result).toEqual({
      ok: true,
      value: [
        { name: "node_modules", kind: "directory" },
        { name: ".env", kind: "file" },
        { name: "z.txt", kind: "file" }
      ]
    });
  });

  it("should preserve BOM, CRLF and executable permissions on explicit save", async () => {
    await writeFile(join(root, target.path), "\uFEFFfirst\r\nsecond\r\n");
    await chmod(join(root, target.path), 0o755);
    const before = await snapshot();
    const result = await runLocalFileOperation({
      type: "workspaceFiles.save",
      target,
      revision: before.revision,
      bom: before.bom,
      content: "edited\nsecond\n"
    });
    expect(result.ok).toBe(true);
    expect(await readFile(join(root, target.path), "utf8")).toBe("\uFEFFedited\r\nsecond\r\n");
    if (process.platform !== "win32") expect((await stat(join(root, target.path))).mode & 0o777).toBe(0o755);
  });

  it("should refuse an external edit and leave the external version intact", async () => {
    await writeFile(join(root, target.path), "original");
    const before = await snapshot();
    await writeFile(join(root, target.path), "agent edit");
    const result = await runLocalFileOperation({
      type: "workspaceFiles.save",
      target,
      revision: before.revision,
      bom: false,
      content: "user edit"
    });
    expect(result).toMatchObject({ ok: false, code: "conflict" });
    expect(await readFile(join(root, target.path), "utf8")).toBe("agent edit");
  });

  it("should not recreate a deleted file", async () => {
    await writeFile(join(root, target.path), "original");
    const before = await snapshot();
    await rm(join(root, target.path));
    const result = await runLocalFileOperation({
      type: "workspaceFiles.save",
      target,
      revision: before.revision,
      bom: false,
      content: "user edit"
    });
    expect(result).toMatchObject({ ok: false, code: "inaccessible" });
    await expect(stat(join(root, target.path))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("should reject traversal and symbolic links to ancestor directories", async () => {
    await writeFile(join(root, target.path), "original");
    await symlink(root, join(root, "loop"), process.platform === "win32" ? "junction" : "dir");
    for (const path of ["../file.txt", "/etc/passwd", "C:\\outside.txt"]) {
      expect(
        await runLocalFileOperation({ type: "workspaceFiles.read", target: { ...target, path } })
      ).toMatchObject({ ok: false, code: "invalidPath" });
    }
    expect(
      await runLocalFileOperation({
        type: "workspaceFiles.read",
        target: { ...target, path: "loop/file.txt" }
      })
    ).toMatchObject({ ok: false, code: "symlink" });
  });

  it("should browse linked directories and save linked files without replacing the link", async () => {
    await mkdir(join(root, "actual"));
    await writeFile(join(root, "actual", "text.txt"), "original");
    await symlink(join(root, "actual"), join(root, "alias"), "junction");
    await symlink(join(root, "actual", "text.txt"), join(root, "file.txt"), "file");
    const listing = await runLocalFileOperation({ type: "workspaceFiles.list", target: { ...target, path: "" } });
    expect(listing).toMatchObject({ ok: true, value: expect.arrayContaining([
      expect.objectContaining({ name: "alias", kind: "directory", linkTarget: join(root, "actual") }),
      expect.objectContaining({ name: "file.txt", kind: "file", linkTarget: join(root, "actual", "text.txt") })
    ]) });
    expect(await runLocalFileOperation({ type: "workspaceFiles.list", target: { ...target, path: "alias" } }))
      .toEqual({ ok: true, value: [{ name: "text.txt", kind: "file" }] });
    const before = await snapshot();
    expect(await runLocalFileOperation({ type: "workspaceFiles.save", target,
      revision: before.revision, bom: false, content: "edited" })).toMatchObject({ ok: true });
    expect((await lstat(join(root, "file.txt"))).isSymbolicLink()).toBe(true);
    expect(await readFile(join(root, "actual", "text.txt"), "utf8")).toBe("edited");
  });

  it("should retain blocked links in listings and refuse direct access outside the workspace", async () => {
    await mkdir(join(root, "workspace"));
    await writeFile(join(root, "outside.txt"), "private");
    const context = { ...target, workspacePath: join(root, "workspace"), path: "" };
    await symlink(join(root, "outside.txt"), join(context.workspacePath, "outside"), "file");
    await symlink(join(root, "missing"), join(context.workspacePath, "broken"), "file");
    await symlink(context.workspacePath, join(context.workspacePath, "loop"), "junction");
    const listing = await runLocalFileOperation({ type: "workspaceFiles.list", target: context });
    expect(listing).toMatchObject({ ok: true, value: [
      { name: "broken", kind: "symlink", linkError: "inaccessible" },
      { name: "loop", kind: "symlink", linkError: "symlink" },
      { name: "outside", kind: "file", linkError: "accessDenied" }
    ] });
    expect(await runLocalFileOperation({ type: "workspaceFiles.read", target: { ...context, path: "outside" } }))
      .toMatchObject({ ok: false, code: "accessDenied" });
  });

  it("should reject a cycle between links without hanging or hiding the directory", async () => {
    await symlink("second", join(root, "first"), "file");
    await symlink("first", join(root, "second"), "file");
    expect(await runLocalFileOperation({ type: "workspaceFiles.list", target: { ...target, path: "" } }))
      .toMatchObject({ ok: true, value: [
        { name: "first", kind: "symlink", linkError: "symlink" },
        { name: "second", kind: "symlink", linkError: "symlink" }
      ] });
    expect(await runLocalFileOperation({ type: "workspaceFiles.read", target: { ...target, path: "first" } }))
      .toMatchObject({ ok: false, code: "symlink" });
  });

  it("should reject saving when a link is redirected after opening", async () => {
    await writeFile(join(root, "first.txt"), "same text");
    await writeFile(join(root, "second.txt"), "same text");
    await symlink(join(root, "first.txt"), join(root, target.path), "file");
    const before = await snapshot();
    await rm(join(root, target.path));
    await symlink(join(root, "second.txt"), join(root, target.path), "file");
    expect(await runLocalFileOperation({ type: "workspaceFiles.save", target,
      revision: before.revision, bom: false, content: "edited" }))
      .toMatchObject({ ok: false, code: "conflict" });
    expect(await readFile(join(root, "second.txt"), "utf8")).toBe("same text");
  });

  it("should reject binary, invalid UTF-8 and oversized files before editing", async () => {
    for (const [data, code] of [
      [Buffer.from([0, 1, 2]), "binary"],
      [Buffer.from([0xc3, 0x28]), "encoding"],
      [Buffer.alloc(2 * 1024 * 1024 + 1, 65), "tooLarge"]
    ] as const) {
      await writeFile(join(root, target.path), data);
      expect(await runLocalFileOperation({ type: "workspaceFiles.read", target })).toMatchObject({
        ok: false,
        code
      });
    }
  });

  it("should keep mixed line endings read-only", async () => {
    await writeFile(join(root, target.path), "first\r\nsecond\n");
    const before = await snapshot();
    expect(before).toMatchObject({ readOnly: true, eol: "mixed" });
    expect(
      await runLocalFileOperation({
        type: "workspaceFiles.save",
        target,
        revision: before.revision,
        bom: before.bom,
        content: "new"
      })
    ).toMatchObject({ ok: false, code: "readOnly" });
  });
});
