import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { ProjectSourcePort } from "../src/backend/runtime/runtimePorts.js";
import type { RunGit } from "../src/backend/git/gitCommandRunner.js";
import { runLocalFileOperation, runSourceFileOperation } from "../src/backend/files/runFileOperation.js";
import { WorkspaceChangesService } from "../src/backend/workspaces/WorkspaceChangesService.js";

let directory: string;
let root: string;
let cache: OpenCodexCacheRepository;
let service: WorkspaceChangesService;
let input: { projectId: string; workspaceId: string; sourceId: string; workspacePath: string };
let checkedAt: string;
let environment: NodeJS.ProcessEnv;
const clients = { ensureClient: vi.fn() };
const run = vi.fn<RunGit>();

/** Uses only disposable repositories, with hooks, signing and user Git configuration isolated. */
function git(args: string[]): string {
  return execFileSync("git", args, { cwd: root, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

beforeEach(async () => {
  vi.resetAllMocks();
  directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "workspace-changes-")));
  root = path.join(directory, "checkout été");
  await fs.mkdir(root);
  environment = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(directory, "empty"),
    GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid", GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" };
  git(["init", "-b", "main"]);
  await fs.writeFile(path.join(root, "tracked.txt"), "initial");
  await fs.writeFile(path.join(root, ".gitignore"), "node_modules/\nbuild/\n");
  git(["add", "."]);
  git(["-c", "commit.gpgsign=false", "commit", "-m", "initial"]);
  cache = createOpenCodexSqliteCacheRepository({ directory: path.join(directory, "cache") });
  const workspace = await cache.workspaces.resolvePath(root, "source");
  input = { projectId: workspace.projectId, workspaceId: workspace.id, sourceId: "source", workspacePath: root };
  checkedAt = "2026-10-01T12:00:00Z";
  run.mockImplementation(async (cwd, sourceId, args) => {
    expect(cwd).toBe(root);
    expect(sourceId).toBe("source");
    expect(args).toContain("--no-optional-locks");
    expect(args).toContain("core.fsmonitor=false");
    return { stdout: git(args), stderr: "", exitCode: 0, stdoutCapReached: false, stderrCapReached: false };
  });
  service = new WorkspaceChangesService(cache, clients,
    { resolveRequestedSource: async () => ({ id: "source", kind: "local" }) } as unknown as ProjectSourcePort,
    run, { local: runLocalFileOperation, source: runSourceFileOperation }, () => checkedAt);
});

afterEach(async () => {
  await cache.close();
  await fs.rm(directory, { recursive: true, force: true });
});

