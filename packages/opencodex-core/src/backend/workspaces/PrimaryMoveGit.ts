import type { OpenCodexFileContext, OpenCodexPrimaryMoveSnapshot, OpenCodexWorkspaceMove } from "@open-codex-ui/opencodex-protocol";
import { GitWorktreeService } from "../git/GitWorktreeService.js";
import type { RunGit } from "../git/gitCommandRunner.js";
import { parseGitWorktrees } from "../git/gitWorktreeParsers.js";
import { PrimaryMoveFiles } from "./PrimaryMoveFiles.js";
import { primaryMovePath } from "./primaryMovePaths.js";
import { isInsideWorkspace } from "./WorkspaceRemovalRuntime.js";
import { normalizeWorkspaceSourcePath, workspaceSourcePathsEqual } from "./workspaceSourcePath.js";

/** Freezes and verifies every registered checkout before repairing Git's bidirectional links. */
export class PrimaryMoveGit {
  /** Complete registry reads include external worktrees unknown to OpenCodexUI. */
  private readonly git: GitWorktreeService;
  /** Filesystem and process boundaries remain injectable for isolated real-Git tests. */
  constructor(private readonly files: PrimaryMoveFiles, private readonly runGit: RunGit) {
    this.git = new GitWorktreeService(runGit);
  }

  /** Supports ordinary repositories and linked-worktree primaries; refuses submodules and separate Git dirs. */
  async capture(context: OpenCodexFileContext, destination: string): Promise<OpenCodexPrimaryMoveSnapshot["git"]> {
    const root = await this.files.inspect(context);
    if (root.looksBare) throw new Error("Bare repositories require manual movement and relocation.");
    if (root.markerKind === "missing") return null;
    const commonDirectory = await this.git.repositoryPath(context.workspacePath, context.sourceId);
    const entries = await this.git.list(context.workspacePath, context.sourceId);
    if (!entries.some(entry => workspaceSourcePathsEqual(entry.path, context.workspacePath) && !entry.bare)) {
      throw new Error("The primary directory must be a registered Git checkout root.");
    }
    const checkouts: NonNullable<OpenCodexPrimaryMoveSnapshot["git"]>["checkouts"] = [];
    for (const entry of entries) {
      if (entry.lockedReason !== null || entry.prunableReason !== null) {
        throw new Error("All repository worktrees must be available and unlocked before moving the project.");
      }
      if (isInsideWorkspace(destination, entry.path) || isInsideWorkspace(entry.path, destination)) {
        throw new Error("The destination must be separate from every registered checkout.");
      }
      const observation = await this.files.inspect(context, entry.path);
      const gitDirectory = entry.bare ? commonDirectory : await this.directory(entry.path, context.sourceId, "--absolute-git-dir");
      const gitIdentity = (await this.files.inspect(context, gitDirectory)).identity;
      if (!entry.bare) {
        if (!workspaceSourcePathsEqual(await this.directory(entry.path, context.sourceId, "--show-toplevel"), entry.path)
          || !workspaceSourcePathsEqual(await this.git.repositoryPath(entry.path, context.sourceId), commonDirectory)) {
          throw new Error("Git checkout topology changed during project inspection.");
        }
        if (observation.markerKind === "directory" && !workspaceSourcePathsEqual(gitDirectory, commonDirectory)) {
          throw new Error("Unsupported checkout Git directory.");
        }
        if (workspaceSourcePathsEqual(gitDirectory, commonDirectory) && observation.markerKind !== "directory") {
          throw new Error("Separate Git directories require manual movement and relocation.");
        }
        const submodules = await this.runGit(entry.path, context.sourceId, ["submodule", "status", "--recursive"]);
        if (submodules.stdoutCapReached || submodules.stdout.trim() !== "") {
          throw new Error("Repositories containing submodules require manual movement and relocation.");
        }
      }
      checkouts.push({ path: entry.path, destinationPath: primaryMovePath(entry.path, context.workspacePath, destination),
        identity: observation.identity, markerHash: observation.markerHash, gitDirectory, gitIdentity,
        head: entry.head, branch: entry.branch, bare: entry.bare });
    }
    if (isInsideWorkspace(destination, commonDirectory) || isInsideWorkspace(commonDirectory, destination)) {
      throw new Error("The destination must be separate from the Git administrative directory.");
    }
    return { commonDirectory, checkouts };
  }

  /** Rechecks original identities and the complete registry immediately before renaming. */
  async requireOriginal(move: OpenCodexWorkspaceMove): Promise<void> {
    const snapshot = move.primarySnapshot!;
    const context = this.context(move);
    if ((await this.files.inspect(context)).identity !== snapshot.identity) throw new Error("Project directory identity changed.");
    const actual = await this.capture(context, move.destinationPath);
    if (JSON.stringify(actual) !== JSON.stringify(snapshot.git)) throw new Error("Git worktree inventory changed. Refresh before moving the project.");
  }

