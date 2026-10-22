import type { WorkspaceCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { createGitErrorMessage, createRunGit } from "../git/gitCommandRunner.js";
import { WorkspaceActivityGate } from "./WorkspaceActivityGate.js";
import { WorkspaceRemovalGit } from "./WorkspaceRemovalGit.js";
import { WorkspaceRemovalRuntime } from "./WorkspaceRemovalRuntime.js";

/** Coordinates clean-only physical deletion with durable reservations and retained history. */
export class WorkspaceRemovalService {
  /** Only source-native Git operations can remove checkout files. */
  private readonly git: WorkspaceRemovalGit;
  /** Runtime validation uses the same source as the frozen journal. */
  private readonly runtime: WorkspaceRemovalRuntime;

  /** Shares the request gate with tools; activity checks include long-lived managed processes. */
  constructor(private readonly repository: WorkspaceCacheRepository,
    clients: Pick<ClientPort, "ensureClient">,
    private readonly activity: WorkspaceActivityGate,
    private readonly requireInactive: (removal: OpenCodexWorkspaceRemoval) => Promise<void>,
    git = new WorkspaceRemovalGit(createRunGit(clients)),
    runtime = new WorkspaceRemovalRuntime(clients)) {
    this.git = git;
    this.runtime = runtime;
  }

  /** Lists unfinished work without requiring a running source. */
  async pending(projectId: string): Promise<OpenCodexWorkspaceRemoval[]> {
    return await this.repository.removals.list(projectId);
  }

  /** Removes only a verified, clean managed secondary; branches and conversations are retained. */
  async remove(projectId: string, workspaceId: string, sourceId: string): Promise<void> {
    await this.activity.exclusive(sourceId, async () => {
      const workspace = await this.repository.get(workspaceId);
      if (workspace === null || workspace.projectId !== projectId || workspace.sourceId !== sourceId
        || workspace.isPrimary || !workspace.managed || workspace.removedAt !== null) {
        throw new Error("Only an available managed secondary workspace of this project can be removed.");
      }
      const primary = (await this.repository.list(projectId)).find(item => item.isPrimary && item.removedAt === null);
      if (primary === undefined || primary.sourceId !== sourceId) throw new Error("Primary workspace is unavailable.");
      const repositoryPath = await this.git.repositoryPath(primary.path, sourceId);
      const removal = await this.repository.removals.begin(projectId, workspaceId, sourceId, primary.id, repositoryPath);
      try {
        await this.runtime.requireDirectories(removal);
        await this.requireInactive(removal);
        await this.runtime.requireIdle(removal);
        await this.git.requireClean(removal);
        // Recheck processes immediately before dispatch, after potentially expensive Git validation.
        await this.requireInactive(removal);
        await this.runtime.requireIdle(removal);
        await this.repository.removals.submitting(removal.id);
        const result = await this.git.remove(removal);
        await this.repository.removals.confirmGit(removal.id, result.exitCode);
        if (result.exitCode !== 0) {
          await this.recover(await this.requireRemoval(removal.id));
          throw new Error(createGitErrorMessage(result));
        }
        await this.finish(removal);
      } catch (error) {
        await this.repository.removals.fail(removal.id);
        throw error;
      }
    });
  }

  /** Verifies frozen source facts; never replays Git removal after a lost reply or restart. */
  async reconcile(id: string): Promise<void> {
    const removal = await this.requireRemoval(id);
    await this.activity.exclusive(removal.sourceId, async () => {
      const current = await this.requireRemoval(id);
      if (current.state === "preparing") {
        await this.repository.removals.cancel(id);
        return;
      }
      // Recovery is read-only: a successfully removed checkout can no longer be inspected for Compose files.
      await this.recover(current);
    });
  }

  /** Cancels positively failed Git work, or publishes verified absence after a lost reply. */
  private async recover(removal: OpenCodexWorkspaceRemoval): Promise<void> {
    const entry = await this.git.inspect(removal);
    const missing = await this.runtime.isMissing(removal);
    if (entry === null && missing) {
      await this.repository.removals.commit(removal.id);
      return;
    }
    if (entry !== null && !missing && removal.gitExitCode !== null && removal.gitExitCode !== 0) {
      await this.runtime.requireDirectories(removal);
      await this.repository.removals.cancel(removal.id);
      return;
    }
    throw new Error("Removal outcome is uncertain. The workspace remains reserved; Git removal has not been repeated.");
  }

  /** Requires both Git deregistration and filesystem absence before retaining a removed identity. */
  private async finish(removal: OpenCodexWorkspaceRemoval): Promise<void> {
    if (await this.git.inspect(removal) !== null || !await this.runtime.isMissing(removal)) {
      throw new Error("Git removal completed but checkout absence could not be verified. Use removal recovery.");
    }
    await this.repository.removals.commit(removal.id);
  }

  /** Requires the stored operation rather than accepting renderer paths during recovery. */
  private async requireRemoval(id: string): Promise<OpenCodexWorkspaceRemoval> {
    const removal = await this.repository.removals.get(id);
    if (removal === null) throw new Error("Workspace removal does not exist.");
    return removal;
  }
}
