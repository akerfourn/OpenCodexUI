import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createSourceExecutableResolver } from "../src/backend/sources/sourceExecutableResolver";

afterEach(() => { vi.useRealTimers(); });

describe("source-local Windows executable resolution", () => {
  it.skipIf(process.platform !== "win32")("should run a verified native executable by its absolute path with a quoted PATH entry", async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), "opencodex executable lookup-"));
    try {
      const executable = path.join(directory, "git.exe");
      await fs.copyFile(process.execPath, executable);
      const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toUpperCase() !== "PATH"));
      const environment = { ...inherited, Path: `C:\\Missing tools";${directory}` };
      const resolve = createSourceExecutableResolver({ kind: "local" }, { environment });
      const resolved = await resolve!("git", directory, undefined);
      expect(resolved).toBe(executable);
      const result = await promisify(execFile)(resolved, ["--version"], { env: environment, windowsHide: true, timeout: 10_000 });
      expect(result.stdout.trim()).toBe(process.version);
    } finally {
      await fs.rm(directory, { force: true, recursive: true });
    }
  }, 15_000);
  it("should resolve Git after a malformed quoted PATH entry without changing arguments or the environment", async () => {
    const isFile = vi.fn(async (file: string) => file === "C:\\Git with spaces\\cmd\\git.exe");
    const environment = { Path: 'C:\\Program Files\\PowerShell\\7";C:\\Git with spaces\\cmd', SystemRoot: "C:\\Windows" };
    const resolve = createSourceExecutableResolver({ kind: "local" }, { platform: "win32", environment, isFile, now: () => 1 });

    expect(await resolve!("git", "C:\\Projects\\repo", undefined)).toBe("C:\\Git with spaces\\cmd\\git.exe");
    expect(environment.Path).toBe('C:\\Program Files\\PowerShell\\7";C:\\Git with spaces\\cmd');
    expect(isFile).toHaveBeenCalledWith("C:\\Program Files\\PowerShell\\7\\git.exe");
  });

  it("should scope lookup to native local sources and never inspect remote, WSL or custom filesystems", () => {
    const isFile = vi.fn();
    for (const kind of ["ssh", "wsl", "custom"] as const) {
      expect(createSourceExecutableResolver({ kind }, { platform: "win32", isFile })).toBeUndefined();
    }
    expect(createSourceExecutableResolver({ kind: "local" }, { platform: "linux", isFile })).toBeUndefined();
    expect(isFile).not.toHaveBeenCalled();
  });

  it("should preserve explicit paths and leave unresolved names to the source's own error handling", async () => {
    const isFile = vi.fn(async () => false);
    const resolve = createSourceExecutableResolver({ kind: "local" }, { platform: "win32", environment: {}, isFile });
    expect(await resolve!("C:\\Custom\\git.exe", "C:\\Project", undefined)).toBe("C:\\Custom\\git.exe");
    expect(await resolve!(".\\tool.exe", "C:\\Project", undefined)).toBe(".\\tool.exe");
    expect(await resolve!("npm.cmd", "C:\\Project", undefined)).toBe("npm.cmd");
    expect(await resolve!("git", "/home/project", undefined)).toBe("git");
    expect(isFile).not.toHaveBeenCalled();
    expect(await resolve!("missing", "C:\\Project", undefined)).toBe("missing");
  });

  it("should honor per-command environment overrides, including unsetting PATH", async () => {
    const isFile = vi.fn(async (file: string) => file === "D:\\Project tools\\node.exe");
    const resolve = createSourceExecutableResolver({ kind: "local" }, { platform: "win32", environment: { Path: "C:\\Inherited" }, isFile });
    expect(await resolve!("node", "D:\\Project", { PATH: "D:\\Project tools" })).toBe("D:\\Project tools\\node.exe");
    isFile.mockClear();
    expect(await resolve!("node", "D:\\Project", { path: null })).toBe("node");
    expect(isFile).not.toHaveBeenCalled();
  });

  it("should find Windows system helpers even when PATH is missing", async () => {
    const isFile = vi.fn(async (file: string) => file === "D:\\Windows\\System32\\where.exe");
    const resolve = createSourceExecutableResolver({ kind: "local" }, { platform: "win32", environment: { SystemRoot: "D:\\Windows" }, isFile });
    expect(await resolve!("where.exe", "D:\\Project", undefined)).toBe("D:\\Windows\\System32\\where.exe");
  });

  it("should share concurrent checks, expire successful lookups and retry after a missing executable is installed", async () => {
    let clock = 1;
    let exists = true;
    const isFile = vi.fn(async () => exists);
    const resolve = createSourceExecutableResolver({ kind: "local" }, { platform: "win32", environment: { Path: "C:\\Tools" }, isFile, now: () => clock });
    const results = await Promise.all([resolve!("git", "C:\\Project", undefined), resolve!("git", "C:\\Other project", undefined)]);
    expect(results).toEqual(["C:\\Tools\\git.exe", "C:\\Tools\\git.exe"]);
    expect(isFile).toHaveBeenCalledOnce();
    clock += 30_001;
    exists = false;
    expect(await resolve!("git", "C:\\Project", undefined)).toBe("git");
    exists = true;
    expect(await resolve!("git", "C:\\Project", undefined)).toBe("C:\\Tools\\git.exe");
  });

  it("should bound slow PATH discovery and avoid starting further filesystem probes after timeout", async () => {
    vi.useFakeTimers();
    let release!: (found: boolean) => void;
    const isFile = vi.fn(() => new Promise<boolean>(resolve => { release = resolve; }));
    const resolve = createSourceExecutableResolver({ kind: "local" }, { platform: "win32",
      environment: { PATH: "Z:\\Network tools;C:\\Tools" }, isFile });
    const result = resolve!("git", "C:\\Project", undefined);
    await vi.advanceTimersByTimeAsync(2_001);
    expect(await result).toBe("git");
    release(false);
    await Promise.resolve();
    expect(isFile).toHaveBeenCalledOnce();
  });
});
