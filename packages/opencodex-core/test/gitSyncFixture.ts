import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OpenCodexGitSyncPlan, OpenCodexGitSyncScope, OpenCodexGitSyncStrategy } from "@open-codex-ui/opencodex-protocol";
import { GitSyncService } from "../src/backend/git/GitSyncService";
import type { GitSyncPorts } from "../src/backend/git/gitSyncRepository";
import { parseGitStatus } from "../src/backend/git/gitStatusParser";
import { parseGitRemotes } from "../src/backend/git/gitReferenceParsers";
import { createGitErrorMessage } from "../src/backend/git/gitCommandRunner";
import { readSyncDestination } from "../src/backend/git/gitSyncDestination";

const executeFile = promisify(execFile);

/** Creates isolated, offline repositories with fixed Git identities and commit timestamps. */
export async function createGitSyncFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "opencodex-git-sync-"));
  const local = path.join(root, "local");
  const peer = path.join(root, "peer");
  const remote = path.join(root, "remote.git");
  const emptyConfig = path.join(root, "empty.gitconfig");
  await writeFile(emptyConfig, "");
  const env = { ...process.env, GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_SYSTEM: emptyConfig,
    GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.test",
    GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.test",
    GIT_AUTHOR_DATE: "2020-01-01T00:00:00+00:00", GIT_COMMITTER_DATE: "2020-01-01T00:00:00+00:00" };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  /** Runs Git only inside a disposable fixture repository. */
  async function git(cwd: string, args: string[]): Promise<string> {
    return (await executeFile("git", args, { cwd, env })).stdout.trim();
  }
  /** Writes and commits an explicit fixture change, never touching the user's checkout. */
  async function commit(cwd: string, file: string, content: string, message: string): Promise<string> {
    await writeFile(path.join(cwd, file), content);
    await git(cwd, ["add", "--", file]);
    await git(cwd, ["commit", "--quiet", "-m", message]);
    return await git(cwd, ["rev-parse", "HEAD"]);
  }
  try {
    await git(root, ["init", "--bare", "--quiet", remote]);
    await git(root, ["init", "--quiet", "-b", "dev", local]);
    await commit(local, "shared.txt", "baseline\n", "baseline");
    await git(local, ["remote", "add", "origin", remote]);
    await git(local, ["push", "--quiet", "--set-upstream", "origin", "dev"]);
    await git(root, ["clone", "--quiet", "--branch", "dev", remote, peer]);
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  const commands: string[][] = [];
  const protectedBranches: string[] = [];
  const scope: OpenCodexGitSyncScope = { projectId: "project", sourceId: "source", projectPath: local };
  const allowedPaths = new Set([local]);
  const ports: GitSyncPorts = {
    runGit: async (cwd, sourceId, args, options = {}) => {
      if (sourceId !== scope.sourceId || !allowedPaths.has(cwd)) throw new Error("Unexpected source/worktree");
      commands.push([...args]);
      let result;
      try {
        const response = await executeFile("git", args, { cwd, env });
        result = { exitCode: 0, stdout: response.stdout, stderr: response.stderr, stdoutCapReached: false, stderrCapReached: false };
      } catch (error) {
        const failure = error as { code: number; stdout: string; stderr: string };
        if (typeof failure.code !== "number") throw error;
        result = { exitCode: failure.code, stdout: failure.stdout, stderr: failure.stderr, stdoutCapReached: false, stderrCapReached: false };
      }
      if (result.exitCode !== 0 && options.allowFailure !== true) throw new Error(createGitErrorMessage(result));
      return result;
    },
    readStatus: async (cwd, sourceId) => await readSyncDestination(ports.runGit, cwd, sourceId, {
      ...parseGitStatus((await executeFile("git", ["status", "--porcelain=v2", "-z", "--branch"], { cwd, env })).stdout),
      remotes: parseGitRemotes(await git(cwd, ["remote", "-v"]))
    }),
    readDirectory: async (directory) => await readdir(directory),
    readFile: async (file) => await readFile(file, "utf8"),
    protectedBranches: async (request) => {
      if (request.sourceId !== scope.sourceId || request.projectId !== scope.projectId || !allowedPaths.has(request.projectPath)) {
        throw new Error("Unexpected source/worktree");
      }
      return [...protectedBranches];
    }
  };
  const service = new GitSyncService(ports);
  const target = { remoteName: "origin", branchName: "dev", setUpstream: false };
  /** Adds a peer commit to the local bare server without contacting a network. */
  async function advanceRemote(file = "remote.txt", content = "remote\n"): Promise<string> {
    const hash = await commit(peer, file, content, `remote ${file}`);
    await git(peer, ["push", "--quiet", "origin", "dev"]);
    return hash;
  }
  /** Obtains a reviewed plan or exposes the complete diagnostic when setup is invalid. */
  async function plan(strategy: OpenCodexGitSyncStrategy = "rebase"): Promise<OpenCodexGitSyncPlan> {
    const response = await service.run({ ...scope, type: "git.sync.plan", target, strategy });
    if (response.plan === null) throw new Error(JSON.stringify(response));
    return response.plan;
  }
  /** Executes exactly the previously reviewed snapshot. */
  async function execute(plan: OpenCodexGitSyncPlan) {
    return await service.run({ ...scope, type: "git.sync.execute", plan });
  }
  /** Releases all repositories, including in-progress Git state, after each test. */
  async function dispose(): Promise<void> { await rm(root, { recursive: true, force: true }); }
  return { root, local, peer, remote, git, commit, advanceRemote, plan, execute, dispose, service, scope, target,
    ports, commands, protectedBranches, allowedPaths };
}
