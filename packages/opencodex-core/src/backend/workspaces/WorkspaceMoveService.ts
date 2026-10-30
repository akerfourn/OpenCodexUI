import path from "node:path";
import type { WorkspaceCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceMove, OpenCodexWorkspaceMoveInput, OpenCodexWorkspaceRoot } from
  "@open-codex-ui/opencodex-protocol";
import type { v2 } from "@open-codex-ui/codex-rpc";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { readObject } from "../../mapping.js";
import { createGitErrorMessage, createRunGit } from "../git/gitCommandRunner.js";
import { WorkspaceMoveGit } from "./WorkspaceMoveGit.js";
import { WorkspaceActivityGate } from "./WorkspaceActivityGate.js";
import { WorkspaceRemovalRuntime } from "./WorkspaceRemovalRuntime.js";
import { resolveWorkspaceStorage, prepareWorkspaceStorage } from "./WorkspaceStoragePaths.js";
import { workspaceSourcePathsEqual } from "./workspaceSourcePath.js";
import type { PrimaryWorkspaceMoveService } from "./PrimaryWorkspaceMoveService.js";

/** Moves registered secondary worktrees and publishes only source-verified destinations. */
export class WorkspaceMoveService {
  /** Read-only source inventory and literal-directory validation. */
  private readonly runtime: WorkspaceRemovalRuntime;
  /** Shares lifecycle exclusion and managed process checks with other source operations. */
  constructor(private readonly repository: WorkspaceCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly activity: WorkspaceActivityGate,
    private readonly requireInactive: (move: OpenCodexWorkspaceMove) => Promise<void>,
    private readonly roots: () => OpenCodexWorkspaceRoot[],
    private readonly git = new WorkspaceMoveGit(createRunGit(clients)),
    private readonly primary?: PrimaryWorkspaceMoveService) {
    this.runtime = new WorkspaceRemovalRuntime(clients);
  }

  /** Lists frozen operations even while their source is offline. */
  async pending(projectId: string): Promise<OpenCodexWorkspaceMove[]> { return await this.repository.moves.list(projectId); }

  /** Resolves configured storage first, dispatches once and atomically reconnects existing history. */
  async move(request: OpenCodexWorkspaceMoveInput): Promise<void> {
    const input = structuredClone(request);
    if (this.primary !== undefined && (await this.repository.get(input.workspaceId))?.isPrimary === true) {
      await this.primary.move(input);
      return;
    }
    await this.activity.exclusive(input.sourceId, async () => {
      const workspace = await this.requireWorkspace(input);
      const primary = (await this.repository.list(input.projectId)).find(item => item.isPrimary && item.removedAt === null);
      if (primary === undefined || primary.sourceId !== input.sourceId) throw new Error("Primary workspace is unavailable.");
      const target = resolveWorkspaceStorage(input, workspace.id, this.roots());
      if (workspace.path.startsWith("/") !== target.destinationPath.startsWith("/")) throw new Error("Move must stay in the same source filesystem.");
      if (workspaceSourcePathsEqual(workspace.path, target.destinationPath)) throw new Error("Choose another storage location for this workspace.");
      const fingerprint = await this.git.capture(primary.path, workspace.path, target.destinationPath, input.sourceId);
      const intent = await this.repository.moves.begin({ workspaceId: workspace.id, projectId: input.projectId,
        sourceId: input.sourceId, primaryWorkspaceId: primary.id, projectPath: primary.path, workspacePath: workspace.path,
        ...target, ...fingerprint });
      try {
        await this.prepare(intent);
        await this.requireInactive(intent);
        await this.runtime.requireIdle(intent);
        if (!await this.git.matches(intent, intent.workspacePath, intent.destinationPath)) throw new Error("Worktree identity changed before movement.");
        await this.requireInactive(intent);
        await this.runtime.requireIdle(intent);
        if (!await this.missing(intent, intent.destinationPath)) throw new Error("Move destination must not already exist.");
        await this.repository.moves.submitting(intent.id);
        const result = await this.git.move(intent);
        await this.repository.moves.confirmGit(intent.id, result.exitCode);
        if (result.exitCode !== 0) {
          await this.recover(await this.requireMove(intent.id));
          throw new Error(createGitErrorMessage(result));
        }
        await this.finish(intent);
      } catch (error) {
        await this.repository.moves.fail(intent.id);
        throw error;
      }
    });
  }