describe("punctual Git and file observations", () => {
  it("should establish a baseline, detect repeated edits to an already-dirty file and retain dates on unchanged refreshes", async () => {
    expect(await service.read(input)).toMatchObject({ lastChangedAt: null, hasChanges: false, state: "checked" });
    checkedAt = "2026-10-02T12:00:00Z";
    await fs.writeFile(path.join(root, "tracked.txt"), "edited contents");
    expect(await service.read(input)).toMatchObject({ lastChangedAt: checkedAt, hasChanges: true });
    checkedAt = "2026-10-03T12:00:00Z";
    expect(await service.read(input)).toMatchObject({ checkedAt, lastChangedAt: "2026-10-02T12:00:00Z" });
    await fs.writeFile(path.join(root, "tracked.txt"), "another longer edit to the same dirty file");
    expect(await service.read(input)).toMatchObject({ lastChangedAt: checkedAt, hasChanges: true });
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });

  it("should detect untracked file changes, deletion, commits and branch changes without continuously polling", async () => {
    await service.read(input);
    checkedAt = "2026-10-02T12:00:00Z";
    const file = path.join(root, "untracked\nété.txt");
    await fs.writeFile(file, "new");
    expect(await service.read(input)).toMatchObject({ lastChangedAt: checkedAt, hasChanges: true });
    checkedAt = "2026-10-03T12:00:00Z";
    await fs.unlink(file);
    expect(await service.read(input)).toMatchObject({ lastChangedAt: checkedAt, hasChanges: false });
    checkedAt = "2026-10-04T12:00:00Z";
    git(["-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "external commit"]);
    expect(await service.read(input)).toMatchObject({ lastChangedAt: checkedAt, hasChanges: false });
    checkedAt = "2026-10-05T12:00:00Z";
    git(["switch", "-c", "external-branch"]);
    expect(await service.read(input)).toMatchObject({ lastChangedAt: checkedAt, hasChanges: false });
  });

  it("should ignore build/dependency output excluded by Git and retain its baseline after SQLite reopening", async () => {
    await service.read(input);
    await fs.mkdir(path.join(root, "node_modules"));
    await fs.writeFile(path.join(root, "node_modules", "generated"), "large build output");
    checkedAt = "2026-10-02T12:00:00Z";
    expect(await service.read(input)).toMatchObject({ lastChangedAt: null, hasChanges: false });
    await cache.close();
    cache = createOpenCodexSqliteCacheRepository({ directory: path.join(directory, "cache") });
    expect(await cache.workspaces.changes.get(input.workspaceId)).toMatchObject({ lastChangedAt: null, state: "cached" });
    expect((await cache.workspaces.activity(input.projectId))[0]?.changes).toMatchObject({ checkedAt, state: "cached" });
  });

  it("should reject truncated Git inventories and preserve the last complete observation", async () => {
    await service.read(input);
    checkedAt = "2026-10-02T12:00:00Z";
    const original = run.getMockImplementation()!;
    run.mockImplementation(async (...args) => ({ ...await original(...args), stdoutCapReached: true }));
    await expect(service.read(input)).rejects.toThrow(/inventory|root/);
    expect(await cache.workspaces.changes.get(input.workspaceId)).toMatchObject({ checkedAt: "2026-10-01T12:00:00Z" });
  });

  it.each(["source", "path", "project", "move", "removal", "removed"])("should reject stale %s context before scanning", async reason => {
    const wrong = { ...input };
    if (reason === "source") wrong.sourceId = "other";
    if (reason === "path") wrong.workspacePath = "/other";
    if (reason === "project") wrong.projectId = "other";
    if (reason === "move" || reason === "removal" || reason === "removed") {
      const original = await cache.workspaces.get(input.workspaceId);
      vi.spyOn(cache.workspaces, "get").mockResolvedValue({ ...original!,
        movePending: reason === "move", removalPending: reason === "removal", removedAt: reason === "removed" ? checkedAt : null });
    }
    await expect(service.read(wrong)).rejects.toThrow(/Workspace|workspace/);
    expect(run).not.toHaveBeenCalled();
  });

  it("should not publish a partial metadata scan", async () => {
    await service.read(input);
    const partial = new WorkspaceChangesService(cache, clients,
      { resolveRequestedSource: async () => ({ id: "source", kind: "local" }) } as unknown as ProjectSourcePort,
      run, { local: async () => ({ ok: true, value: { fingerprint: "b".repeat(64), complete: false } }),
        source: runSourceFileOperation }, () => "2026-10-02T12:00:00Z");
    expect(await partial.read(input)).toMatchObject({ state: "partial" });
    expect(await cache.workspaces.changes.get(input.workspaceId)).toMatchObject({ checkedAt: "2026-10-01T12:00:00Z" });
  });

  it("should keep the previous baseline when Git changes during a metadata scan", async () => {
    await service.read(input);
    const changing = new WorkspaceChangesService(cache, clients,
      { resolveRequestedSource: async () => ({ id: "source", kind: "local" }) } as unknown as ProjectSourcePort,
      run, { local: async request => {
        const result = await runLocalFileOperation(request);
        git(["switch", "-c", "changed-during-scan"]);
        return result;
      }, source: runSourceFileOperation }, () => "2026-10-02T12:00:00Z");
    expect(await changing.read(input)).toMatchObject({ state: "partial" });
    expect(await cache.workspaces.changes.get(input.workspaceId)).toMatchObject({ checkedAt: "2026-10-01T12:00:00Z" });
  });

  it.each(["C:\\Workspace\\Checkout $literal", "/remote/checkout été"])("should keep custom source paths off the host filesystem: %s", async workspacePath => {
    const workspace = await cache.workspaces.resolvePath(workspacePath, "remote");
    const remoteInput = { workspaceId: workspace.id, projectId: workspace.projectId, sourceId: "remote", workspacePath };
    const client = {} as CodexAppServerClient;
    const remoteClients = { ensureClient: vi.fn(async () => client) };
    const local = vi.fn();
    const source = vi.fn(async () => ({ ok: true as const, value: { fingerprint: "a".repeat(64), complete: true } }));
    const remoteGit: RunGit = async (cwd, sourceId, args) => {
      expect(cwd).toBe(workspacePath);
      expect(sourceId).toBe("remote");
      let stdout = "# branch.oid abc\0# branch.head main\0";
      if (args.includes("rev-parse")) stdout = workspacePath.replaceAll("\\", "/") + "\n";
      if (args.includes("ls-files")) stdout = "source.ts\0";
      return { stdout, stderr: "", exitCode: 0, stdoutCapReached: false, stderrCapReached: false };
    };
    const remote = new WorkspaceChangesService(cache, remoteClients,
      { resolveRequestedSource: async () => ({ id: "remote", kind: "custom" }) } as unknown as ProjectSourcePort,
      remoteGit, { local, source }, () => checkedAt);
    expect(await remote.read(remoteInput)).toMatchObject({ state: "checked", lastChangedAt: null });
    expect(source).toHaveBeenCalledWith(client, { type: "workspaceChanges", target: { ...remoteInput, path: "" }, paths: ["source.ts"] });
    expect(local).not.toHaveBeenCalled();
  });

  it("should serialize checks for one workspace without replacing its pending baseline", async () => {
    let begin!: () => void;
    let finish!: () => void;
    const started = new Promise<void>(resolve => { begin = resolve; });
    const completion = new Promise<void>(resolve => { finish = resolve; });
    const blocking = new WorkspaceChangesService(cache, clients,
      { resolveRequestedSource: async () => ({ id: "source", kind: "local" }) } as unknown as ProjectSourcePort,
      run, { local: async request => { begin(); await completion; return runLocalFileOperation(request); },
        source: runSourceFileOperation }, () => checkedAt);
    const first = blocking.read(input);
    await started;
    await expect(blocking.read(input)).rejects.toThrow("already running");
    finish();
    await expect(first).resolves.toMatchObject({ state: "checked" });
  });
});
