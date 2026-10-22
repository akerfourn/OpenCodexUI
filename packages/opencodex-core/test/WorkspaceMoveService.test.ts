import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceRoot } from "@open-codex-ui/opencodex-protocol";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { RunGit } from "../src/backend/git/gitCommandRunner";
import { WorkspaceMoveGit } from "../src/backend/workspaces/WorkspaceMoveGit";
import { WorkspaceMoveService } from "../src/backend/workspaces/WorkspaceMoveService";
import { WorkspaceActivityGate } from "../src/backend/workspaces/WorkspaceActivityGate";

describe("physical movement with real Git and SQLite", () => {
  let directory: string;
  let repository: string;
  let checkout: string;
  let storage: string;
  let destination: string;
  let cache: OpenCodexCacheRepository;
  let primary: OpenCodexProjectWorkspace;
  let workspace: OpenCodexProjectWorkspace;
  let service: WorkspaceMoveService;
  let gitMove: WorkspaceMoveGit;
  let gate: WorkspaceActivityGate;
  let roots: OpenCodexWorkspaceRoot[];
  let environment: NodeJS.ProcessEnv;
  const inactive = vi.fn();
  const clients = { ensureClient: vi.fn() };
  const request = vi.fn();

  /** Runs fixture Git with isolated configuration and no remote resources. */
  function git(cwd: string, args: string[]): string {
    return execFileSync("git", args, { cwd, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-move-"));
    repository = path.join(directory, "repository");
    checkout = path.join(directory, "ancien été");
    storage = path.join(directory, "storage");
    fs.mkdirSync(repository);
    fs.mkdirSync(storage);
    environment = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(directory, "empty"),
      GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture",
      GIT_COMMITTER_EMAIL: "fixture@example.invalid", GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" };
    git(repository, ["init", "-b", "main"]);
    fs.writeFileSync(path.join(repository, "tracked.txt"), "initial\n");
    fs.writeFileSync(path.join(repository, ".gitignore"), "ignored.txt\n");
    git(repository, ["add", "."]);
    git(repository, ["-c", "commit.gpgsign=false", "commit", "-m", "fixture"]);
    cache = createOpenCodexSqliteCacheRepository({ directory: path.join(directory, "cache") });
    primary = await cache.workspaces.resolvePath(repository, "source");
    const creation = await cache.workspaces.creations.begin({ primaryWorkspaceId: primary.id, sourceId: "source",
      projectPath: repository, repositoryPath: path.join(repository, ".git"), destinationPath: checkout,
      start: { mode: "newBranch", branchName: "topic", startPoint: "HEAD" } });
    const head = git(repository, ["rev-parse", "HEAD"]).trim();
    await cache.workspaces.creations.submitting(creation.id, head, "refs/heads/topic");
    git(repository, ["worktree", "add", "-b", "topic", checkout, head]);
    await cache.workspaces.creations.confirmGit(creation.id);
    workspace = (await cache.workspaces.get(await cache.workspaces.creations.commit(creation.id)))!;
    destination = path.join(storage, primary.projectId, workspace.id);
    roots = [{ id: "storage", label: "Storage", sourceId: "source", path: storage, isDefault: true }];
    request.mockImplementation(async method => {
      if (method === "config/read") return { config: { projects: { [repository]: { trust_level: "trusted" } } } };
      return { data: [], nextCursor: null };
    });
    clients.ensureClient.mockResolvedValue({ request, getMetadata: async (value: string) => {
      const stat = fs.lstatSync(value);
      return { isDirectory: stat.isDirectory(), isSymlink: stat.isSymbolicLink() };
    }, createDirectory: async (value: string) => { fs.mkdirSync(value); } });
    const runGit: RunGit = async (cwd, sourceId, args, options) => {
      expect(sourceId).toBe("source");
      try { return { stdout: git(cwd, args), stderr: "", exitCode: 0, stdoutCapReached: false, stderrCapReached: false }; }
      catch (error) {
        if (!options?.allowFailure) throw error;
        const failure = error as Error & { status: number; stdout: string; stderr: string };
        return { stdout: failure.stdout, stderr: failure.stderr, exitCode: failure.status, stdoutCapReached: false, stderrCapReached: false };
      }
    };
    gitMove = new WorkspaceMoveGit(runGit);
    gate = new WorkspaceActivityGate();
    service = new WorkspaceMoveService(cache.workspaces, clients, gate, inactive, () => roots, gitMove);
  });
  afterEach(async () => {
    await cache.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  /** Leaves destination resolution to the configured source storage by default. */
  async function move(rootId?: string, destinationPath?: string): Promise<void> {
    await service.move({ projectId: primary.projectId, workspaceId: workspace.id, sourceId: "source", rootId, destinationPath });
  }

  it("should default to configured storage and retain dirty, untracked and ignored files, branch and identity", async () => {
    fs.writeFileSync(path.join(checkout, "tracked.txt"), "edited\n");
    fs.writeFileSync(path.join(checkout, "local.txt"), "untracked\n");
    fs.writeFileSync(path.join(checkout, "ignored.txt"), "ignored\n");
    await move();
    expect(fs.existsSync(checkout)).toBe(false);
    expect(fs.readFileSync(path.join(destination, "tracked.txt"), "utf8")).toBe("edited\n");
    expect(fs.readFileSync(path.join(destination, "local.txt"), "utf8")).toBe("untracked\n");
    expect(fs.readFileSync(path.join(destination, "ignored.txt"), "utf8")).toBe("ignored\n");
    expect(git(destination, ["branch", "--show-current"]).trim()).toBe("topic");
    expect(await cache.workspaces.get(workspace.id)).toMatchObject({ id: workspace.id, path: destination, managed: true, name: workspace.name });
    expect(await service.pending(primary.projectId)).toEqual([]);
  });

  it("should accept another configured root and explicit advanced destinations", async () => {
    const second = path.join(directory, "second");
    fs.mkdirSync(second);
    roots.push({ id: "second", label: "Second", sourceId: "source", path: second, isDefault: false });
    await move("second");
    expect((await cache.workspaces.get(workspace.id))?.path).toBe(path.join(second, primary.projectId, workspace.id));
    const custom = path.join(directory, "custom target");
    await move(undefined, custom);
    expect((await cache.workspaces.get(workspace.id))?.path).toBe(custom);
  });

  it("should recover completion after a lost reply and SQLite reopening without replay or changed-root redirection", async () => {
    const original = gitMove.move.bind(gitMove);
    const dispatch = vi.spyOn(gitMove, "move").mockImplementation(async intent => { await original(intent); throw new Error("reply lost"); });
    await expect(move()).rejects.toThrow("reply lost");
    const pending = (await service.pending(primary.projectId))[0]!;
    expect(pending).toMatchObject({ destinationPath: destination, rootPath: storage, gitExitCode: null, state: "uncertain" });
    roots = [];
    await cache.close();
    cache = createOpenCodexSqliteCacheRepository({ directory: path.join(directory, "cache") });
    service = new WorkspaceMoveService(cache.workspaces, clients, gate, inactive, () => roots, gitMove);
    await service.reconcile(pending.id);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((await cache.workspaces.get(workspace.id))?.path).toBe(destination);
  });

  it("should retain unknown results and refuse both path reuse and blind recovery when no move is proven", async () => {
    const dispatch = vi.spyOn(gitMove, "move").mockRejectedValue(new Error("transport lost"));
    await expect(move()).rejects.toThrow("transport lost");
    const pending = (await service.pending(primary.projectId))[0]!;
    await expect(service.reconcile(pending.id)).rejects.toThrow("outcome is uncertain");
    await expect(cache.workspaces.resolvePath(destination, "source")).rejects.toThrow("pending move");
    await expect(cache.workspaces.reserve(workspace.id, null)).rejects.toThrow("pending move");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(checkout)).toBe(true);
  });

  it("should retain ambiguity if the previous path is recreated after movement", async () => {
    const original = gitMove.move.bind(gitMove);
    vi.spyOn(gitMove, "move").mockImplementation(async intent => { await original(intent); throw new Error("reply lost"); });
    await expect(move()).rejects.toThrow("reply lost");
    fs.mkdirSync(checkout);
    const pending = (await service.pending(primary.projectId))[0]!;
    await expect(service.reconcile(pending.id)).rejects.toThrow("outcome is uncertain");
    expect((await cache.workspaces.get(workspace.id))?.path).toBe(checkout);
  });

  it("should reject a replacement checkout with the same branch and commit but another administrative identity", async () => {
    const original = gitMove.move.bind(gitMove);
    vi.spyOn(gitMove, "move").mockImplementation(async intent => { await original(intent); throw new Error("reply lost"); });
    await expect(move()).rejects.toThrow("reply lost");
    const pending = (await service.pending(primary.projectId))[0]!;
    git(repository, ["worktree", "move", destination, path.join(directory, "externally-moved")]);
    // Simulate external Git interference; production movement never uses force.
    git(repository, ["worktree", "add", "--force", destination, "topic"]);
    await expect(service.reconcile(pending.id)).rejects.toThrow("identity could not be verified");
    expect((await cache.workspaces.get(workspace.id))?.path).toBe(checkout);
    expect(await service.pending(primary.projectId)).toHaveLength(1);
  });

  it("should cancel positive Git failure only after proving the original checkout is intact", async () => {
    vi.spyOn(gitMove, "move").mockResolvedValue({ stdout: "", stderr: "fixture cross-device failure", exitCode: 1,
      stdoutCapReached: false, stderrCapReached: false });
    await expect(move()).rejects.toThrow("cross-device failure");
    expect(await service.pending(primary.projectId)).toEqual([]);
    expect(fs.existsSync(checkout)).toBe(true);
    expect((await cache.workspaces.get(workspace.id))?.path).toBe(checkout);
  });

  it("should refuse locked worktrees without unlocking them", async () => {
    git(repository, ["worktree", "lock", "--reason", "fixture", checkout]);
    await expect(move()).rejects.toThrow("unlocked");
    expect(git(repository, ["worktree", "list", "--porcelain"])).toContain("locked fixture");
  });

  it("should honor Git's submodule protection without a copy or force fallback", async () => {
    const child = path.join(directory, "child");
    fs.mkdirSync(child);
    git(child, ["init", "-b", "main"]);
    git(child, ["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "child"]);
    git(checkout, ["-c", "protocol.file.allow=always", "submodule", "add", child, "child"]);
    git(checkout, ["-c", "commit.gpgsign=false", "commit", "-m", "submodule"]);
    await expect(move()).rejects.toThrow("submodules");
    expect(fs.existsSync(path.join(checkout, "child", ".git"))).toBe(true);
    expect(await service.pending(primary.projectId)).toEqual([]);
  });

  it("should refuse an occupied destination, a nested path or a symbolic-link parent", async () => {
    const occupied = path.join(directory, "occupied");
    fs.mkdirSync(occupied);
    await expect(move(undefined, occupied)).rejects.toThrow("must not already exist");
    await expect(move(undefined, path.join(repository, "nested"))).rejects.toThrow("outside all registered");
    const link = path.join(directory, "link");
    fs.symlinkSync(storage, link, "dir");
    await expect(move(undefined, path.join(link, "target"))).rejects.toThrow("symbolic-link");
    expect(fs.existsSync(checkout)).toBe(true);
  });

  it("should refuse primary, imported and wrong-source requests before source operations", async () => {
    await expect(service.move({ projectId: primary.projectId, workspaceId: primary.id, sourceId: "source" })).rejects.toThrow("managed secondary");
    await expect(service.move({ projectId: primary.projectId, workspaceId: workspace.id, sourceId: "another" })).rejects.toThrow("managed secondary");
    const external = path.join(directory, "external");
    git(repository, ["worktree", "add", "--detach", external]);
    await cache.workspaces.registerDiscovered(primary.id, "source", repository, [external]);
    const imported = (await cache.workspaces.list(primary.projectId)).find(item => item.path === external)!;
    await expect(service.move({ projectId: primary.projectId, workspaceId: imported.id, sourceId: "source" })).rejects.toThrow("managed secondary");
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });

  it("should refuse managed activity, incomplete inventories and concurrent source requests before movement", async () => {
    inactive.mockRejectedValueOnce(new Error("Stop managed fixture"));
    await expect(move()).rejects.toThrow("managed fixture");
    request.mockImplementationOnce(async () => ({ config: { projects: { [repository]: { trust_level: "trusted" } } } }))
      .mockImplementationOnce(async () => ({ data: [], nextCursor: "more" }));
    await expect(move()).rejects.toThrow("inventory is incomplete");
    await gate.run("source", async () => { await expect(move()).rejects.toThrow("another operation"); });
    expect(fs.existsSync(checkout)).toBe(true);
    expect(await service.pending(primary.projectId)).toEqual([]);
  });

  it("should keep native Windows storage paths in the owning source rather than resolving them on Linux", async () => {
    const windowsPrimary = await cache.workspaces.resolvePath("C:\\repo", "windows");
    const intent = await cache.workspaces.creations.begin({ primaryWorkspaceId: windowsPrimary.id, sourceId: "windows",
      projectPath: "C:\\repo", repositoryPath: "C:\\repo\\.git", destinationPath: "C:\\workspace",
      start: { mode: "newBranch", branchName: "topic", startPoint: "HEAD" } });
    await cache.workspaces.creations.submitting(intent.id, "a".repeat(40), "refs/heads/topic");
    await cache.workspaces.creations.confirmGit(intent.id);
    const id = await cache.workspaces.creations.commit(intent.id);
    const target = `C:\\storage\\${windowsPrimary.projectId}\\${id}`;
    const directories = new Set(["C:\\", "C:\\repo", "C:\\workspace", "C:\\storage"]);
    let moved = false;
    const windowsClient = {
      getMetadata: async (value: string) => {
        if (!directories.has(value)) throw new Error("Chemin introuvable (os error 3)");
        return { isDirectory: true, isSymlink: false };
      },
      createDirectory: async (value: string) => { directories.add(value); },
      request: async (method: string) => method === "config/read"
        ? { config: { projects: { ["C:\\repo"]: { trust_level: "trusted" } } } } : { data: [], nextCursor: null }
    };
    const windowsClients = { ensureClient: vi.fn(async (sourceId: string) => {
      expect(sourceId).toBe("windows");
      return windowsClient as unknown as CodexAppServerClient;
    }) };
    const runGit: RunGit = async (cwd, sourceId, args) => {
      expect(sourceId).toBe("windows");
      expect(cwd.startsWith("C:\\")).toBe(true);
      let stdout = "C:/repo/.git\n";
      if (args[0] === "worktree" && args[1] === "move") {
        expect(args).toEqual(["worktree", "move", "--", "C:\\workspace", target]);
        directories.delete("C:\\workspace");
        directories.add(target);
        moved = true;
        stdout = "";
      } else if (args[0] === "worktree") {
        const location = moved ? target.replaceAll("\\", "/") : "C:/workspace";
        stdout = `worktree C:/repo\0HEAD ${"a".repeat(40)}\0branch refs/heads/main\0\0worktree ${location}\0HEAD ${"a".repeat(40)}\0branch refs/heads/topic\0\0`;
      } else if (args.includes("--absolute-git-dir")) stdout = "C:/repo/.git/worktrees/workspace\n";
      else if (args.includes("--show-toplevel")) stdout = cwd.replaceAll("\\", "/") + "\n";
      return { stdout, stderr: "", exitCode: 0, stdoutCapReached: false, stderrCapReached: false };
    };
    const windowsService = new WorkspaceMoveService(cache.workspaces, windowsClients, gate, inactive,
      () => [{ id: "windows-root", label: "Windows", sourceId: "windows", path: "C:\\storage", isDefault: true }],
      new WorkspaceMoveGit(runGit));
    await windowsService.move({ projectId: windowsPrimary.projectId, workspaceId: id, sourceId: "windows" });
    expect((await cache.workspaces.get(id))?.path).toBe(target);
  });

  it("should reject roots from another source and reject mixing a root with a custom path", async () => {
    roots.push({ id: "foreign", label: "Foreign", sourceId: "another", path: storage, isDefault: true });
    await expect(move("foreign")).rejects.toThrow("Configure a workspace storage");
    await expect(move("storage", path.join(directory, "custom"))).rejects.toThrow("either");
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });
});