  /** Recovery inspects frozen source facts; it never repeats movement or rolls back files. */
  async reconcile(id: string): Promise<void> {
    const intent = await this.requireMove(id);
    if (intent.primarySnapshot !== undefined) {
      if (this.primary === undefined) throw new Error("Primary move recovery is unavailable.");
      await this.primary.reconcile(id);
      return;
    }
    await this.activity.exclusive(intent.sourceId, async () => {
      const current = await this.requireMove(id);
      if (current.state === "preparing") { await this.repository.moves.cancel(id); return; }
      await this.recover(current);
    });
  }

  /** Requires an available secondary belonging to the explicit project and source. */
  private async requireWorkspace(input: OpenCodexWorkspaceMoveInput): Promise<OpenCodexProjectWorkspace> {
    const workspace = await this.repository.get(input.workspaceId);
    if (workspace === null || workspace.projectId !== input.projectId || workspace.sourceId !== input.sourceId
      || workspace.isPrimary || workspace.removedAt !== null
      || workspace.removalPending === true || workspace.movePending === true) {
      throw new Error("Only an available secondary workspace of this project can be moved.");
    }
    return workspace;
  }

  /** Validates trust, literal ancestors and destination absence; creates only a configured root's project folder. */
  private async prepare(intent: OpenCodexWorkspaceMove): Promise<void> {
    await this.runtime.requireDirectories(intent);
    const client = await this.clients.ensureClient(intent.sourceId);
    const config = await client.request<v2.ConfigReadResponse>("config/read", { cwd: intent.projectPath });
    if (readObject(readObject(config.config.projects)[intent.projectPath]).trust_level !== "trusted") {
      throw new Error("Trust the project in its Codex source before moving a worktree.");
    }
    if (!await this.missing(intent, intent.destinationPath)) throw new Error("Move destination must not already exist.");
    await prepareWorkspaceStorage(client, intent);
    const syntax = intent.destinationPath.startsWith("/") ? path.posix : path.win32;
    await this.runtime.requireDirectories({ ...intent, workspacePath: syntax.dirname(intent.destinationPath) });
  }

  /** Publishes proven completion, or cancels positive failure only when the original checkout remains intact. */
  private async recover(intent: OpenCodexWorkspaceMove): Promise<void> {
    if (await this.missing(intent, intent.workspacePath) && !await this.missing(intent, intent.destinationPath)) {
      await this.finish(intent);
      return;
    }
    if (intent.gitExitCode !== null && intent.gitExitCode !== 0
      && !await this.missing(intent, intent.workspacePath) && await this.missing(intent, intent.destinationPath)
      && await this.git.matches(intent, intent.workspacePath, intent.destinationPath)) {
      await this.repository.moves.cancel(intent.id);
      return;
    }
    throw new Error("Move outcome is uncertain. Both paths remain reserved; Git movement has not been repeated.");
  }

  /** Requires old-path absence and the same exact Git administrative identity at the destination. */
  private async finish(intent: OpenCodexWorkspaceMove): Promise<void> {
    await this.runtime.requireDirectories({ ...intent, workspacePath: intent.destinationPath });
    if (!await this.missing(intent, intent.workspacePath)
      || !await this.git.matches(intent, intent.destinationPath, intent.workspacePath)) {
      throw new Error("Moved checkout identity could not be verified. Use move recovery.");
    }
    await this.repository.moves.commit(intent.id);
  }

  /** Distinguishes proven absence from source access failures. */
  private async missing(intent: OpenCodexWorkspaceMove, location: string): Promise<boolean> {
    return await this.runtime.isMissing({ ...intent, workspacePath: location });
  }

  /** Requires persisted intent during recovery; renderer paths cannot redirect an interrupted move. */
  private async requireMove(id: string): Promise<OpenCodexWorkspaceMove> {
    const intent = await this.repository.moves.get(id);
    if (intent === null) throw new Error("Workspace move does not exist.");
    return intent;
  }
}
