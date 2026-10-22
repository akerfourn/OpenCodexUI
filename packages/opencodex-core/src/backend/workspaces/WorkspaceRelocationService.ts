import type { WorkspaceCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { GitWorktreeService } from "../git/GitWorktreeService.js";
import { createRunGit, type RunGit } from "../git/gitCommandRunner.js";
import { WorkspaceActivityGate } from "./WorkspaceActivityGate.js";
import { WorkspaceRemovalRuntime } from "./WorkspaceRemovalRuntime.js";
import { normalizeWorkspaceSourcePath, workspaceSourcePathsEqual } from "./workspaceSourcePath.js";

/** Reconnects an explicitly moved directory; never moves files or repairs Git implicitly. */
export class WorkspaceRelocationService {
  /** Reads Git exclusively in the owning source. */
  private readonly git: GitWorktreeService;
  /** Reuses conservative directory and loaded-session checks. */
  private readonly runtime: WorkspaceRemovalRuntime;

  /** Shares lifecycle exclusion with tools, removal and managed process startup. */
  constructor(private readonly repository: WorkspaceCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly activity: WorkspaceActivityGate,
    private readonly requireInactive: (workspace: OpenCodexProjectWorkspace, destination: string) => Promise<void>,
    private readonly runGit: RunGit = createRunGit(clients)) {
    this.git = new GitWorktreeService(runGit);
    this.runtime = new WorkspaceRemovalRuntime(clients);
  }

  /** Publishes only validated metadata atomically; a lost reply can safely be retried. */
  async relocate(projectId: string, workspaceId: string, sourceId: string,
    destinationPath: string, confirmIdentity: boolean): Promise<OpenCodexProjectWorkspace> {
    return await this.activity.exclusive(sourceId, async () => {
      const workspace = await this.repository.get(workspaceId);
      if (workspace === null || workspace.projectId !== projectId || workspace.sourceId !== sourceId
        || workspace.removedAt !== null || workspace.removalPending === true || workspace.movePending === true) {
        throw new Error("Relocation requires an available workspace of the explicit project and source.");
      }
      const destination = normalizeWorkspaceSourcePath(destinationPath);
      if (destination.startsWith("/") !== workspace.path.startsWith("/")) {
        throw new Error("Relocation must stay in the same source filesystem.");
      }
      if (confirmIdentity !== true) throw new Error("Confirm that this is the workspace's moved directory.");
      const target = { sourceId, workspacePath: destination, projectPath: destination };
      await this.runtime.requireDirectories(target);
      // An already committed relocation remains retryable after a lost transport response.
      if (workspaceSourcePathsEqual(destination, workspace.path)) return workspace;
      const previous = { ...target, workspacePath: workspace.path };
      if (!await this.runtime.isMissing(previous)) {
        throw new Error("The previous workspace directory still exists. Relocation requires a directory already moved manually.");
      }
      await this.requireInactive(workspace, destination);
      await this.runtime.requireIdle(previous);
      await this.runtime.requireIdle(target);
      await this.verifyGit(workspace, destination, sourceId);
      await this.requireInactive(workspace, destination);
      if (!await this.runtime.isMissing(previous)) throw new Error("The previous workspace path reappeared during relocation.");
      await this.repository.relocate(workspaceId, destination, workspace.path);
      return (await this.repository.get(workspaceId))!;
    });
  }

  /** Secondaries require common-repository proof; primaries require explicit identity confirmation. */
  private async verifyGit(workspace: OpenCodexProjectWorkspace, destination: string, sourceId: string): Promise<void> {
    const client = await this.clients.ensureClient(sourceId);
    const syntaxSeparator = destination.startsWith("/") ? "/" : "\\";
    const gitMarker = `${destination.replace(/[\\/]+$/u, "")}${syntaxSeparator}.git`;
    const hasGit = !await this.runtime.isMissing({ sourceId, workspacePath: gitMarker, projectPath: destination });
    if (!hasGit) {
      if (!workspace.isPrimary) throw new Error("A secondary workspace must be a registered Git worktree root.");
      return;
    }
    const root = await this.runGit(destination, sourceId, ["rev-parse", "--show-toplevel"]);
    if (root.stdoutCapReached || !root.stdout.endsWith("\n")
      || !workspaceSourcePathsEqual(root.stdout.trimEnd(), destination)) {
      throw new Error("The selected directory must be the Git worktree root.");
    }
    const common = await this.git.repositoryPath(destination, sourceId);
    const entries = await this.git.list(destination, sourceId);
    if (!entries.some(entry => workspaceSourcePathsEqual(entry.path, destination)
      && !entry.bare && entry.prunableReason === null)) {
      throw new Error("Git does not register this worktree at its new path. Repair its Git links before relocating it.");
    }
    if (!workspace.isPrimary) {
      const primary = (await this.repository.list(workspace.projectId)).find(item => item.isPrimary);
      if (primary === undefined || primary.sourceId !== sourceId || primary.removedAt !== null
        || !workspaceSourcePathsEqual(await this.git.repositoryPath(primary.path, sourceId), common)) {
        throw new Error("The relocated workspace does not belong to the project's Git repository.");
      }
    }
    // Ensure access still works after source-side validation, without touching checkout content.
    await client.getMetadata(destination);
  }
}
