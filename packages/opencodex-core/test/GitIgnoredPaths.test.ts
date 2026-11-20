import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readGitIgnoredPaths } from "../src/backend/git/gitIgnoredPaths";
import type { GitProcessResult, RunGit, RunGitOptions } from "../src/backend/git/gitCommandRunner";

const execute = promisify(execFile);
let root: string;

/** Runs Git against an isolated fixture while retaining real pathname and ignore semantics. */
async function run(projectPath: string, _source: string | null, args: string[], options: RunGitOptions = {}): Promise<GitProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = execFile("git", args, { cwd: projectPath, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error !== null && typeof error.code !== "number") { reject(error); return; }
      resolve({ stdout, stderr, exitCode: error?.code ?? 0, stdoutCapReached: false, stderrCapReached: false });
    });
    child.stdin?.end(options.stdin);
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "opencodex-ignore-tests-"));
  await execute("git", ["init", "-q"], { cwd: root });
  await execute("git", ["config", "core.excludesFile", join(root, "global-excludes")], { cwd: root });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("bounded source-local ignore checks", () => {
  it("should honor nested rules, negations, excludes and tracked exceptions for literal Unicode names", async () => {
    await mkdir(join(root, "build"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, ".gitignore"), "build/\n*.log\n!keep.log\ntracked.log\n");
    await writeFile(join(root, "src", ".gitignore"), "*.cache\n");
    await writeFile(join(root, "global-excludes"), "*.global\n");
    await writeFile(join(root, ".git", "info", "exclude"), "*.local\n");
    await writeFile(join(root, "tracked.log"), "tracked");
    await execute("git", ["add", "-f", "--", "tracked.log"], { cwd: root });
    const candidates = ["build", "src", "src/data.cache", "rapport été [1].log", "line\nbreak.log",
      "-leading.log", "keep.log", "tracked.log", "settings.global", "settings.local"];
    const runGit = vi.fn(run);
    expect(await readGitIgnoredPaths(runGit, root, "wsl", candidates)).toEqual([
      "build", "src/data.cache", "rapport été [1].log", "line\nbreak.log", "-leading.log",
      "settings.global", "settings.local"
    ]);
    expect(runGit).toHaveBeenLastCalledWith(root, "wsl", ["check-ignore", "-z", "--stdin"],
      expect.objectContaining({ allowFailure: true, stdin: `${candidates.join("\0")}\0` }));
  });

  it("should accept Git's no-match exit code and non-repositories without reporting an error", async () => {
    expect(await readGitIgnoredPaths(run, root, "source", ["file.txt"])).toEqual([]);
    await mkdir(join(root, "outside"));
    await rm(join(root, ".git"), { recursive: true });
    expect(await readGitIgnoredPaths(run, root, "source", ["outside"])).toEqual([]);
  });

  it("should reject foreign or excessive paths before invoking any source process", async () => {
    const runGit = vi.fn<RunGit>();
    for (const paths of [["../outside"], ["a/../../outside"], ["C:/outside"], ["/outside"], ["a\0b"],
      Array.from({ length: 201 }, (_, index) => `file${index}`)]) {
      await expect(readGitIgnoredPaths(runGit, root, "source", paths)).rejects.toThrow("workspace-relative paths");
    }
    expect(runGit).not.toHaveBeenCalled();
  });

  it("should bound long command lines and reject truncated or failed checks", async () => {
    const candidates = Array.from({ length: 200 }, (_, index) => `${index}-${"é".repeat(100)}`);
    const runGit = vi.fn(run);
    expect(await readGitIgnoredPaths(runGit, root, "source", candidates)).toEqual([]);
    const checks = runGit.mock.calls.filter(call => call[2][0] === "check-ignore");
    expect(checks.length).toBeGreaterThan(1);
    for (const check of checks) expect(Buffer.byteLength(check[3]!.stdin!)).toBeLessThan(12000);
    const failure = vi.fn<RunGit>().mockResolvedValueOnce({ exitCode: 0, stdout: "true", stderr: "",
      stdoutCapReached: false, stderrCapReached: false }).mockResolvedValue({ exitCode: 128,
      stdout: "", stderr: "Cannot read ignore rules", stdoutCapReached: false, stderrCapReached: false });
    await expect(readGitIgnoredPaths(failure, root, "source", ["file.txt"])).rejects.toThrow("Cannot read ignore rules");
    failure.mockResolvedValueOnce({ exitCode: 0, stdout: "true", stderr: "", stdoutCapReached: false, stderrCapReached: false })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "file", stderr: "", stdoutCapReached: true, stderrCapReached: false });
    await expect(readGitIgnoredPaths(failure, root, "source", ["file.txt"])).rejects.toThrow("truncated");
  });
});
