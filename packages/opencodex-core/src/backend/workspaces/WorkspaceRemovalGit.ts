import type { OpenCodexWorkspaceRemoval, OpenCodexWorkspaceRemovalInspection } from "@open-codex-ui/opencodex-protocol";
import type { GitProcessResult, RunGit } from "../git/gitCommandRunner.js";
import { GitWorktreeService } from "../git/GitWorktreeService.js";
import type { GitWorktree } from "../git/gitWorktreeParsers.js";
import { normalizeWorkspaceSourcePath } from "./workspaceSourcePath.js";
import { parseWorkspaceRemovalFiles } from "./workspaceRemovalFiles.js";

/** Source-owned identities used by preflight before a durable removal exists. */
export type WorkspaceRemovalTarget = Pick<OpenCodexWorkspaceRemoval, "projectId" | "workspaceId" | "sourceId"
  | "primaryWorkspaceId" | "projectPath" | "workspacePath" | "repositoryPath" | "force">;

/** Stateless Git checks; destructive force is explicit and never bypasses identity or lock checks. */
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
  async inspect(removal: WorkspaceRemovalTarget): Promise<GitWorktree | null> {
    if (await this.repositoryPath(removal.projectPath, removal.sourceId) !== removal.repositoryPath) {
      throw new Error("Git repository identity changed; removal remains blocked.");
    }
    const entries = await this.worktrees.list(removal.projectPath, removal.sourceId);
    if (!entries.some(entry => normalizeWorkspaceSourcePath(entry.path) === removal.projectPath && !entry.bare)) {
      throw new Error("The primary checkout is no longer registered by Git.");
    }
    return entries.find(entry => normalizeWorkspaceSourcePath(entry.path) === removal.workspacePath) ?? null;
  }

  /** Reads a bounded preview of a complete inventory, without reservations or destructive operations. */
  async inspectFiles(removal: WorkspaceRemovalTarget): Promise<OpenCodexWorkspaceRemovalInspection> {
    await this.requireRemovable(removal);
    const status = await this.runGit(removal.workspacePath, removal.sourceId,
      ["--no-optional-locks", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored=matching",
        "--ignore-submodules=none"]);
    if (status.stdoutCapReached) throw new Error("Incomplete Git removal file inventory.");
    const files = parseWorkspaceRemovalFiles(status.stdout);
    return { projectId: removal.projectId, workspaceId: removal.workspaceId, sourceId: removal.sourceId,
      workspacePath: removal.workspacePath, files: files.slice(0, 100), totalFileCount: files.length };
  }

  /** Refuses local files unless their loss was explicitly authorized; other checks always apply. */
  async requireClean(removal: WorkspaceRemovalTarget): Promise<void> {
    const inspection = await this.inspectFiles(removal);
    if (inspection.totalFileCount > 0 && removal.force !== true) {
      throw new Error("Workspace contains modified, untracked or ignored files. Save or remove them before deleting it.");
    }
  }

  /** Protects repository ownership, external locks and detached commits even with file-loss consent. */
  private async requireRemovable(removal: WorkspaceRemovalTarget): Promise<void> {
    const entry = await this.inspect(removal);
    if (entry === null || entry.bare || entry.lockedReason !== null || entry.prunableReason !== null) {
      throw new Error("Workspace must be an available, unlocked Git worktree before removal.");
    }
    if (await this.repositoryPath(removal.workspacePath, removal.sourceId) !== removal.repositoryPath) {
      throw new Error("Workspace belongs to a different Git repository.");
    }
    if (entry.detached) {
      const refs = await this.runGit(removal.workspacePath, removal.sourceId,
        ["for-each-ref", "--contains=HEAD", "--format=%(refname)", "refs/heads/", "refs/tags/"]);
      if (refs.stdoutCapReached || refs.stdout.trim().length === 0) {
        throw new Error("Create a branch or tag for this detached commit before removing the workspace.");
      }
    }
  }

  /** Uses exactly one --force only after explicit consent; locked worktrees are never force-unlocked. */
  async remove(removal: OpenCodexWorkspaceRemoval): Promise<GitProcessResult> {
    const args = ["worktree", "remove"];
    if (removal.force === true) args.push("--force");
    args.push("--", removal.workspacePath);
    return await this.runGit(removal.projectPath, removal.sourceId,
      args, { allowFailure: true, timeoutMs: 120_000 });
  }
}
