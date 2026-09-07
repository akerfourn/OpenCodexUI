import { WorkspaceDiscoveryService } from "../src/backend/workspaces/WorkspaceDiscoveryService";
import { createOpenCodexSqliteCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { WorkspaceCreationService } from "../src/backend/workspaces/WorkspaceCreationService";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitWorktreeService } from "../src/backend/git/GitWorktreeService";
import { parseGitWorktrees } from "../src/backend/git/gitWorktreeParsers";
import type { RunGit } from "../src/backend/git/gitCommandRunner";

const execute = promisify(execFile);
const head = "a".repeat(40);

describe("worktree porcelain parsing", () => {
  it("should preserve Windows paths, spaces, Unicode and embedded newlines", () => {
    const sourcePath = "C:\\dépôt avec espaces\\workspace\nsecond line";
    const entries = parseGitWorktrees(`worktree ${sourcePath}\0HEAD ${head}\0detached\0locked reason\ncontinued\0\0`);
    expect(entries).toEqual([{
      path: sourcePath, head, branch: null, bare: false, detached: true,
      lockedReason: "reason\ncontinued", prunableReason: null
    }]);
  });

  it("should distinguish bare entries and lock/prune flags without reasons", () => {
    expect(parseGitWorktrees("worktree /bare\0bare\0\0" +
      `worktree /linked\0HEAD ${head}\0branch refs/heads/topic\0locked\0prunable\0\0`))
      .toMatchObject([
        { path: "/bare", bare: true, head: null },
        { path: "/linked", branch: "refs/heads/topic", lockedReason: "", prunableReason: "" }
      ]);
  });

  it.each([
    [`worktree /repo\0HEAD ${head}\0detached\0`, "Incomplete"],
    [`HEAD ${head}\0detached\0\0`, "no path"],
    ["worktree /repo\0HEAD bad\0detached\0\0", "incomplete HEAD"],
    [`worktree /repo\0HEAD ${head}\0detached\0branch refs/heads/main\0\0`, "contradictory"],
    ["worktree /repo\0bare\0bare\0\0", "Duplicate"]
  ])("should reject unusable metadata: %s", (output, message) => {
    expect(() => parseGitWorktrees(output)).toThrow(message);
  });

  it.each(["relative", "C:relative", "\\", "\\rooted"])(
    "should reject paths that need a host or drive-relative resolution: %s",
    async (projectPath) => {
      const runGit = vi.fn();
      await expect(new GitWorktreeService(runGit).list(projectPath, "source"))
        .rejects.toThrow("absolute source path");
      expect(runGit).not.toHaveBeenCalled();
    }
  );

  it("should reject capped listings even when the captured prefix is parseable", async () => {
    const runGit = vi.fn().mockResolvedValue({ stdout: "worktree /bare\0bare\0\0", stdoutCapReached: true });
    await expect(new GitWorktreeService(runGit).list("/repo", "source")).rejects.toThrow("truncated");
  });
});

