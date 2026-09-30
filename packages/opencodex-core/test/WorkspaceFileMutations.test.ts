import { mkdtemp, mkdir, writeFile, readFile, lstat, readdir, readlink, symlink, rm, chmod, truncate, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexFileTarget } from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import { runLocalFileOperation } from "../src/backend/files/runFileOperation.js";
import { WorkspaceFilesService } from "../src/backend/files/WorkspaceFilesService.js";

let root: string;
let target: OpenCodexFileTarget;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "files-mutations-")));
  target = { sourceId: "source", projectId: "project", workspaceId: "ws", workspacePath: root, path: "original" };
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("workspace file mutations", () => {
  it.skipIf(process.platform === "win32")("should allow renaming existing source-specific filenames to portable names", async () => {
    target = { ...target, path: "existing?." };
    await writeFile(join(root, target.path), "keep");
    expect(await runLocalFileOperation({ type: "workspaceFiles.rename", target, name: "portable.txt" }))
      .toMatchObject({ ok: true, value: { path: "portable.txt" } });
    expect(await readFile(join(root, "portable.txt"), "utf8")).toBe("keep");
  });

  it("should copy complete folders including dotfiles and binary data without changing the source", async () => {
    await mkdir(join(root, "original", "nested"), { recursive: true });
    const bytes = Buffer.from([0, 255, 12, 18]);
    await writeFile(join(root, "original", "nested", "image.bin"), bytes);
    await writeFile(join(root, "original", ".hidden"), "hidden");
    expect(await runLocalFileOperation({ type: "workspaceFiles.copy", target, destinationPath: "", name: "copy" }))
      .toEqual({ ok: true, value: { path: "copy" } });
    expect(await readFile(join(root, "copy", "nested", "image.bin"))).toEqual(bytes);
    expect(await readFile(join(root, "copy", ".hidden"), "utf8")).toBe("hidden");
    expect(await readFile(join(root, "original", "nested", "image.bin"))).toEqual(bytes);
    expect((await readdir(root)).sort()).toEqual(["copy", "original"]);
  });

  it("should rename files and populated folders and delete their contents explicitly", async () => {
    await mkdir(join(root, "original"));
    await writeFile(join(root, "original", "file.txt"), "keep");
    expect(await runLocalFileOperation({ type: "workspaceFiles.rename", target, name: "renamed" }))
      .toEqual({ ok: true, value: { path: "renamed" } });
    const file = { ...target, path: "renamed/file.txt" };
    expect(await runLocalFileOperation({ type: "workspaceFiles.rename", target: file, name: "écriture.txt" }))
      .toEqual({ ok: true, value: { path: "renamed/écriture.txt" } });
    expect(await readFile(join(root, "renamed", "écriture.txt"), "utf8")).toBe("keep");
    expect(await runLocalFileOperation({ type: "workspaceFiles.delete", target: { ...target, path: "renamed" } }))
      .toMatchObject({ ok: true });
    await expect(lstat(join(root, "renamed"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("should reject copy and rename collisions without changing either existing file", async () => {
    await writeFile(join(root, "original"), "original");
    await writeFile(join(root, "existing"), "existing");
    for (const type of ["workspaceFiles.copy", "workspaceFiles.rename"] as const) {
      expect(await runLocalFileOperation({ type, target, destinationPath: "", name: "existing" }))
        .toMatchObject({ ok: false, code: "alreadyExists" });
    }
    expect(await readFile(join(root, "original"), "utf8")).toBe("original");
    expect(await readFile(join(root, "existing"), "utf8")).toBe("existing");
  });

  it("should reject root mutations, traversal and invalid destination names", async () => {
    await writeFile(join(root, "original"), "keep");
    for (const path of ["", "/original", "../original", "folder/../original"]) {
      expect(await runLocalFileOperation({ type: "workspaceFiles.delete", target: { ...target, path } }))
        .toMatchObject({ ok: false, code: "invalidPath" });
    }
    for (const name of ["", ".", "..", "../escape", "folder/name", "C:\\escape", "NUL", "file."]) {
      expect(await runLocalFileOperation({ type: "workspaceFiles.rename", target, name }))
        .toMatchObject({ ok: false, code: "invalidPath" });
    }
    expect(await readFile(join(root, "original"), "utf8")).toBe("keep");
  });

  it("should reject copying a directory inside itself even through an alias", async () => {
    await mkdir(join(root, "original", "child"), { recursive: true });
    await symlink(join(root, "original", "child"), join(root, "alias"), "junction");
    for (const destinationPath of ["original", "original/child", "alias"]) {
      expect(await runLocalFileOperation({ type: "workspaceFiles.copy", target, destinationPath, name: "copy" }))
        .toMatchObject({ ok: false, code: "invalidPath" });
    }
    expect(await readdir(join(root, "original", "child"))).toEqual([]);
  });

  it("should copy, rename and delete links themselves without traversing an external target", async () => {
    await mkdir(join(root, "workspace"));
    await mkdir(join(root, "outside"));
    await writeFile(join(root, "outside", "keep.txt"), "keep");
    target = { ...target, workspacePath: join(root, "workspace") };
    await symlink(join(root, "outside"), join(target.workspacePath, "original"), "junction");
    expect(await runLocalFileOperation({ type: "workspaceFiles.copy", target, destinationPath: "", name: "link-copy" }))
      .toMatchObject({ ok: true });
    expect((await lstat(join(target.workspacePath, "link-copy"))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(target.workspacePath, "link-copy"))).toBe(await readlink(join(target.workspacePath, "original")));
    expect(await runLocalFileOperation({ type: "workspaceFiles.rename", target, name: "renamed" })).toMatchObject({ ok: true });
    expect(await runLocalFileOperation({ type: "workspaceFiles.delete", target: { ...target, path: "renamed" } }))
      .toMatchObject({ ok: true });
    expect(await readFile(join(root, "outside", "keep.txt"), "utf8")).toBe("keep");
  });

  it("should preserve dangling links when copying folders and remove them without following them", async () => {
    await mkdir(join(root, "original"));
    await symlink("missing.txt", join(root, "original", "broken"), "file");
    expect(await runLocalFileOperation({ type: "workspaceFiles.copy", target, destinationPath: "", name: "copy" }))
      .toMatchObject({ ok: true });
    expect(await readlink(join(root, "copy", "broken"))).toBe("missing.txt");
    expect(await runLocalFileOperation({ type: "workspaceFiles.delete", target })).toMatchObject({ ok: true });
  });

  it("should enforce read-only ancestors while allowing copies out of an authorized directory", async () => {
    await mkdir(join(root, "workspace"));
    await mkdir(join(root, "outside"));
    await writeFile(join(root, "outside", "file"), "keep");
    const workspacePath = join(root, "workspace");
    await symlink(join(root, "outside"), join(workspacePath, "link"), "junction");
    target = { ...target, workspacePath, path: "link/file" };
    const permissions = [{ ...target, destination: join(root, "outside"), access: "readOnly" as const }];
    expect(await runLocalFileOperation({ type: "workspaceFiles.delete", target, permissions }))
      .toMatchObject({ ok: false, code: "readOnly" });
    expect(await runLocalFileOperation({ type: "workspaceFiles.rename", target, name: "new", permissions }))
      .toMatchObject({ ok: false, code: "readOnly" });
    expect(await runLocalFileOperation({ type: "workspaceFiles.copy", target, name: "new", destinationPath: "link", permissions }))
      .toMatchObject({ ok: false, code: "readOnly" });
    expect(await runLocalFileOperation({ type: "workspaceFiles.copy", target, name: "new", destinationPath: "", permissions }))
      .toMatchObject({ ok: true });
    expect(await readFile(join(workspacePath, "new"), "utf8")).toBe("keep");
  });

  it("should reject an oversized copy before publishing any destination", async () => {
    await writeFile(join(root, "original"), "");
    await truncate(join(root, "original"), 256 * 1024 * 1024 + 1);
    expect(await runLocalFileOperation({ type: "workspaceFiles.copy", target, destinationPath: "", name: "copy" }))
      .toMatchObject({ ok: false, code: "operationLimit" });
    expect(await readdir(root)).toEqual(["original"]);
  });

  it.skipIf(process.platform === "win32")("should reject mutations in a read-only parent", async () => {
    await mkdir(join(root, "readonly"));
    await writeFile(join(root, "readonly", "file"), "keep");
    await chmod(join(root, "readonly"), 0o555);
    try {
      expect(await runLocalFileOperation({ type: "workspaceFiles.delete", target: { ...target, path: "readonly/file" } }))
        .toMatchObject({ ok: false, code: "readOnly" });
    } finally { await chmod(join(root, "readonly"), 0o755); }
  });

  it("should serialize competing destination mutations through the workspace service", async () => {
    await writeFile(join(root, "original"), "keep");
    const repository = { workspaces: { get: vi.fn().mockResolvedValue({ id: "ws", projectId: "project",
      sourceId: "source", path: root, removedAt: null }) } } as unknown as OpenCodexCacheRepository;
    const service = new WorkspaceFilesService(repository,
      { resolveRequestedSource: vi.fn().mockResolvedValue({ kind: "local" }) }, { ensureClient: vi.fn() });
    const request = { type: "workspaceFiles.copy" as const, target, destinationPath: "", name: "copy" };
    const results = await Promise.all([service.execute(request), service.execute(request)]);
    expect(results).toMatchObject([{ ok: true }, { ok: false, code: "alreadyExists" }]);
    expect(await readFile(join(root, "copy"), "utf8")).toBe("keep");
  });
});
