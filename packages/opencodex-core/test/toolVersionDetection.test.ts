import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isCodexCliVersionSupported,
  readCommandLinkTarget,
  readGitVersionStatus
} from "../src/backend/sources/toolVersionDetection";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), createSourceExecutableResolver: vi.fn() }));

vi.mock("node:child_process", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:child_process")>(),
  spawn: mocks.spawn
}));
vi.mock("../src/backend/sources/sourceExecutableResolver.js", () => ({
  createSourceExecutableResolver: mocks.createSourceExecutableResolver
}));

describe("toolVersionDetection", () => {
  afterEach(() => vi.resetAllMocks());

  it("should detect Git through the native executable resolved for the local host", async () => {
    const executable = "C:\\Program Files\\Git\\cmd\\git.exe";
    const resolveExecutable = vi.fn().mockResolvedValue(executable);
    mocks.createSourceExecutableResolver.mockReturnValue(resolveExecutable);
    mocks.spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
      queueMicrotask(() => {
        child.stdout.end("git version 2.56.1.windows.1\n");
        child.stderr.end();
        child.emit("close", 0);
      });
      return child;
    });

    await expect(readGitVersionStatus()).resolves.toMatchObject({ status: "ready", version: "2.56.1" });

    expect(mocks.createSourceExecutableResolver).toHaveBeenCalledWith({ kind: "local" });
    expect(resolveExecutable).toHaveBeenCalledWith("git", process.cwd(), undefined);
    expect(mocks.spawn).toHaveBeenCalledWith(executable, ["--version"], expect.objectContaining({ shell: false }));
  });

  it("should reject Codex CLI versions older than 0.148.0", () => {
    expect(isCodexCliVersionSupported("0.146.0")).toBe(false);
    expect(isCodexCliVersionSupported("0.147.0")).toBe(false);
    expect(isCodexCliVersionSupported("0.147.9")).toBe(false);
    expect(isCodexCliVersionSupported("0.148.0")).toBe(true);
    expect(isCodexCliVersionSupported("0.148.1")).toBe(true);
    expect(isCodexCliVersionSupported("0.149.0")).toBe(true);
  });

  it.skipIf(process.platform === "win32")("should resolve a symbolic-link command target", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-link-"));
    const target = path.join(directory, "codex-target");
    const link = path.join(directory, "codex");

    try {
      fs.writeFileSync(target, "codex");
      fs.symlinkSync(target, link);

      expect(readCommandLinkTarget(link)).toBe(target);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
