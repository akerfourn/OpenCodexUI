import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceChangesScript } from "../src/backend/files/workspaceChangesScript.js";

let root: string;

/** Executes the exact source worker with deterministic time and optional inaccessible metadata. */
function scanner(io: object = fs, now = () => 0) {
  return vm.runInNewContext(`${workspaceChangesScript}\nmeasureWorkspaceChanges`, {
    fs: io, path, crypto, process: { platform: process.platform }, Date: { now },
    contains: (parent: string, file: string) => {
      const relative = path.relative(parent, file);
      return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    }, fail: (code: string, message: string) => { throw Object.assign(new Error(message), { fileCode: code }); }
  }) as (root: string, files: string[]) => Promise<{ fingerprint: string; complete: boolean }>;
}

beforeEach(async () => { root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "workspace-change-scan-"))); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe("bounded metadata-only change fingerprints", () => {
  it("should fingerprint a deterministic inventory without reading contents or depending on enumeration order", async () => {
    await fs.writeFile(path.join(root, "a"), "a");
    await fs.writeFile(path.join(root, "b"), "b");
    const readFile = vi.fn(() => { throw new Error("Contents must not be read"); });
    const scan = scanner({ ...fs, readFile });
    const first = await scan(root, ["a", "b"]);
    expect(first.complete).toBe(true);
    expect(await scan(root, ["b", "a", "a"])).toEqual(first);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("should fingerprint link metadata without traversing the target", async () => {
    await fs.symlink(path.dirname(root), path.join(root, "external"));
    expect((await scanner()(root, ["external"])).complete).toBe(true);
    expect((await scanner()(root, ["external/secret"])).complete).toBe(false);
  });

  it("should recheck cached ancestors if a directory is replaced with a symlink during scanning", async () => {
    const directory = path.join(root, "parent");
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, "a"), "a");
    await fs.writeFile(path.join(directory, "b"), "b");
    const lstat = vi.fn(async (file: string, ...args: unknown[]) => {
      const stat = await fs.lstat(file, ...args as []);
      if (file === path.join(directory, "a")) {
        await fs.rename(directory, path.join(root, "moved"));
        await fs.symlink(path.join(root, "moved"), directory);
      }
      return stat;
    });
    expect((await scanner({ ...fs, lstat })(root, ["parent/a", "parent/b"])).complete).toBe(false);
    expect(lstat.mock.calls.some(([file]) => file === path.join(directory, "b"))).toBe(false);
  });

  it.each(["../outside", ".git/config", "/absolute"])("should reject invalid inventory paths: %s", async file => {
    await expect(scanner()(root, [file])).rejects.toThrow(/Invalid|belong/);
  });

  it("should report partial results for inaccessible files and submodule directory entries", async () => {
    await fs.mkdir(path.join(root, "submodule"));
    expect((await scanner()(root, ["submodule"])).complete).toBe(false);
    const io = { ...fs, lstat: async (file: string, ...args: unknown[]) => {
      if (file === path.join(root, "denied")) throw new Error("EACCES");
      return await fs.lstat(file, ...args as []);
    } };
    expect((await scanner(io)(root, ["denied"])).complete).toBe(false);
  });

  it("should bound elapsed time and inventory size without waiting on real timers", async () => {
    let calls = 0;
    expect((await scanner(fs, () => calls++ === 0 ? 0 : 20001)(root, ["file"])).complete).toBe(false);
    await expect(scanner()(root, Array(100001).fill("file"))).rejects.toThrow("100000");
  });
});