describe("worktree creation in isolated real Git repositories", () => {
  let directory: string;
  let repository: string;
  let service: GitWorktreeService;
  let environment: NodeJS.ProcessEnv;

  /** Executes fixture Git without user config, hooks or network access. */
  async function git(cwd: string, args: string[]): Promise<string> {
    const result = await execute("git", args, { cwd, env: environment });
    return result.stdout;
  }

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "git-workspaces-"));
    repository = path.join(directory, "repo");
    await fs.mkdir(repository);
    environment = {
      ...process.env, LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(directory, "empty-config"),
      GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
      GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
      GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z"
    };
    await git(repository, ["init", "-b", "main"]);
    await fs.writeFile(path.join(repository, "tracked.txt"), "original\n");
    await git(repository, ["add", "tracked.txt"]);
    await git(repository, ["commit", "-m", "fixture"]);
    const runGit: RunGit = async (cwd, sourceId, args, options) => {
      expect(sourceId).toBe("fixture-source");
      try {
        return { stdout: await git(cwd, args), stderr: "", exitCode: 0,
          stdoutCapReached: false, stderrCapReached: false };
      } catch (error) {
        if (options?.allowFailure !== true) {
          throw error;
        }
        const failure = error as Error & { code: number; stdout: string; stderr: string };
        return { stdout: failure.stdout, stderr: failure.stderr, exitCode: failure.code,
          stdoutCapReached: false, stderrCapReached: false };
      }
    };
    service = new GitWorktreeService(runGit);
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("should create a branch checkout without copying uncommitted or untracked files", async () => {
    await fs.writeFile(path.join(repository, "tracked.txt"), "local change\n");
    await fs.writeFile(path.join(repository, ".env"), "SYNTHETIC_FIXTURE=1\n");
    const destination = path.join(directory, "espace été");

    const entries = await service.create(repository, "fixture-source", destination,
      { mode: "newBranch", branchName: "feature/workspaces", startPoint: "HEAD" });

    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual(expect.objectContaining({ path: destination, branch: "refs/heads/feature/workspaces" }));
    expect(await fs.readFile(path.join(destination, "tracked.txt"), "utf8")).toBe("original\n");
    await expect(fs.stat(path.join(destination, ".env"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(path.join(repository, "tracked.txt"), "utf8")).toBe("local change\n");
    expect(await git(repository, ["branch", "--show-current"])).toBe("main\n");
  });

  it("should attach an existing branch and detach explicitly from a tag", async () => {
    await git(repository, ["branch", "existing"]);
    await git(repository, ["tag", "fixture-tag"]);
    const existing = path.join(directory, "existing");
    const detached = path.join(directory, "detached");
    await service.create(repository, "fixture-source", existing, { mode: "existingBranch", branchName: "existing" });
    const entries = await service.create(repository, "fixture-source", detached,
      { mode: "detached", startPoint: "fixture-tag" });

    expect(entries).toContainEqual(expect.objectContaining({ path: existing, branch: "refs/heads/existing", detached: false }));
    expect(entries).toContainEqual(expect.objectContaining({ path: detached, branch: null, detached: true }));
  });

  it("should discover a real external worktree without claiming ownership or unlocking it", async () => {
    const destination = path.join(directory, "external");
    await service.create(repository, "fixture-source", destination,
      { mode: "newBranch", branchName: "external", startPoint: "HEAD" });
    await git(repository, ["worktree", "lock", "--reason", "external owner", destination]);
    const cache = createOpenCodexSqliteCacheRepository({ directory: path.join(directory, "cache") });
    try {
      const primary = await cache.workspaces.resolvePath(repository, "fixture-source");
      const client = { getMetadata: async (value: string) => {
        const metadata = await fs.lstat(value);
        return { isDirectory: metadata.isDirectory(), isSymlink: metadata.isSymbolicLink() };
      } };
      const clients = { ensureClient: async () => client as unknown as CodexAppServerClient };
      const discovery = new WorkspaceDiscoveryService(cache.workspaces, clients, service);
      const result = await discovery.discover(primary.projectId, "fixture-source");
      expect(result.skipped).toEqual([]);
      expect(result.workspaces).toContainEqual(expect.objectContaining({
        path: destination, projectId: primary.projectId, isPrimary: false, managed: false
      }));
      expect((await discovery.discover(primary.projectId, "fixture-source")).workspaces).toEqual(result.workspaces);
      expect(await service.list(repository, "fixture-source")).toContainEqual(expect.objectContaining({
        path: destination, lockedReason: "external owner", branch: "refs/heads/external"
      }));
    } finally {
      await cache.close();
    }
  });

  it("should create the automatic hierarchy and recover the same worktree after storage settings change", async () => {
    const storage = path.join(await fs.realpath(directory), "storage");
    await fs.mkdir(storage);
    const cacheDirectory = path.join(directory, "automatic-cache");
    let cache = createOpenCodexSqliteCacheRepository({ directory: cacheDirectory });
    try {
      const primary = await cache.workspaces.resolvePath(repository, "fixture-source");
      const sourceClient = {
        request: async () => ({ config: { projects: { [repository]: { trust_level: "trusted" } } } }),
        getMetadata: async (value: string) => {
          const metadata = await fs.lstat(value);
          return { isDirectory: metadata.isDirectory(), isSymlink: metadata.isSymbolicLink() };
        },
        createDirectory: async (value: string) => { await fs.mkdir(value, { recursive: true }); return {}; }
      };
      const clients = { ensureClient: async () => sourceClient as unknown as CodexAppServerClient };
      const roots = [{ id: "storage", sourceId: "fixture-source", label: "Storage", path: storage, isDefault: true }];
      const coordinator = new WorkspaceCreationService(cache.workspaces, clients, service, () => roots, () => "workspace-fixture");
      const destination = path.join(storage, primary.projectId, "workspace-fixture");
      vi.spyOn(cache.workspaces.creations, "commit").mockRejectedValueOnce(new Error("Cache publication interrupted"));
      await expect(coordinator.create({ projectId: primary.projectId, sourceId: "fixture-source", name: "Automatic",
        start: { mode: "newBranch", branchName: "automatic", startPoint: "HEAD" } }))
        .rejects.toThrow("Cache publication interrupted");
      const pending = (await coordinator.pending(primary.projectId))[0];
      expect(pending).toMatchObject({ workspaceId: "workspace-fixture", destinationPath: destination,
        rootPath: storage, gitConfirmed: true });
      expect((await fs.lstat(path.join(destination, ".git"))).isFile()).toBe(true);
      await cache.close();
      cache = createOpenCodexSqliteCacheRepository({ directory: cacheDirectory });
      const recovered = new WorkspaceCreationService(cache.workspaces, clients, service,
        () => [{ ...roots[0], path: path.join(directory, "changed-root") }]);
      expect(await recovered.reconcile(pending.id)).toMatchObject({ id: "workspace-fixture", path: destination, name: "Automatic" });
      expect(await recovered.pending(primary.projectId)).toEqual([]);
      expect(await service.list(repository, "fixture-source")).toHaveLength(2);
    } finally {
      await cache.close();
    }
  });

  it("should recover a real Git checkout after failed cache publication and reopening", async () => {
    const cacheDirectory = path.join(directory, "cache");
    let cache = createOpenCodexSqliteCacheRepository({ directory: cacheDirectory });
    try {
      const primary = await cache.workspaces.resolvePath(repository, "fixture-source");
      const sourceClient = {
        request: async () => ({ config: { projects: { [repository]: { trust_level: "trusted" } } } }),
        getMetadata: async (value: string) => {
          const metadata = await fs.lstat(value);
          return { isDirectory: metadata.isDirectory(), isSymlink: metadata.isSymbolicLink() };
        }
      };
      const clients = { ensureClient: async () => sourceClient as unknown as CodexAppServerClient };
      let coordinator = new WorkspaceCreationService(cache.workspaces, clients, service);
      const destination = path.join(directory, "managed");
      vi.spyOn(cache.workspaces.creations, "commit").mockRejectedValueOnce(new Error("Cache write interrupted"));

      await expect(coordinator.create({ projectId: primary.projectId, sourceId: "fixture-source",
        destinationPath: destination, start: { mode: "newBranch", branchName: "managed", startPoint: "HEAD" }
      })).rejects.toThrow("Cache write interrupted");
      const pending = (await coordinator.pending(primary.projectId))[0]!;
      expect(pending.gitConfirmed).toBe(true);
      expect(await cache.workspaces.list(primary.projectId)).toHaveLength(1);
      await cache.close();
      cache = createOpenCodexSqliteCacheRepository({ directory: cacheDirectory });
      coordinator = new WorkspaceCreationService(cache.workspaces, clients, service);

      expect(await coordinator.reconcile(pending.id)).toMatchObject({
        id: pending.workspaceId, projectId: primary.projectId, path: destination, managed: true
      });
      expect(await service.list(repository, "fixture-source")).toHaveLength(2);
      expect(await coordinator.pending(primary.projectId)).toEqual([]);
      expect(await git(repository, ["branch", "--show-current"])).toBe("main\n");
    } finally {
      await cache.close();
    }
  });

  it("should refuse an already checked-out branch without forcing it", async () => {
    const destination = path.join(directory, "duplicate");
    await expect(service.create(repository, "fixture-source", destination,
      { mode: "existingBranch", branchName: "main" })).rejects.toThrow(/already (checked out|used by worktree)/u);
    expect(await service.list(repository, "fixture-source")).toHaveLength(1);
    await expect(fs.stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("should reject an existing unoccupied branch before durable dispatch", async () => {
    await git(repository, ["branch", "unused"]);
    const lifecycle = { beforeDispatch: vi.fn(), afterSuccess: vi.fn() };
    await expect(service.create(repository, "fixture-source", path.join(directory, "unused"),
      { mode: "newBranch", branchName: "unused", startPoint: "HEAD" }, lifecycle))
      .rejects.toThrow("already exists");
    expect(lifecycle.beforeDispatch).not.toHaveBeenCalled();
    expect(await service.list(repository, "fixture-source")).toHaveLength(1);
  });

  it("should refuse an option-like branch before creating a worktree", async () => {
    await expect(service.create(repository, "fixture-source", path.join(directory, "invalid"),
      { mode: "newBranch", branchName: "--force", startPoint: "HEAD" })).rejects.toThrow("explicit Git branch");
    expect(await service.list(repository, "fixture-source")).toHaveLength(1);
  });
});
