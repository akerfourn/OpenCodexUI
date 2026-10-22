import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { RunGit } from "../src/backend/git/gitCommandRunner";
import { WorkspaceActivityGate } from "../src/backend/workspaces/WorkspaceActivityGate";
import { WorkspaceLockService } from "../src/backend/workspaces/WorkspaceLockService";
import { WorkspaceMoveGit } from "../src/backend/workspaces/WorkspaceMoveGit";
import { WorkspaceRemovalGit } from "../src/backend/workspaces/WorkspaceRemovalGit";

describe("native workspace locks with real Git and SQLite", () => {
  let directory: string;
  let repository: string;
  let checkout: string;
  let cache: OpenCodexCacheRepository;
  let primary: OpenCodexProjectWorkspace;
  let workspace: OpenCodexProjectWorkspace;
  let service: WorkspaceLockService;
  let gate: WorkspaceActivityGate;
  let environment: NodeJS.ProcessEnv;
  let runGit: RunGit;
  const clients = { ensureClient: vi.fn() };
  const mutations = vi.fn();

  /** Keeps fixture commands independent of user Git configuration, hooks, signing and network. */
  function git(cwd: string, args: string[]): string {
    return execFileSync("git", args, { cwd, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-lock-"));
    repository = path.join(directory, "repo");
    checkout = path.join(directory, "aaa espace été");
    fs.mkdirSync(repository);
    environment = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(directory, "empty"),
      GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture",
      GIT_COMMITTER_EMAIL: "fixture@example.invalid", GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" };
    git(repository, ["init", "-b", "main"]);
    fs.writeFileSync(path.join(repository, "tracked.txt"), "initial\n");
    git(repository, ["add", "."]);
    git(repository, ["-c", "commit.gpgsign=false", "commit", "-m", "fixture"]);
    git(repository, ["worktree", "add", "-b", "topic", checkout]);
    cache = createOpenCodexSqliteCacheRepository({ directory: path.join(directory, "cache") });
    primary = await cache.workspaces.resolvePath(repository, "source");
    await cache.workspaces.registerDiscovered(primary.id, "source", repository, [checkout]);
    workspace = (await cache.workspaces.list(primary.projectId)).find(item => !item.isPrimary)!;
    clients.ensureClient.mockResolvedValue({ getMetadata: async (value: string) => {
      const stat = fs.lstatSync(value);
      return { isDirectory: stat.isDirectory(), isSymlink: stat.isSymbolicLink() };
    } });
    runGit = async (cwd, sourceId, args) => {
      expect(sourceId).toBe("source");
      if (args[0] === "worktree" && ["lock", "unlock"].includes(args[1]!)) mutations(args);
      return { stdout: git(cwd, args), stderr: "", exitCode: 0, stdoutCapReached: false, stderrCapReached: false };
    };
    gate = new WorkspaceActivityGate();
    service = new WorkspaceLockService(cache, clients, gate, runGit);
  });
  afterEach(async () => {
    await cache.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  /** Explicit project/source/identity and reviewed reason cannot be supplied through a global selection. */
  async function update(locked: boolean, expectedReason: string | null, reason?: string) {
    return await service.update({ projectId: primary.projectId, workspaceId: workspace.id, sourceId: "source",
      workspacePath: checkout, locked, expectedReason, reason });
  }

  it("should lock an imported worktree with a reason while retaining editable files and execution access", async () => {
    expect(await service.read(primary.projectId, workspace.id, "source")).toMatchObject({ supported: true, lockedReason: null });
    expect(await update(true, null, "Conserver pour déplacement différé")).toMatchObject({ lockedReason: "Conserver pour déplacement différé" });
    fs.writeFileSync(path.join(checkout, "tracked.txt"), "still editable\n");
    const reservation = await cache.workspaces.reserve(workspace.id, null);
    await cache.workspaces.release(reservation.id);
    expect((await cache.workspaces.get(workspace.id))?.managed).toBe(false);
    expect(fs.readFileSync(path.join(checkout, "tracked.txt"), "utf8")).toBe("still editable\n");
    expect(await update(false, "Conserver pour déplacement différé")).toMatchObject({ lockedReason: null });
    expect(mutations).toHaveBeenCalledTimes(2);
  });

  it("should preserve empty-reason locks rather than interpreting them as unlocked", async () => {
    expect((await update(true, null)).lockedReason).toBe("");
    expect((await service.read(primary.projectId, workspace.id, "source")).lockedReason).toBe("");
    expect((await update(false, "")).lockedReason).toBeNull();
  });

  it("should display external locks and refuse to unlock one whose reason changed after confirmation", async () => {
    git(repository, ["worktree", "lock", "--reason", "external tool", checkout]);
    expect((await service.read(primary.projectId, workspace.id, "source")).lockedReason).toBe("external tool");
    git(repository, ["worktree", "unlock", checkout]);
    git(repository, ["worktree", "lock", "--reason", "new external lock", checkout]);
    await expect(update(false, "external tool")).rejects.toThrow("Git lock changed");
    expect((await service.read(primary.projectId, workspace.id, "source")).lockedReason).toBe("new external lock");
    expect(mutations).not.toHaveBeenCalled();
  });

  it("should protect move and removal with Git's actual lock rather than UI state", async () => {
    await update(true, null, "protected");
    await expect(new WorkspaceMoveGit(runGit).capture(repository, checkout, path.join(directory, "destination"), "source"))
      .rejects.toThrow("unlocked");
    await expect(new WorkspaceRemovalGit(runGit).requireClean({ projectPath: repository, workspacePath: checkout,
      sourceId: "source", repositoryPath: path.join(repository, ".git") } as never)).rejects.toThrow("unlocked");
  });

  it("should lock and unlock registered missing worktrees without pruning or recreating their files", async () => {
    fs.rmSync(checkout, { recursive: true });
    expect((await update(true, null, "offline volume")).lockedReason).toBe("offline volume");
    expect(fs.existsSync(checkout)).toBe(false);
    expect((await update(false, "offline volume")).lockedReason).toBeNull();
    expect(fs.existsSync(checkout)).toBe(false);
  });

  it("should reject primary, wrong-source and stale-path mutations before dispatch", async () => {
    expect(await service.read(primary.projectId, primary.id, "source")).toMatchObject({ supported: false });
    await expect(service.update({ projectId: primary.projectId, workspaceId: primary.id, sourceId: "source",
      workspacePath: repository, locked: true, expectedReason: null })).rejects.toThrow("principal");
    await expect(service.read(primary.projectId, workspace.id, "other")).rejects.toThrow("explicit project and source");
    await expect(service.update({ projectId: primary.projectId, workspaceId: workspace.id, sourceId: "source",
      workspacePath: "/stale", locked: true, expectedReason: null })).rejects.toThrow("path changed");
    expect(mutations).not.toHaveBeenCalled();
  });

  it("should not repeat a mutation after losing its reply, and allow a fresh read to establish truth", async () => {
    const failedReply: RunGit = async (cwd, sourceId, args) => {
      const result = await runGit(cwd, sourceId, args);
      if (args[0] === "worktree" && args[1] === "lock") throw new Error("reply lost");
      return result;
    };
    service = new WorkspaceLockService(cache, clients, gate, failedReply);
    await expect(update(true, null, "kept")).rejects.toThrow("reply lost");
    expect((await service.read(primary.projectId, workspace.id, "source")).lockedReason).toBe("kept");
    expect(mutations).toHaveBeenCalledTimes(1);
  });

  it("should refuse pending repository lifecycle operations and concurrent requests without clearing locks", async () => {
    await update(true, null, "kept");
    const creation = await cache.workspaces.creations.begin({ primaryWorkspaceId: primary.id, sourceId: "source",
      projectPath: repository, repositoryPath: path.join(repository, ".git"), destinationPath: path.join(directory, "future"),
      start: { mode: "detached", startPoint: "HEAD" } });
    await expect(update(false, "kept")).rejects.toThrow("pending workspace lifecycle");
    await cache.workspaces.creations.fail(creation.id);
    await gate.run("source", async () => { await expect(update(false, "kept")).rejects.toThrow("another operation"); });
    expect((await service.read(primary.projectId, workspace.id, "source")).lockedReason).toBe("kept");
  });

  it("should use source-native Windows paths and preserve an external reason when unlocking", async () => {
    const windowsPrimary = await cache.workspaces.resolvePath("C:\\Repo", "windows");
    await cache.workspaces.registerDiscovered(windowsPrimary.id, "windows", "C:\\Repo", ["C:\\Work space"]);
    const target = (await cache.workspaces.list(windowsPrimary.projectId)).find(item => !item.isPrimary)!;
    let lockReason: string | null = "External Windows backup";
    const windowsClient = { ensureClient: vi.fn().mockResolvedValue({ getMetadata: async (value: string) => {
      expect(value.startsWith("C:\\")).toBe(true);
      return { isDirectory: true, isSymlink: false };
    } }) };
    const windowsGit: RunGit = async (cwd, sourceId, args) => {
      expect(cwd).toBe("C:\\Repo");
      expect(sourceId).toBe("windows");
      let stdout = "C:/Repo/.git\n";
      if (args[0] === "worktree" && args[1] === "unlock") {
        expect(args).toEqual(["worktree", "unlock", "--", "C:\\Work space"]);
        lockReason = null;
        stdout = "";
      } else if (args[0] === "worktree") {
        const lock = lockReason === null ? "" : `locked ${lockReason}\0`;
        stdout = `worktree C:/Repo\0HEAD ${"a".repeat(40)}\0branch refs/heads/main\0\0worktree C:/Work space\0HEAD ${"a".repeat(40)}\0branch refs/heads/topic\0${lock}\0`;
      }
      return { stdout, stderr: "", exitCode: 0, stdoutCapReached: false, stderrCapReached: false };
    };
    const windows = new WorkspaceLockService(cache, windowsClient, gate, windowsGit);
    expect((await windows.read(windowsPrimary.projectId, target.id, "windows")).lockedReason).toBe("External Windows backup");
    expect(await windows.update({ projectId: windowsPrimary.projectId, workspaceId: target.id, sourceId: "windows",
      workspacePath: "C:\\Work space", locked: false, expectedReason: "External Windows backup" })).toMatchObject({ lockedReason: null });
  });

  it("should reject invalid reasons before running Git and keep an existing reviewed lock unchanged", async () => {
    await expect(update(true, null, "line\nbreak")).rejects.toThrow("single line");
    await expect(update(true, null, "reason\n")).rejects.toThrow("single line");
    await expect(update(true, null, "x".repeat(501))).rejects.toThrow("500");
    await update(true, null, "original");
    expect((await update(true, "original", "replacement")).lockedReason).toBe("original");
    expect(mutations).toHaveBeenCalledTimes(1);
  });
});
