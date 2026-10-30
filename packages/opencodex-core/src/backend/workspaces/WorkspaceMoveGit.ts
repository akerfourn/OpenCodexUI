import type { OpenCodexWorkspaceMove } from "@open-codex-ui/opencodex-protocol";
import { GitWorktreeService } from "../git/GitWorktreeService.js";
import type { GitProcessResult, RunGit } from "../git/gitCommandRunner.js";
import { workspaceSourcePathsEqual, normalizeWorkspaceSourcePath } from "./workspaceSourcePath.js";
import { isInsideWorkspace } from "./WorkspaceRemovalRuntime.js";

/** Stateless, source-native movement and exact worktree identity verification. */
export class WorkspaceMoveGit {
  /** Complete Git registry reads share the existing source process boundary. */
  private readonly worktrees: GitWorktreeService;
  /** Keeps process execution injectable for real Git and deterministic transport tests. */
  constructor(private readonly runGit: RunGit) { this.worktrees = new GitWorktreeService(runGit); }

  /** Freezes a stable administrative identity before reserving or moving a registered checkout. */
  async capture(projectPath: string, workspacePath: string, destinationPath: string, sourceId: string): Promise<{
    repositoryPath: string; gitDirectory: string; expectedHead: string; expectedBranch: string | null;
  }> {
    const repositoryPath = await this.worktrees.repositoryPath(projectPath, sourceId);
    const entries = await this.worktrees.list(projectPath, sourceId);
    const primary = entries.find(entry => workspaceSourcePathsEqual(entry.path, projectPath));
    const workspace = entries.find(entry => workspaceSourcePathsEqual(entry.path, workspacePath));
    if (primary === undefined || primary.bare || workspace === undefined || workspace.bare || workspace.head === null
      || workspace.lockedReason !== null || workspace.prunableReason !== null) {
      throw new Error("Move requires an available, unlocked secondary Git worktree and its primary.");
    }
    for (const entry of entries) {
      if (isInsideWorkspace(destinationPath, entry.path) || isInsideWorkspace(entry.path, destinationPath)) {
        throw new Error("Move destination must be outside all registered Git checkouts.");
      }
    }
    if (isInsideWorkspace(destinationPath, repositoryPath) || isInsideWorkspace(repositoryPath, destinationPath)) {
      throw new Error("Move destination must be separate from the common Git directory.");
    }
    if (!workspaceSourcePathsEqual(await this.worktrees.repositoryPath(workspacePath, sourceId), repositoryPath)) {
      throw new Error("Workspace belongs to a different Git repository.");
    }
    const gitDirectory = await this.directory(workspacePath, sourceId, "--absolute-git-dir");
    if (workspaceSourcePathsEqual(gitDirectory, repositoryPath)) {
      throw new Error("The repository's main checkout cannot be moved with git worktree move.");
    }
    return { repositoryPath, gitDirectory, expectedHead: workspace.head, expectedBranch: workspace.branch };
  }

  /** Verifies a frozen checkout at one location without repairing, unlocking or modifying Git. */
  async matches(move: OpenCodexWorkspaceMove, location: string, absentLocation: string): Promise<boolean> {
    if (!workspaceSourcePathsEqual(await this.worktrees.repositoryPath(move.projectPath, move.sourceId), move.repositoryPath)) {
      throw new Error("Git repository identity changed during movement. Recovery remains blocked.");
    }
    const entries = await this.worktrees.list(move.projectPath, move.sourceId);
    const entry = entries.find(item => workspaceSourcePathsEqual(item.path, location));
    if (!entries.some(item => workspaceSourcePathsEqual(item.path, move.projectPath) && !item.bare)
      || entries.some(item => workspaceSourcePathsEqual(item.path, absentLocation))
      || entry === undefined || entry.bare || entry.lockedReason !== null || entry.prunableReason !== null
      || entry.head !== move.expectedHead || entry.branch !== move.expectedBranch) return false;
    return workspaceSourcePathsEqual(await this.worktrees.repositoryPath(location, move.sourceId), move.repositoryPath)
      && workspaceSourcePathsEqual(await this.directory(location, move.sourceId, "--absolute-git-dir"), move.gitDirectory)
      && workspaceSourcePathsEqual(await this.directory(location, move.sourceId, "--show-toplevel"), location);
  }

  /** Uses Git's native move, retaining dirty/ignored files and respecting locks and submodules. */
  async move(intent: OpenCodexWorkspaceMove): Promise<GitProcessResult> {
    return await this.runGit(intent.projectPath, intent.sourceId,
      ["worktree", "move", "--", intent.workspacePath, intent.destinationPath], { allowFailure: true, timeoutMs: 120_000 });
  }

  /** Refuses capped or unterminated path output; source paths are never resolved on the host. */
  private async directory(cwd: string, sourceId: string, flag: string): Promise<string> {
    const result = await this.runGit(cwd, sourceId, ["rev-parse", flag]);
    if (result.stdoutCapReached || !result.stdout.endsWith("\n")) throw new Error("Git did not return a complete worktree path.");
    return normalizeWorkspaceSourcePath(result.stdout.slice(0, -1));
  }
}
