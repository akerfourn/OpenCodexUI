import { mkdtemp, writeFile, readFile, mkdir, symlink, rm, chmod, stat } from "node:fs/promises";
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
      .toEqual({ ok: true, value: { kind: "directory" } });
    expect(await runLocalFileOperation({ type: "workspaceFiles.stat", target: { ...target, path: "LICENSE" } }))
      .toEqual({ ok: true, value: { kind: "file" } });
    expect(await runLocalFileOperation({ type: "workspaceFiles.stat", target: { ...target, path: "" } }))
      .toEqual({ ok: true, value: { kind: "directory" } });
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

  it("should reject traversal and symlinks at every level", async () => {
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
