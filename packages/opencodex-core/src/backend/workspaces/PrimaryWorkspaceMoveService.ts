import path from "node:path";
import type { WorkspaceCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexWorkspaceMove, OpenCodexWorkspaceMoveInput, OpenCodexWorkspaceRoot } from "@open-codex-ui/opencodex-protocol";
import type { v2 } from "@open-codex-ui/codex-rpc";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { readObject } from "../../mapping.js";
import { PrimaryMoveFiles } from "./PrimaryMoveFiles.js";
import { PrimaryMoveGit } from "./PrimaryMoveGit.js";
import { primaryMovePath } from "./primaryMovePaths.js";
import { WorkspaceActivityGate } from "./WorkspaceActivityGate.js";
import { WorkspaceRemovalRuntime, isInsideWorkspace } from "./WorkspaceRemovalRuntime.js";
import { prepareWorkspaceStorage, resolveWorkspaceStorage } from "./WorkspaceStoragePaths.js";
import { workspaceSourcePathsEqual } from "./workspaceSourcePath.js";

/** Moves a project directory once, then repairs verified Git links and publishes all aliases atomically. */
export class PrimaryWorkspaceMoveService {
  /** Live directory, session and terminal checks always run through the owning source. */
  private readonly runtime: WorkspaceRemovalRuntime;

  /** Shares the secondary move journal and source gate, while keeping filesystem operations injectable. */
  constructor(private readonly repository: WorkspaceCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">, private readonly activity: WorkspaceActivityGate,
    private readonly requireInactive: (move: OpenCodexWorkspaceMove) => Promise<void>,
    private readonly roots: () => OpenCodexWorkspaceRoot[],
    private readonly files: PrimaryMoveFiles, private readonly git: PrimaryMoveGit) {
    this.runtime = new WorkspaceRemovalRuntime(clients);
  }

  /** Requires a reviewed principal path and an explicit custom destination or optional storage shortcut. */
  async move(request: OpenCodexWorkspaceMoveInput): Promise<void> {
    const input = structuredClone(request);
    await this.activity.exclusive(input.sourceId, async () => {
      const primary = await this.repository.get(input.workspaceId);
      if (primary === null || !primary.isPrimary || primary.projectId !== input.projectId
        || primary.sourceId !== input.sourceId || primary.path !== input.expectedPath || primary.removedAt !== null
        || primary.movePending === true || primary.removalPending === true) {
        throw new Error("Primary workspace context changed or has pending maintenance. Refresh before moving the project.");
      }
      if (input.rootId === undefined && input.destinationPath === undefined) throw new Error("Choose an explicit destination for the project directory.");
      const target = resolveWorkspaceStorage(input, primary.id, this.roots());
      if (primary.path.startsWith("/") !== target.destinationPath.startsWith("/")
        || isInsideWorkspace(target.destinationPath, primary.path) || isInsideWorkspace(primary.path, target.destinationPath)) {
        throw new Error("Project movement requires separate directories in the same source filesystem.");
      }
      const context = { projectId: primary.projectId, workspaceId: primary.id, sourceId: input.sourceId, workspacePath: primary.path };
      const client = await this.clients.ensureClient(input.sourceId);
      const config = await client.request<v2.ConfigReadResponse>("config/read", { cwd: primary.path });
      if (readObject(readObject(config.config.projects)[primary.path]).trust_level !== "trusted") {
        throw new Error("Trust the project in its Codex source before moving its directory.");
      }
      const observation = await this.files.inspect(context);
      const git = await this.git.capture(context, target.destinationPath);
      const catalogue = (await this.repository.list(primary.projectId)).filter(item => item.removedAt === null);
      if (catalogue.some(item => item.sourceId !== primary.sourceId || item.movePending || item.removalPending)) {
        throw new Error("Resolve project workspace maintenance before moving the primary.");
      }
      if (catalogue.some(item => !item.isPrimary && !git?.checkouts.some(entry => workspaceSourcePathsEqual(entry.path, item.path)))) {
        throw new Error("Every project workspace must belong to the verified Git worktree inventory.");
      }
      const intent = await this.repository.moves.begin({ ...context, primaryWorkspaceId: primary.id, projectPath: primary.path,
        ...target, repositoryPath: git?.commonDirectory ?? primary.path,
        gitDirectory: git?.commonDirectory ?? primary.path, expectedHead: "", expectedBranch: null,
        primarySnapshot: { identity: observation.identity, git, members: catalogue.map(item => ({ workspaceId: item.id,
          path: item.path, destinationPath: primaryMovePath(item.path, primary.path, target.destinationPath) })) } });
      try {
        await prepareWorkspaceStorage(client, intent);
        await this.requireDestination(intent);
        await this.requireIdle(intent, false);
        await this.git.requireOriginal(intent);
        await this.requireDestination(intent);
        await this.repository.moves.submitting(intent.id);
        const result = await this.files.rename(intent);
        await this.repository.moves.confirmGit(intent.id, result.ok ? 0 : 1);
        if (!result.ok) {
          await this.recover(await this.requireMove(intent.id));
          throw new Error(result.details ?? "Project directory movement failed.");
        }
        await this.finish(intent);
      } catch (error) {
        await this.repository.moves.fail(intent.id);
        throw error;
      }
    });
  }

