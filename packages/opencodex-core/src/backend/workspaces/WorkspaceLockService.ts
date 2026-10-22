import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceLockInput, OpenCodexWorkspaceLockState } from
  "@open-codex-ui/opencodex-protocol";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { GitWorktreeService } from "../git/GitWorktreeService.js";
import { createRunGit, type RunGit } from "../git/gitCommandRunner.js";
import { WorkspaceActivityGate } from "./WorkspaceActivityGate.js";
import { WorkspaceRemovalRuntime } from "./WorkspaceRemovalRuntime.js";
import { workspaceSourcePathsEqual } from "./workspaceSourcePath.js";

/** Reads and changes native Git locks without restricting file edits or conversation execution. */
export class WorkspaceLockService {
  /** Reads complete Git registration through the owning source. */
  private readonly git: GitWorktreeService;
  /** Validates the primary's literal source directories before writing Git metadata. */
  private readonly runtime: WorkspaceRemovalRuntime;

  /** Shares source exclusion with movement and removal; lock state remains owned by Git. */
  constructor(private readonly repository: OpenCodexCacheRepository,
    clients: Pick<ClientPort, "ensureClient">,
    private readonly activity: WorkspaceActivityGate,
    private readonly runGit: RunGit = createRunGit(clients)) {
    this.git = new GitWorktreeService(runGit);
    this.runtime = new WorkspaceRemovalRuntime(clients);
  }

  /** Reads fresh state only when requested; offline catalogues remain usable independently. */
  async read(projectId: string, workspaceId: string, sourceId: string): Promise<OpenCodexWorkspaceLockState> {
    const workspace = await this.requireWorkspace(projectId, workspaceId, sourceId);
    if (workspace.isPrimary) return { workspaceId, sourceId, workspacePath: workspace.path, supported: false, lockedReason: null };
    return (await this.inspect(workspace, sourceId)).state;
  }

  /** Changes the reviewed state once and verifies Git's response; lost replies require a fresh read. */
  async update(request: OpenCodexWorkspaceLockInput): Promise<OpenCodexWorkspaceLockState> {
    const input = structuredClone(request);
    const rawReason = input.reason ?? "";
    if (typeof input.locked !== "boolean" || (input.expectedReason !== null && typeof input.expectedReason !== "string")
      || typeof rawReason !== "string" || rawReason.length > 500 || /[\0\r\n]/u.test(rawReason)) throw new Error("A lock reason must be a single line of at most 500 characters.");
    const reason = rawReason.trim();
    return await this.activity.exclusive(input.sourceId, async () => {
      const workspace = await this.requireWorkspace(input.projectId, input.workspaceId, input.sourceId);
      if (workspace.isPrimary) throw new Error("The principal workspace cannot be locked or unlocked.");
      if (workspace.path !== input.workspacePath) throw new Error("Workspace path changed. Close this dialog and refresh its lock state.");
      const before = await this.inspect(workspace, input.sourceId);
      if (!before.state.supported) throw new Error("Git's main checkout cannot be locked or unlocked.");
      await this.requireUnreserved(input.sourceId, before.repositoryPath, input.projectId);
      await this.runtime.requireDirectories({ sourceId: input.sourceId, projectPath: before.projectPath, workspacePath: before.projectPath });
      const current = await this.inspect(workspace, input.sourceId);
      if (!workspaceSourcePathsEqual(current.repositoryPath, before.repositoryPath)
        || current.state.lockedReason !== input.expectedReason) {
        throw new Error("Git lock changed. Close this dialog and review the refreshed state before retrying.");
      }
      if ((current.state.lockedReason !== null) === input.locked) return current.state;
      await this.git.setLocked(before.projectPath, input.sourceId, workspace.path, input.locked, reason);
      const after = await this.inspect(workspace, input.sourceId);
      const expected = input.locked ? reason : null;
      if (!workspaceSourcePathsEqual(after.repositoryPath, before.repositoryPath) || after.state.lockedReason !== expected) {
        throw new Error("Git lock result could not be verified. Refresh its state before retrying.");
      }
      return after.state;
    });
  }

  /** Rejects stale, orphan, removed or physically reserved identities before source access. */
  private async requireWorkspace(projectId: string, workspaceId: string, sourceId: string): Promise<OpenCodexProjectWorkspace> {
    const workspace = await this.repository.workspaces.get(workspaceId);
    if (workspace === null || workspace.projectId !== projectId || workspace.sourceId !== sourceId
      || workspace.removedAt !== null || workspace.movePending === true || workspace.removalPending === true) {
      throw new Error("Lock operations require an available workspace of the explicit project and source.");
    }
    return workspace;
  }

  /** Reads registry evidence even for a missing linked worktree protected from pruning. */
  private async inspect(workspace: OpenCodexProjectWorkspace, sourceId: string): Promise<{
    state: OpenCodexWorkspaceLockState; repositoryPath: string; projectPath: string;
  }> {
    const primary = (await this.repository.workspaces.list(workspace.projectId)).find(item => item.isPrimary && item.removedAt === null);
    if (primary === undefined || primary.sourceId !== sourceId || primary.movePending === true || primary.removalPending === true) {
      throw new Error("The primary workspace is unavailable for reading Git locks.");
    }
    const repositoryPath = await this.git.repositoryPath(primary.path, sourceId);
    const entries = await this.git.list(primary.path, sourceId);
    if (!entries.some(entry => workspaceSourcePathsEqual(entry.path, primary.path) && !entry.bare)) {
      throw new Error("Primary checkout is not registered by Git.");
    }
    const index = entries.findIndex(entry => workspaceSourcePathsEqual(entry.path, workspace.path));
    const entry = entries[index];
    if (entry === undefined || entry.bare) throw new Error("Workspace is not registered in the project's Git repository.");
    // Git lists its main checkout first; it has no linked-worktree lock metadata.
    const supported = index > 0;
    return { state: { workspaceId: workspace.id, sourceId, workspacePath: workspace.path, supported, lockedReason: entry.lockedReason },
      repositoryPath, projectPath: primary.path };
  }

  /** Protects interrupted repository lifecycle operations, including other cached projects sharing Git. */
  private async requireUnreserved(sourceId: string, repositoryPath: string, projectId: string): Promise<void> {
    for (const project of await this.repository.listProjects()) {
      if (project.sourceId !== sourceId) continue;
      const [creations, removals, moves] = await Promise.all([
        this.repository.workspaces.creations.list(project.id), this.repository.workspaces.removals.list(project.id),
        this.repository.workspaces.moves.list(project.id)
      ]);
      if ([...creations, ...removals, ...moves].some(operation => operation.projectId === projectId
        || workspaceSourcePathsEqual(operation.repositoryPath, repositoryPath))) {
        throw new Error("Reconcile pending workspace lifecycle operations before changing Git locks.");
      }
    }
  }
}
