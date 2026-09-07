import { createGitErrorMessage } from "./gitCommandRunner.js";
import type { RunGit } from "./gitCommandRunner.js";
import { parseGitWorktrees, type GitWorktree } from "./gitWorktreeParsers.js";

import type { OpenCodexWorkspaceStart } from "@open-codex-ui/opencodex-protocol";

export type GitWorktreeStart = OpenCodexWorkspaceStart;

/** Durable boundaries invoked immediately around the mutating Git command. */
export interface GitWorktreeCreationLifecycle {
  /** Persists the frozen expected result before any checkout mutation. */
  beforeDispatch(head: string, branch: string | null): Promise<void>;
  /** Records a successful Git exit before listing or publishing the checkout. */
  afterSuccess(): Promise<void>;
}

/** Stateless Git boundary; callers own durable lifecycle, trust and destination policy. */
export class GitWorktreeService {
  /** Uses the existing source-aware process adapter; no host filesystem access. */
  constructor(private readonly runGit: RunGit) {}

  /** Reads Git's absolute common directory as the source-local repository lock key. */
  async repositoryPath(projectPath: string, sourceId: string): Promise<string> {
    requireSourcePath(projectPath, sourceId);
    const response = await this.runGit(projectPath, sourceId,
      ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if (response.stdoutCapReached || !response.stdout.endsWith("\n")) {
      throw new Error("Git did not return a complete repository path.");
    }
    const result = response.stdout.slice(0, -1);
    requireSourcePath(result, sourceId);
    return result;
  }

  /** Lists complete metadata, refusing capped output rather than hiding worktrees. */
  async list(projectPath: string, sourceId: string): Promise<GitWorktree[]> {
    requireSourcePath(projectPath, sourceId);
    const result = await this.runGit(projectPath, sourceId, ["worktree", "list", "--porcelain", "-z"]);
    if (result.stdoutCapReached) {
      throw new Error("Git worktree listing was truncated.");
    }
    return parseGitWorktrees(result.stdout);
  }

  /**
   * Creates one checkout without force or implicit remote tracking.
   * Git checkout hooks/filters follow source configuration; the caller must validate trust.
   * Errors after dispatch may leave a worktree or branch: callers must reconcile, never retry blindly.
   */
  async create(
    projectPath: string, sourceId: string, destinationPath: string, start: GitWorktreeStart,
    lifecycle?: GitWorktreeCreationLifecycle
  ): Promise<GitWorktree[]> {
    requireSourcePath(projectPath, sourceId);
    requireSourcePath(destinationPath, sourceId);
    const input = { ...start };
    const args = ["worktree", "add", "--no-guess-remote"];
    if (input.mode !== "detached") {
      await this.validateBranch(projectPath, sourceId, input.branchName);
    }
    let reference: string;
    let expectedHead: string;
    if (input.mode === "existingBranch") {
      reference = input.branchName;
      expectedHead = await this.resolveCommit(projectPath, sourceId, `refs/heads/${reference}`);
    } else {
      expectedHead = await this.resolveCommit(projectPath, sourceId, input.startPoint);
      reference = expectedHead;
      if (input.mode === "newBranch") {
        const existing = await this.runGit(projectPath, sourceId,
          ["show-ref", "--verify", "--quiet", `refs/heads/${input.branchName}`], { allowFailure: true });
        if (existing.exitCode === 0) {
          throw new Error("Workspace branch already exists.");
        }
        if (existing.exitCode !== 1) {
          throw new Error(createGitErrorMessage(existing));
        }
        args.push("--no-track", "-b", input.branchName);
      } else {
        args.push("--detach");
      }
    }
    args.push("--", destinationPath, reference);
    const expectedBranch = input.mode === "detached" ? null : `refs/heads/${input.branchName}`;
    await lifecycle?.beforeDispatch(expectedHead, expectedBranch);
    await this.runGit(projectPath, sourceId, args, { timeoutMs: 120_000 });
    await lifecycle?.afterSuccess();
    return await this.list(projectPath, sourceId);
  }

  /** Resolves a frozen commit identity before reserving the mutating command. */
  private async resolveCommit(projectPath: string, sourceId: string, startPoint: string): Promise<string> {
    if (startPoint.length === 0 || startPoint.includes("\0")) {
      throw new Error("A Git start point is required.");
    }
    const result = await this.runGit(projectPath, sourceId,
      ["rev-parse", "--verify", "--end-of-options", `${startPoint}^{commit}`]);
    const head = result.stdout.trim();
    if (result.stdoutCapReached || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(head)) {
      throw new Error("Git did not return a complete commit id.");
    }
    return head;
  }

  /** Rejects branch shorthand expansion and option-like names before mutation. */
  private async validateBranch(projectPath: string, sourceId: string, branch: string): Promise<void> {
    if (branch.length === 0 || branch.startsWith("-") || branch.includes("\0")) {
      throw new Error("An explicit Git branch name is required.");
    }
    const response = await this.runGit(projectPath, sourceId, ["check-ref-format", "--branch", branch]);
    if (response.stdoutCapReached || response.stdout.trimEnd() !== branch) {
      throw new Error("Git branch shorthand is not accepted for workspace creation.");
    }
  }
}

/** Requires explicit source-local absolute paths without resolving them on Electron's host. */
function requireSourcePath(value: string, sourceId: string): void {
  const isPosixAbsolute = value.startsWith("/");
  const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/u.test(value)
    || /^\\\\[^\\/]+[\\/][^\\/]+/u.test(value);
  if (sourceId.trim().length === 0 || value.includes("\0")
    || (!isPosixAbsolute && !isWindowsAbsolute)) {
    throw new Error("Worktree operations require an explicit source and absolute source path.");
  }
}
