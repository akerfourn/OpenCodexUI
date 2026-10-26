import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import { createOpenCodexSqliteCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexWorkspaceRoot } from "@open-codex-ui/opencodex-protocol";
import type { RunGit } from "../src/backend/git/gitCommandRunner";
import type { ProjectSourcePort } from "../src/backend/runtime/runtimePorts";
import { PrimaryMoveFiles } from "../src/backend/workspaces/PrimaryMoveFiles";
import { PrimaryMoveGit } from "../src/backend/workspaces/PrimaryMoveGit";
import { PrimaryWorkspaceMoveService } from "../src/backend/workspaces/PrimaryWorkspaceMoveService";
import { WorkspaceMoveService } from "../src/backend/workspaces/WorkspaceMoveService";
import { WorkspaceActivityGate } from "../src/backend/workspaces/WorkspaceActivityGate";

/** Builds isolated real files, Git and SQLite with only live source/session boundaries replaced. */
export async function primaryMoveFixture(options: { nonGit?: boolean; linkedPrimary?: boolean } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "primary-move-"));
  const main = path.join(directory, "project été ' $literal");
  const external = path.join(directory, "external");
  const destination = path.join(directory, "destination ' $literal");
  const storage = path.join(directory, "storage");
  fs.mkdirSync(main); fs.mkdirSync(storage);
  const environment = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(directory, "empty"),
    GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid", GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" };
  /** Runs fixture Git with fixed identity and no user configuration or remote resources. */
  function git(cwd: string, ...args: string[]): string {
    return execFileSync("git", args, { cwd, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }
  fs.writeFileSync(path.join(main, "tracked.txt"), "initial");
  if (!options.nonGit) {
    git(main, "init", "-b", "main");
    git(main, "add", ".");
    git(main, "-c", "commit.gpgsign=false", "commit", "-m", "fixture");
    git(main, "worktree", "add", "-b", "topic", external);
  }
  const initial = options.linkedPrimary ? external : main;
  const cacheDirectory = path.join(directory, "cache");
  const cache = createOpenCodexSqliteCacheRepository({ directory: cacheDirectory });
  const primary = await cache.workspaces.resolvePath(initial, "source");
  const request = vi.fn(async (method: string) => {
    if (method === "config/read") return { config: { projects: { [initial]: { trust_level: "trusted" } } } };
    return { data: [], nextCursor: null };
  });
  const client = { request, getMetadata: async (location: string) => {
    const stat = fs.lstatSync(location);
    return { isDirectory: stat.isDirectory(), isSymlink: stat.isSymbolicLink() };
  }, createDirectory: async (location: string) => { fs.mkdirSync(location); } } as unknown as CodexAppServerClient;
  const clients = { ensureClient: vi.fn(async () => client) };
  const sources = { resolveRequestedSource: async () => ({ id: "source", kind: "local" }) } as unknown as ProjectSourcePort;
  const files = new PrimaryMoveFiles(clients, sources);
  const runGit: RunGit = async (cwd, sourceId, args) => {
    if (sourceId !== "source") throw new Error("Wrong source.");
    return { stdout: git(cwd, ...args), stderr: "", exitCode: 0, stdoutCapReached: false, stderrCapReached: false };
  };
  const gitMove = new PrimaryMoveGit(files, runGit);
  const gate = new WorkspaceActivityGate();
  const inactive = vi.fn(async () => undefined);
  const roots: OpenCodexWorkspaceRoot[] = [{ id: "storage", sourceId: "source", label: "Storage", path: storage, isDefault: true }];
  const primaryMoves = new PrimaryWorkspaceMoveService(cache.workspaces, clients, gate, inactive, () => roots, files, gitMove);
  const service = new WorkspaceMoveService(cache.workspaces, clients, gate, inactive, () => roots, undefined, primaryMoves);
  const input = { projectId: primary.projectId, workspaceId: primary.id, sourceId: "source", expectedPath: primary.path, destinationPath: destination };
  let cacheClosed = false;
  /** Allows restart tests to close the old repository without closing it twice during cleanup. */
  async function closeCache(): Promise<void> {
    if (cacheClosed) return;
    await cache.close(); cacheClosed = true;
  }
  /** Closes SQLite before removing fixture data, including after failed or interrupted moves. */
  async function dispose(): Promise<void> { await closeCache(); fs.rmSync(directory, { recursive: true, force: true }); }
  return { directory, main, external, destination, storage, cacheDirectory, cache, primary, service,
    primaryMoves, input, files, gitMove, git, gate, inactive, clients, request, roots, closeCache, dispose };
}
