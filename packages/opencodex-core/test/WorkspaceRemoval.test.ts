import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { RunGit } from "../src/backend/git/gitCommandRunner";
import { WorkspaceActivityGate } from "../src/backend/workspaces/WorkspaceActivityGate";
import { WorkspaceRemovalGit } from "../src/backend/workspaces/WorkspaceRemovalGit";
import { WorkspaceRemovalService } from "../src/backend/workspaces/WorkspaceRemovalService";

const execute = promisify(execFile);

describe("safe workspace removal with real Git and SQLite", () => {
  let directory: string;
  let repository: string;
  let checkout: string;
  let cache: OpenCodexCacheRepository;
  let primary: OpenCodexProjectWorkspace;
  let secondary: OpenCodexProjectWorkspace;
  let environment: NodeJS.ProcessEnv;
  let service: WorkspaceRemovalService;
  let gitRemoval: WorkspaceRemovalGit;
  let gate: WorkspaceActivityGate;
  const inactive = vi.fn(async () => undefined);
  const request = vi.fn();
  const clients = { ensureClient: vi.fn() };

  /** Runs fixture Git without user configuration, signing, hooks or network access. */
  async function git(cwd: string, args: string[]): Promise<string> {
    return (await execute("git", args, { cwd, env: environment })).stdout;
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    inactive.mockResolvedValue(undefined);
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-removal-"));
    repository = path.join(directory, "repo");
    checkout = path.join(directory, "workspace été");
    await fs.mkdir(repository);
    environment = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(directory, "empty"),
      GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid",
      GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
      GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" };
    await git(repository, ["init", "-b", "main"]);
    await fs.writeFile(path.join(repository, "tracked.txt"), "original\n");
    await fs.writeFile(path.join(repository, ".gitignore"), "ignored.txt\n");
    await git(repository, ["add", "."]);
    await git(repository, ["-c", "commit.gpgsign=false", "commit", "-m", "fixture"]);
    cache = createOpenCodexSqliteCacheRepository({ directory: path.join(directory, "cache") });
    primary = await cache.workspaces.resolvePath(repository, "source");
    const intent = await cache.workspaces.creations.begin({ primaryWorkspaceId: primary.id, sourceId: "source",
      projectPath: repository, repositoryPath: path.join(repository, ".git"), destinationPath: checkout,
      start: { mode: "newBranch", branchName: "topic", startPoint: "HEAD" } });
    const head = (await git(repository, ["rev-parse", "HEAD"])).trim();
    await cache.workspaces.creations.submitting(intent.id, head, "refs/heads/topic");
    await git(repository, ["worktree", "add", "-b", "topic", "--", checkout, head]);
    await cache.workspaces.creations.confirmGit(intent.id);
    secondary = (await cache.workspaces.get(await cache.workspaces.creations.commit(intent.id)))!;
    const runGit: RunGit = async (cwd, sourceId, args, options) => {
      expect(sourceId).toBe("source");
      try {
        return { stdout: await git(cwd, args), stderr: "", exitCode: 0, stdoutCapReached: false, stderrCapReached: false };
      } catch (error) {
        if (!options?.allowFailure) throw error;
        const failure = error as Error & { code: number; stdout: string; stderr: string };
        return { stdout: failure.stdout, stderr: failure.stderr, exitCode: failure.code,
          stdoutCapReached: false, stderrCapReached: false };
      }
    };
    gitRemoval = new WorkspaceRemovalGit(runGit);
    gate = new WorkspaceActivityGate();
    request.mockResolvedValue({ data: [], nextCursor: null });
    clients.ensureClient.mockResolvedValue({ request, getMetadata: async (value: string) => {
      const stat = await fs.lstat(value);
      return { isDirectory: stat.isDirectory(), isSymlink: stat.isSymbolicLink() };
    } } as unknown as CodexAppServerClient);
    service = new WorkspaceRemovalService(cache.workspaces, clients, gate, inactive, gitRemoval);
  });

  afterEach(async () => {
    await cache.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  /** Sends only stable identities; backend deletion derives physical paths from the cache. */
  async function remove(): Promise<void> {
    await service.remove(primary.projectId, secondary.id, "source");
  }

  it("should delete a clean checkout while preserving its branch and logical identity", async () => {
    await remove();
    await expect(fs.stat(checkout)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await git(repository, ["branch", "--list", "topic"])).toContain("topic");
    expect(await cache.workspaces.get(secondary.id)).toMatchObject({ path: checkout, removedAt: expect.any(String) });
    expect(await service.pending(primary.projectId)).toEqual([]);
    expect(await fs.readFile(path.join(repository, "tracked.txt"), "utf8")).toBe("original\n");
  });

  it.each(["modified", "untracked", "ignored"])("should retain %s files without forcing deletion", async kind => {
    const filename = kind === "modified" ? "tracked.txt" : `${kind}.txt`;
    await fs.writeFile(path.join(checkout, filename), "keep this content\n");
    await expect(remove()).rejects.toThrow("modified, untracked or ignored");
    expect(await fs.readFile(path.join(checkout, filename), "utf8")).toBe("keep this content\n");
    expect(await service.pending(primary.projectId)).toEqual([]);
    expect((await cache.workspaces.get(secondary.id))?.removedAt).toBeNull();
  });

  it("should preserve external Git locks", async () => {
    await git(repository, ["worktree", "lock", "--reason", "keep", "--", checkout]);
    await expect(remove()).rejects.toThrow("unlocked");
    expect(await git(repository, ["worktree", "list", "--porcelain"])).toContain("locked keep");
  });

  it("should retain initialized submodules rather than forcing Git removal", async () => {
    await git(checkout, ["-c", "protocol.file.allow=always", "submodule", "add", "--", repository, "nested"]);
    await git(checkout, ["-c", "commit.gpgsign=false", "commit", "-m", "local submodule fixture"]);
    await expect(remove()).rejects.toThrow(/submodule/iu);
    expect((await fs.stat(path.join(checkout, "nested", "tracked.txt"))).isFile()).toBe(true);
    expect(await service.pending(primary.projectId)).toEqual([]);
  });

  it("should require a durable branch or tag before deleting an unreferenced detached commit", async () => {
    await git(checkout, ["checkout", "--detach"]);
    await fs.writeFile(path.join(checkout, "tracked.txt"), "detached\n");
    await git(checkout, ["add", "."]);
    await git(checkout, ["-c", "commit.gpgsign=false", "commit", "-m", "detached fixture"]);
    await expect(remove()).rejects.toThrow("branch or tag");
    await git(checkout, ["tag", "retained-commit"]);
    await remove();
    expect(await git(repository, ["tag", "--list", "retained-commit"])).toContain("retained-commit");
  });

  it("should refuse active managed processes and incomplete source inventories before deleting files", async () => {
    inactive.mockRejectedValueOnce(new Error("Stop active fixture command"));
    await expect(remove()).rejects.toThrow("Stop active fixture command");
    request.mockResolvedValue({ data: [], nextCursor: "another-page" });
    await expect(remove()).rejects.toThrow("inventory is incomplete");
    expect((await fs.stat(checkout)).isDirectory()).toBe(true);
    expect(await service.pending(primary.projectId)).toEqual([]);
  });

  it("should recover a completed deletion with a lost reply after reopening SQLite without replaying Git", async () => {
    const original = gitRemoval.remove.bind(gitRemoval);
    const dispatch = vi.spyOn(gitRemoval, "remove").mockImplementation(async removal => {
      await original(removal);
      throw new Error("reply lost");
    });
    await expect(remove()).rejects.toThrow("reply lost");
    const pending = (await service.pending(primary.projectId))[0]!;
    expect(pending).toMatchObject({ state: "uncertain", gitExitCode: null });
    await cache.close();
    cache = createOpenCodexSqliteCacheRepository({ directory: path.join(directory, "cache") });
    service = new WorkspaceRemovalService(cache.workspaces, clients, gate, inactive, gitRemoval);
    await service.reconcile(pending.id);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((await cache.workspaces.get(secondary.id))?.removedAt).toEqual(expect.any(String));
    expect(await service.pending(primary.projectId)).toEqual([]);
  });

  it("should retain an unknown running deletion and refuse both reuse and blind retry", async () => {
    const dispatch = vi.spyOn(gitRemoval, "remove").mockRejectedValue(new Error("transport lost before reply"));
    await expect(remove()).rejects.toThrow("transport lost");
    const pending = (await service.pending(primary.projectId))[0]!;
    await expect(cache.workspaces.reserve(secondary.id, null)).rejects.toThrow("pending removal");
    await expect(service.reconcile(pending.id)).rejects.toThrow("outcome is uncertain");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((await fs.stat(checkout)).isDirectory()).toBe(true);
  });

  it("should release a positively failed Git removal when the checkout is still registered", async () => {
    vi.spyOn(gitRemoval, "remove").mockResolvedValue({ exitCode: 1, stderr: "fixture refusal", stdout: "",
      stdoutCapReached: false, stderrCapReached: false });
    await expect(remove()).rejects.toThrow("fixture refusal");
    expect(await service.pending(primary.projectId)).toEqual([]);
    expect((await cache.workspaces.get(secondary.id))?.removalPending).toBeUndefined();
  });

  it("should serialize removal against in-flight tool requests without blocking other sources", async () => {
    await gate.run("source", async () => {
      await expect(remove()).rejects.toThrow("another operation");
    });
    await gate.run("other-source", async () => { await remove(); });
    expect((await cache.workspaces.get(secondary.id))?.removedAt).toEqual(expect.any(String));
  });
});
