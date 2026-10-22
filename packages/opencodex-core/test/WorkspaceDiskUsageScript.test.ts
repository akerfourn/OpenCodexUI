import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OpenCodexWorkspaceDiskUsageValues } from "@open-codex-ui/opencodex-protocol";
import { workspaceDiskUsageScript } from "../src/backend/files/workspaceDiskUsageScript.js";

/** Executes the exact source program with controlled I/O and a fixed clock. */
function scanner(overrides: { fs?: object; now?: () => number; platform?: string } = {}) {
  return vm.runInNewContext(`${workspaceDiskUsageScript}\nmeasureWorkspaceDiskUsage`, {
    fs: overrides.fs ?? fs, path, process: { platform: overrides.platform ?? process.platform },
    Date: { now: overrides.now ?? (() => 0) },
    fail: (code: string, message: string) => { throw Object.assign(new Error(message), { fileCode: code }); }
  }) as (root: string) => Promise<OpenCodexWorkspaceDiskUsageValues>;
}

describe("bounded workspace filesystem estimates", () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(tmpdir(), "workspace-size-")); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it("should include ignored files and exclude Git metadata without using Git or reading file contents", async () => {
    await fs.mkdir(path.join(root, "node_modules"));
    await fs.mkdir(path.join(root, ".git"));
    await fs.writeFile(path.join(root, ".git", "objects"), "shared Git data");
    await fs.writeFile(path.join(root, "node_modules", "ignored"), "12345");
    await fs.writeFile(path.join(root, "source"), "abc");
    const result = await scanner()(root);
    expect(result).toMatchObject({ logicalBytes: 8, fileCount: 2, complete: true, unreadableEntries: 0 });
    if (process.platform !== "win32") expect(result.allocatedBytes).toBeGreaterThanOrEqual(0);
  });

  it("should exclude .git pointer files in secondary checkouts and nested repositories", async () => {
    await fs.writeFile(path.join(root, ".git"), "gitdir: /shared/repository/worktrees/test");
    await fs.mkdir(path.join(root, "nested", ".git"), { recursive: true });
    await fs.writeFile(path.join(root, "nested", ".git", "config"), "excluded");
    await fs.writeFile(path.join(root, "nested", "file"), "keep");
    expect(await scanner()(root)).toMatchObject({ logicalBytes: 4, fileCount: 1, complete: true });
  });

  it.skipIf(process.platform === "win32")("should skip external, internal, cyclic and broken symlink targets", async () => {
    await fs.writeFile(path.join(root, "file"), "abc");
    await fs.symlink(path.join(root, "file"), path.join(root, "internal"));
    await fs.symlink(root, path.join(root, "cycle"));
    await fs.symlink(path.dirname(root), path.join(root, "external"));
    await fs.symlink(path.join(root, "missing"), path.join(root, "broken"));
    expect(await scanner()(root)).toMatchObject({ logicalBytes: 3, fileCount: 1, skippedLinks: 4, complete: true });
  });

  it("should count hard-linked files once within a measurement", async () => {
    await fs.writeFile(path.join(root, "file"), "abc");
    await fs.link(path.join(root, "file"), path.join(root, "alias"));
    expect(await scanner()(root)).toMatchObject({ logicalBytes: 3, fileCount: 1, complete: true });
  });

  it("should explicitly use logical file sizes on Windows even if block fields happen to exist", async () => {
    await fs.writeFile(path.join(root, "file"), "abc");
    expect(await scanner({ platform: "win32" })(root)).toMatchObject({ logicalBytes: 3, allocatedBytes: null });
  });

  it("should retain a partial estimate when a child directory is inaccessible", async () => {
    const denied = path.join(root, "denied");
    await fs.mkdir(denied);
    await fs.writeFile(path.join(root, "readable"), "abc");
    const io = { ...fs, opendir: async (directory: string) => {
      if (directory === denied) throw new Error("EACCES");
      return await fs.opendir(directory);
    } };
    expect(await scanner({ fs: io })(root)).toMatchObject({ logicalBytes: 3, complete: false, unreadableEntries: 1 });
  });

  it("should bound traversal time without waiting for a real timer", async () => {
    let calls = 0;
    const now = () => { calls += 1; return calls === 1 ? 0 : 20001; };
    expect(await scanner({ now })(root)).toMatchObject({ complete: false, limitReached: true });
  });

  it("should bound entry counts in a huge directory", async () => {
    const io = { ...fs, opendir: async () => ({ async *[Symbol.asyncIterator]() {
      for (let index = 0; index < 100001; index += 1) yield { name: ".git" };
    } }) };
    expect(await scanner({ fs: io })(root)).toMatchObject({ complete: false, limitReached: true });
  });

  it("should report missing roots as failures instead of zero-sized checkouts", async () => {
    await expect(scanner()(path.join(root, "missing"))).rejects.toThrow("ENOENT");
  });
});
