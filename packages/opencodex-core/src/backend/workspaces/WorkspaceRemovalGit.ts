import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";
import type { GitProcessResult, RunGit } from "../git/gitCommandRunner.js";
import { GitWorktreeService } from "../git/GitWorktreeService.js";
import type { GitWorktree } from "../git/gitWorktreeParsers.js";
import { normalizeWorkspaceSourcePath } from "./workspaceSourcePath.js";

/** Stateless Git checks and removal; never forces, prunes, stashes or deletes branches. */
export class WorkspaceRemovalGit {
  /** Reuses source-native repository identity and complete porcelain parsing. */
  private readonly worktrees: GitWorktreeService;

  /** Keeps process effects injectable for deterministic tests and real Git fixtures. */
  constructor(private readonly runGit: RunGit) {
    this.worktrees = new GitWorktreeService(runGit);
  }

  /** Resolves the primary's common directory before reserving it. */
  async repositoryPath(projectPath: string, sourceId: string): Promise<string> {
    return await this.worktrees.repositoryPath(projectPath, sourceId);
  }

  /** Requires an exact linked checkout, preserving Git's external locks and missing-entry warnings. */
  async inspect(removal: OpenCodexWorkspaceRemoval): Promise<GitWorktree | null> {
    if (await this.repositoryPath(removal.projectPath, removal.sourceId) !== removal.repositoryPath) {
      throw new Error("Git repository identity changed; removal remains blocked.");
    }
    const entries = await this.worktrees.list(removal.projectPath, removal.sourceId);
    if (!entries.some(entry => normalizeWorkspaceSourcePath(entry.path) === removal.projectPath && !entry.bare)) {
      throw new Error("The primary checkout is no longer registered by Git.");
    }
    return entries.find(entry => normalizeWorkspaceSourcePath(entry.path) === removal.workspacePath) ?? null;
  }

  /** Refuses any local files at risk, including ignored files and unreferenced detached commits. */
  async requireClean(removal: OpenCodexWorkspaceRemoval): Promise<void> {
    const entry = await this.inspect(removal);
    if (entry === null || entry.bare || entry.lockedReason !== null || entry.prunableReason !== null) {
      throw new Error("Workspace must be an available, unlocked Git worktree before removal.");
    }
    if (await this.repositoryPath(removal.workspacePath, removal.sourceId) !== removal.repositoryPath) {
      throw new Error("Workspace belongs to a different Git repository.");
    }
    const status = await this.runGit(removal.workspacePath, removal.sourceId,
      ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching",
        "--ignore-submodules=none"]);
    if (status.stdoutCapReached || status.stdout.length > 0) {
      throw new Error("Workspace contains modified, untracked or ignored files. Save or remove them before deleting it.");
    }
    if (entry.detached) {
      const refs = await this.runGit(removal.workspacePath, removal.sourceId,
        ["for-each-ref", "--contains=HEAD", "--format=%(refname)", "refs/heads/", "refs/tags/"]);
      if (refs.stdoutCapReached || refs.stdout.trim().length === 0) {
        throw new Error("Create a branch or tag for this detached commit before removing the workspace.");
      }
    }
  }

  /** Uses Git's own clean-check and submodule protection, without any force flag. */
  async remove(removal: OpenCodexWorkspaceRemoval): Promise<GitProcessResult> {
    return await this.runGit(removal.projectPath, removal.sourceId,
      ["worktree", "remove", "--", removal.workspacePath], { allowFailure: true, timeoutMs: 120_000 });
  }
}