  /** Recovery can repeat verified Git-link repair, but never rename or copy the directory again. */
  async reconcile(id: string): Promise<void> {
    const move = await this.requireMove(id);
    await this.activity.exclusive(move.sourceId, async () => {
      const current = await this.requireMove(id);
      if (current.state === "preparing") { await this.repository.moves.cancel(id); return; }
      await this.recover(current);
    });
  }

  /** Distinguishes completion, a positively failed helper and ambiguous transport outcomes. */
  private async recover(move: OpenCodexWorkspaceMove): Promise<void> {
    const oldMissing = await this.missing(move, move.workspacePath);
    const newMissing = await this.missing(move, move.destinationPath);
    if (oldMissing && !newMissing) { await this.finish(move); return; }
    if (!oldMissing && newMissing && move.gitExitCode !== null && move.gitExitCode !== 0) {
      await this.git.requireOriginal(move);
      await this.repository.moves.cancel(move.id);
      return;
    }
    throw new Error("Project move outcome is uncertain. Paths remain reserved; physical movement has not been repeated.");
  }

  /** Publishes only after proving old-path absence, directory identity and every Git checkout link. */
  private async finish(move: OpenCodexWorkspaceMove): Promise<void> {
    if (!await this.missing(move, move.workspacePath)) throw new Error("The previous project path exists again. Recovery requires manual review.");
    await this.requireIdle(move, true);
    await this.git.repairAndVerify(move);
    if (!await this.missing(move, move.workspacePath)) throw new Error("The previous project path reappeared during recovery.");
    await this.repository.moves.commit(move.id);
  }

  /** Checks commands, debugger, Compose and Codex sessions across known and external repository checkouts. */
  private async requireIdle(move: OpenCodexWorkspaceMove, moved: boolean): Promise<void> {
    const locations = new Set<string>();
    const snapshot = move.primarySnapshot!;
    for (const member of snapshot.members) locations.add(moved ? member.destinationPath : member.path);
    for (const entry of snapshot.git?.checkouts ?? []) if (!entry.bare) locations.add(moved ? entry.destinationPath : entry.path);
    for (const location of locations) {
      const context = { ...move, workspacePath: location, destinationPath: location };
      await this.requireInactive(context);
      await this.runtime.requireIdle(context);
    }
    if (moved) {
      for (const member of snapshot.members) {
        if (member.path !== member.destinationPath) await this.runtime.requireIdle({ ...move, workspacePath: member.path });
      }
    }
  }

  /** Requires an existing literal parent and a truly absent leaf, including broken links. */
  private async requireDestination(move: OpenCodexWorkspaceMove): Promise<void> {
    const syntax = move.destinationPath.startsWith("/") ? path.posix : path.win32;
    await this.runtime.requireDirectories({ ...move, workspacePath: syntax.dirname(move.destinationPath) });
    if (!await this.missing(move, move.destinationPath)) throw new Error("Move destination already exists.");
  }

  /** Never treats access failures as absence. */
  private async missing(move: OpenCodexWorkspaceMove, location: string): Promise<boolean> {
    return await this.runtime.isMissing({ ...move, workspacePath: location });
  }

  /** Accepts only persisted principal recovery evidence. */
  private async requireMove(id: string): Promise<OpenCodexWorkspaceMove> {
    const move = await this.repository.moves.get(id);
    if (move?.primarySnapshot === undefined) throw new Error("Primary workspace move does not exist.");
    return move;
  }
}
