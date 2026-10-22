import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { RunGit } from "../src/backend/git/gitCommandRunner";
import { WorkspaceActivityGate } from "../src/backend/workspaces/WorkspaceActivityGate";
import { WorkspaceRelocationService } from "../src/backend/workspaces/WorkspaceRelocationService";

describe("source-aware relocation with real Git and SQLite", () => {
  let directory: string;
  let repository: string;
  let destination: string;
  let cache: OpenCodexCacheRepository;
  let primary: OpenCodexProjectWorkspace;
  let service: WorkspaceRelocationService;
  let gate: WorkspaceActivityGate;
  const inactive = vi.fn();
  const clients = { ensureClient: vi.fn() };
  let environment: NodeJS.ProcessEnv;

  /** Isolates fixture Git from user hooks, signing and remote access. */
  function git(cwd: string, args: string[]): string {
    return execFileSync("git", args, { cwd, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-relocation-"));
    repository = path.join(directory, "repository");
    destination = path.join(directory, "déplacé avec espaces");
    fs.mkdirSync(repository);
    environment = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(directory, "empty"),
      GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
      GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
      GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" };
    git(repository, ["init", "-b", "main"]);
    git(repository, ["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture"]);
    cache = createOpenCodexSqliteCacheRepository({ directory: path.join(directory, "cache") });
    primary = await cache.workspaces.resolvePath(repository, "source");
    clients.ensureClient.mockResolvedValue({ getMetadata: async (value: string) => {
      const stat = fs.lstatSync(value);
      return { isDirectory: stat.isDirectory(), isSymlink: stat.isSymbolicLink() };
    }, request: vi.fn(async () => ({ data: [], nextCursor: null })) });
    const runGit: RunGit = async (cwd, sourceId, args) => {
      expect(sourceId).toBe("source");
      return { stdout: git(cwd, args), stderr: "", exitCode: 0, stdoutCapReached: false, stderrCapReached: false };
    };
    gate = new WorkspaceActivityGate();
    service = new WorkspaceRelocationService(cache.workspaces, clients, gate, inactive, runGit);
  });

  afterEach(async () => {
    await cache.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  /** Uses the public, explicit association rather than accepting renderer-supplied previous paths. */
  async function relocate(workspace = primary, confirm = true) {
    return await service.relocate(workspace.projectId, workspace.id, "source", destination, confirm);
  }

  it("should preserve primary identities and allow a safe retry after a lost successful reply", async () => {
    fs.renameSync(repository, destination);
    expect(await relocate()).toMatchObject({ id: primary.id, projectId: primary.projectId, path: destination });
    expect(await relocate()).toMatchObject({ id: primary.id, path: destination });
    expect(await cache.workspaces.listPathAliases(primary.id)).toEqual([repository]);
    expect((await cache.listProjects())[0]).toMatchObject({ id: primary.projectId, path: destination });
    expect((await cache.workspaces.resolvePath(destination, "source")).id).toBe(primary.id);
  });

  it("should reconnect a moved registered secondary without changing ownership or its branch", async () => {
    const oldPath = path.join(directory, "secondary");
    git(repository, ["worktree", "add", "-b", "topic", oldPath]);
    await cache.workspaces.registerDiscovered(primary.id, "source", repository, [oldPath]);
    const secondary = (await cache.workspaces.list(primary.projectId)).find(item => !item.isPrimary)!;
    git(repository, ["worktree", "move", oldPath, destination]);
    expect(await relocate(secondary)).toMatchObject({ id: secondary.id, isPrimary: false, managed: false, path: destination });
    expect(git(destination, ["branch", "--show-current"]).trim()).toBe("topic");
    expect((await cache.listProjects())[0].path).toBe(repository);
  });

  it("should require manual Git repair after moving a linked checkout with filesystem tools", async () => {
    const oldPath = path.join(directory, "secondary");
    git(repository, ["worktree", "add", "-b", "topic", oldPath]);
    await cache.workspaces.registerDiscovered(primary.id, "source", repository, [oldPath]);
    const secondary = (await cache.workspaces.list(primary.projectId)).find(item => !item.isPrimary)!;
    fs.renameSync(oldPath, destination);
    await expect(relocate(secondary)).rejects.toThrow("Repair its Git links");
    expect((await cache.workspaces.get(secondary.id))?.path).toBe(oldPath);
    git(repository, ["worktree", "repair", destination]);
    expect((await relocate(secondary)).path).toBe(destination);
  });

  it("should refuse a secondary from a different repository", async () => {
    const oldPath = path.join(directory, "secondary");
    git(repository, ["worktree", "add", "-b", "topic", oldPath]);
    await cache.workspaces.registerDiscovered(primary.id, "source", repository, [oldPath]);
    const secondary = (await cache.workspaces.list(primary.projectId)).find(item => !item.isPrimary)!;
    fs.renameSync(oldPath, path.join(directory, "elsewhere"));
    fs.mkdirSync(destination);
    git(destination, ["init", "-b", "foreign"]);
    await expect(relocate(secondary)).rejects.toThrow("does not belong");
    expect((await cache.workspaces.get(secondary.id))?.path).toBe(oldPath);
  });

  it("should refuse existing previous paths, missing confirmation, wrong source and filesystem mismatch", async () => {
    fs.mkdirSync(destination);
    await expect(relocate()).rejects.toThrow("still exists");
    await expect(relocate(primary, false)).rejects.toThrow("Confirm");
    await expect(service.relocate(primary.projectId, primary.id, "other", destination, true)).rejects.toThrow("explicit project and source");
    await expect(service.relocate(primary.projectId, primary.id, "source", "C:\\moved", true)).rejects.toThrow("same source filesystem");
    expect((await cache.workspaces.get(primary.id))?.path).toBe(repository);
  });

  it("should refuse symbolic links and propagate access failures instead of treating them as absence", async () => {
    fs.renameSync(repository, destination);
    const link = path.join(directory, "link");
    fs.symlinkSync(destination, link, "dir");
    await expect(service.relocate(primary.projectId, primary.id, "source", link, true)).rejects.toThrow("symbolic-link");
    const client = await clients.ensureClient();
    const original = client.getMetadata;
    client.getMetadata = async (value: string) => {
      if (value === repository) throw new Error("EACCES fixture");
      return original(value);
    };
    await expect(relocate()).rejects.toThrow("EACCES");
  });

  it("should leave the catalogue unchanged for managed activity or an in-flight tool request", async () => {
    fs.renameSync(repository, destination);
    inactive.mockRejectedValueOnce(new Error("Stop managed command"));
    await expect(relocate()).rejects.toThrow("managed command");
    await gate.run("source", async () => { await expect(relocate()).rejects.toThrow("another operation"); });
    expect((await cache.workspaces.get(primary.id))?.path).toBe(repository);
  });

  it("should validate native Windows paths through the source without using the host filesystem", async () => {
    const windows = await cache.workspaces.resolvePath("C:\\previous", "source");
    clients.ensureClient.mockResolvedValue({ getMetadata: async (value: string) => {
      if (value === "C:\\previous") throw new Error("Système : (os error 3)");
      return { isDirectory: !value.endsWith(".git"), isSymlink: false };
    }, request: async () => ({ data: [], nextCursor: null }) });
    const runGit: RunGit = async (cwd, sourceId, args) => {
      expect(cwd).toBe("D:\\moved");
      expect(sourceId).toBe("source");
      let stdout = "D:/moved\n";
      if (args.includes("--git-common-dir")) stdout = "D:/moved/.git\n";
      if (args[0] === "worktree") stdout = `worktree D:/moved\0HEAD ${"a".repeat(40)}\0branch refs/heads/main\0\0`;
      return { stdout, stderr: "", exitCode: 0, stdoutCapReached: false, stderrCapReached: false };
    };
    const windowsService = new WorkspaceRelocationService(cache.workspaces, clients, gate, inactive, runGit);
    expect(await windowsService.relocate(windows.projectId, windows.id, "source", "D:/moved", true))
      .toMatchObject({ id: windows.id, path: "D:\\moved" });
  });

  it("should reconnect an explicitly confirmed non-Git primary without changing its files", async () => {
    fs.rmSync(path.join(repository, ".git"), { recursive: true });
    fs.writeFileSync(path.join(repository, "local.txt"), "unsaved in Git");
    fs.renameSync(repository, destination);
    await relocate();
    expect(fs.readFileSync(path.join(destination, "local.txt"), "utf8")).toBe("unsaved in Git");
  });
});