  /** Repairs only proven directory/admin identities; repeated recovery never repeats physical movement. */
  async repairAndVerify(move: OpenCodexWorkspaceMove): Promise<void> {
    const snapshot = move.primarySnapshot!;
    const context = this.context(move);
    if ((await this.files.inspect(context, move.destinationPath)).identity !== snapshot.identity) {
      throw new Error("Moved project directory identity could not be verified.");
    }
    if (snapshot.git === null) {
      const after = await this.files.inspect(context, move.destinationPath);
      if (after.markerKind !== "missing" || after.looksBare) throw new Error("Project Git topology changed during movement.");
      return;
    }
    const common = primaryMovePath(snapshot.git.commonDirectory, move.workspacePath, move.destinationPath);
    const registry = await this.runGit(move.destinationPath, move.sourceId,
      ["--git-dir", common, "worktree", "list", "--porcelain", "-z"]);
    if (registry.stdoutCapReached) throw new Error("Git worktree registry was truncated during recovery.");
    const before = parseGitWorktrees(registry.stdout);
    if (before.length !== snapshot.git.checkouts.length || before.some(entry => !snapshot.git!.checkouts.some(frozen =>
      (workspaceSourcePathsEqual(frozen.path, entry.path) || workspaceSourcePathsEqual(frozen.destinationPath, entry.path))
      && frozen.head === entry.head && frozen.branch === entry.branch && frozen.bare === entry.bare && entry.lockedReason === null))) {
      throw new Error("Git worktree registry changed. Recovery will not repair an unreviewed checkout.");
    }
    for (const entry of snapshot.git.checkouts) {
      const observed = await this.files.inspect(context, entry.destinationPath);
      const administrativePath = primaryMovePath(entry.gitDirectory, move.workspacePath, move.destinationPath);
      if (observed.identity !== entry.identity
        || (await this.files.inspect(context, administrativePath)).identity !== entry.gitIdentity) {
        throw new Error("A repository checkout was replaced or moved. Recovery will not overwrite its Git links.");
      }
      if (observed.markerHash !== entry.markerHash && !entry.bare) {
        if (!workspaceSourcePathsEqual(await this.directory(entry.destinationPath, move.sourceId, "--absolute-git-dir"), administrativePath)
          || !workspaceSourcePathsEqual(await this.git.repositoryPath(entry.destinationPath, move.sourceId), common)) {
          throw new Error("A checkout Git link changed unexpectedly. Repair it manually before recovery.");
        }
      }
    }
    const paths = snapshot.git.checkouts.filter(entry => !entry.bare).map(entry => entry.destinationPath);
    await this.runGit(move.destinationPath, move.sourceId, ["--git-dir", common, "worktree", "repair", "--", ...paths]);
    const actual = await this.git.list(move.destinationPath, move.sourceId);
    if (actual.length !== snapshot.git.checkouts.length) throw new Error("Git checkout inventory changed after movement.");
    for (const entry of snapshot.git.checkouts) {
      const current = actual.find(item => workspaceSourcePathsEqual(item.path, entry.destinationPath));
      if (current === undefined || current.head !== entry.head || current.branch !== entry.branch
        || current.bare !== entry.bare || current.lockedReason !== null || current.prunableReason !== null) {
        throw new Error("Git checkout state could not be verified after movement.");
      }
      if (!entry.bare && (!workspaceSourcePathsEqual(await this.git.repositoryPath(entry.destinationPath, move.sourceId), common)
        || !workspaceSourcePathsEqual(await this.directory(entry.destinationPath, move.sourceId, "--absolute-git-dir"),
          primaryMovePath(entry.gitDirectory, move.workspacePath, move.destinationPath)))) {
        throw new Error("Git links could not be verified after movement.");
      }
    }
  }

  /** Keeps source paths out of host normalization and requires complete Git output. */
  private async directory(cwd: string, sourceId: string, flag: string): Promise<string> {
    const result = await this.runGit(cwd, sourceId, ["rev-parse", flag]);
    if (result.stdoutCapReached || !result.stdout.endsWith("\n")) throw new Error("Incomplete Git directory response.");
    return normalizeWorkspaceSourcePath(result.stdout.slice(0, -1));
  }

  /** Builds plain helper context from the durable operation instead of renderer paths. */
  private context(move: OpenCodexWorkspaceMove): OpenCodexFileContext {
    return { projectId: move.projectId, workspaceId: move.workspaceId, sourceId: move.sourceId, workspacePath: move.workspacePath };
  }
}
