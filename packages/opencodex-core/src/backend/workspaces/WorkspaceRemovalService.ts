import type { WorkspaceCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexWorkspaceRemoval, OpenCodexWorkspaceRemovalInspection } from "@open-codex-ui/opencodex-protocol";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { createGitErrorMessage, createRunGit } from "../git/gitCommandRunner.js";
import { WorkspaceActivityGate } from "./WorkspaceActivityGate.js";
import { WorkspaceRemovalGit, type WorkspaceRemovalTarget } from "./WorkspaceRemovalGit.js";
import { WorkspaceRemovalRuntime } from "./WorkspaceRemovalRuntime.js";
import { WorkspaceSourceBusyError } from "./WorkspaceSourceBusyError.js";

/** Coordinates guarded physical deletion with explicit file-loss consent and retained history. */
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
    runtime = new WorkspaceRemovalRuntime(clients),
    private readonly changed: (projectId: string, sourceId: string) => void = () => {}) {
    this.git = git;
    this.runtime = runtime;
  }

  /** Lists unfinished work without requiring a running source. */
  async pending(projectId: string): Promise<OpenCodexWorkspaceRemoval[]> {
    return await this.repository.removals.list(projectId);
  }

  /** Removes a verified managed secondary with explicit consent for file loss; history is retained. */
  async remove(projectId: string, workspaceId: string, sourceId: string, force = false, expectedPath?: string): Promise<void> {
    await this.activity.exclusive(sourceId, async () => {
      const removal = await this.begin(projectId, workspaceId, sourceId, false, force, expectedPath);
      try {
        await this.execute(removal);
      } catch (error) {
        await this.repository.removals.fail(removal.id);
        throw error;
      } finally {
        this.changed(projectId, sourceId);
      }
    });
  }

  /** Persists explicitly authorized future deletion without requiring agents elsewhere to stop. */
  async schedule(projectId: string, workspaceId: string, sourceId: string, force = false, expectedPath?: string): Promise<void> {
    await this.activity.run(sourceId, async () => { await this.begin(projectId, workspaceId, sourceId, true, force, expectedPath); });
    this.changed(projectId, sourceId);
  }

  /** Reports file hazards before confirmation without waiting for or unloading active conversations. */
  async inspect(projectId: string, workspaceId: string, sourceId: string): Promise<OpenCodexWorkspaceRemovalInspection> {
    return await this.activity.run(sourceId, async () => {
      const target = await this.context(projectId, workspaceId, sourceId);
      await this.runtime.requireDirectories(target);
      return await this.git.inspectFiles(target);
    });
  }

  /** Reads durable waiting requests without starting offline or manually stopped sources. */
  async queued(): Promise<OpenCodexWorkspaceRemoval[]> {
    return await this.repository.removals.queued();
  }

  /** Changes undispatched intent; source access is required only when adding file-loss consent. */
  async updateDeferred(id: string, projectId: string, sourceId: string, action: "cancel" | "retry", force = false): Promise<void> {
    if (action === "retry" && force) {
      const removal = await this.requireRemoval(id);
      if (removal.projectId !== projectId || removal.sourceId !== sourceId) throw new Error("Removal ownership changed.");
      await this.requireIdentity(removal);
      await this.inspect(projectId, removal.workspaceId, sourceId);
    }
    await this.repository.removals.updateDeferred(id, projectId, sourceId, action, force);
    this.changed(projectId, sourceId);
  }

  /** Attempts a waiting deletion once; only positively observed activity returns it to the queue. */
  async processQueued(id: string): Promise<void> {
    const removal = await this.repository.removals.get(id);
    if (removal?.deferredState !== "queued") return;
    try {
      await this.activity.exclusive(removal.sourceId, async () => {
        const current = await this.repository.removals.get(id);
        if (current?.deferredState !== "queued") return;
        if (!await this.repository.removals.claim(id)) return;
        this.changed(removal.projectId, removal.sourceId);
        try {
          await this.execute(current);
        } catch (error) {
          const failed = await this.repository.removals.get(id);
          if (failed?.state === "preparing") {
            const reason = error instanceof WorkspaceSourceBusyError ? null : errorMessage(error);
            await this.repository.removals.defer(id, reason);
          } else await this.repository.removals.fail(id);
        } finally {
          this.changed(removal.projectId, removal.sourceId);
        }
      });
    } catch (error) {
      if (!(error instanceof WorkspaceSourceBusyError)) throw error;
    }
  }

  /** Freezes managed checkout ownership and repository identity before any future dispatch. */
  private async begin(projectId: string, workspaceId: string, sourceId: string,
    deferred: boolean, force: boolean, expectedPath?: string): Promise<OpenCodexWorkspaceRemoval> {
    const target = await this.context(projectId, workspaceId, sourceId);
    if (expectedPath !== undefined && target.workspacePath !== expectedPath) {
      throw new Error("Workspace location changed. Review its current path before deleting it.");
    }
    if (deferred) {
      await this.runtime.requireDirectories(target);
      await this.git.requireClean({ ...target, force });
    }
    return await this.repository.removals.begin(projectId, workspaceId, sourceId,
      target.primaryWorkspaceId, target.repositoryPath, deferred, force);
  }

  /** Resolves trusted source-native checkout paths without reserving them or accepting renderer paths. */
  private async context(projectId: string, workspaceId: string, sourceId: string): Promise<WorkspaceRemovalTarget> {
    const workspace = await this.repository.get(workspaceId);
    if (workspace === null || workspace.projectId !== projectId || workspace.sourceId !== sourceId
      || workspace.isPrimary || !workspace.managed || workspace.removedAt !== null) {
      throw new Error("Only an available managed secondary workspace of this project can be removed.");
    }
    const primary = (await this.repository.list(projectId)).find(item => item.isPrimary && item.removedAt === null);
    if (primary === undefined || primary.sourceId !== sourceId) throw new Error("Primary workspace is unavailable.");
    const repositoryPath = await this.git.repositoryPath(primary.path, sourceId);
    return { projectId, workspaceId, sourceId, primaryWorkspaceId: primary.id,
      projectPath: primary.path, workspacePath: workspace.path, repositoryPath };
  }

  /** Shares every safety check and the single destructive dispatch between immediate and deferred requests. */
  private async execute(removal: OpenCodexWorkspaceRemoval): Promise<void> {
    await this.requireIdentity(removal);
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
      if (removal.deferredState === undefined) await this.recover(await this.requireRemoval(removal.id));
      throw new Error(createGitErrorMessage(result));
    }
    await this.finish(removal);
  }

  /** Revalidates frozen ownership rather than letting queued authorization follow a changed catalogue. */
  private async requireIdentity(removal: OpenCodexWorkspaceRemoval): Promise<void> {
    const workspace = await this.repository.get(removal.workspaceId);
    const primary = await this.repository.get(removal.primaryWorkspaceId);
    if (workspace === null || primary === null || workspace.projectId !== removal.projectId
      || workspace.sourceId !== removal.sourceId || workspace.path !== removal.workspacePath
      || workspace.isPrimary || !workspace.managed || workspace.removedAt !== null
      || primary.projectId !== removal.projectId || primary.sourceId !== removal.sourceId
      || primary.path !== removal.projectPath || !primary.isPrimary || primary.removedAt !== null) {
      throw new Error("Workspace removal identity changed; cancel the request and review the current workspace.");
    }
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
    this.changed(removal.projectId, removal.sourceId);
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

/** Stores a readable safety failure without treating unknown errors as transient source activity. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
