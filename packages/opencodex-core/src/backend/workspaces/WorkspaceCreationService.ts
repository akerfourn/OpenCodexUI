import { randomUUID } from "node:crypto";
import { prepareWorkspaceStorage, resolveWorkspaceStorage } from "./WorkspaceStoragePaths.js";
import { normalizeWorkspaceSourcePath as normalizeCreationPath } from "./workspaceSourcePath.js";
import path from "node:path";
import type { WorkspaceCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceCreateInput, OpenCodexWorkspaceCreation, OpenCodexWorkspaceRoot } from
  "@open-codex-ui/opencodex-protocol";
import type { v2 } from "@open-codex-ui/codex-rpc";
import { readObject } from "../../mapping.js";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { GitWorktreeService } from "../git/GitWorktreeService.js";
import { createRunGit } from "../git/gitCommandRunner.js";
import type { GitWorktree } from "../git/gitWorktreeParsers.js";

/** Durable creation and recovery; destinations are invisible to execution until publication. */
export class WorkspaceCreationService {
  /** Prevents recovery from cancelling preparation that this instance is still using. */
  private readonly busy = new Set<string>();
  /** Shares the existing source-aware Git transport. */
  private readonly git: Pick<GitWorktreeService, "create" | "list" | "repositoryPath">;

  /** Allows deterministic source adapters in tests without replacing persistence. */
  constructor(
    private readonly repository: WorkspaceCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">,
    git: Pick<GitWorktreeService, "create" | "list" | "repositoryPath"> = new GitWorktreeService(createRunGit(clients)),
    private readonly roots: () => OpenCodexWorkspaceRoot[] = () => [],
    private readonly createWorkspaceId: () => string = randomUUID
  ) {
    this.git = git;
  }

  /** Exposes unresolved creation intents without requiring source connectivity. */
  async pending(projectId: string): Promise<OpenCodexWorkspaceCreation[]> {
    return await this.repository.creations.list(projectId);
  }

  /** Reserves a trusted repository, creates its checkout, then publishes verified metadata. */
  async create(request: OpenCodexWorkspaceCreateInput): Promise<OpenCodexProjectWorkspace> {
    const input = structuredClone(request);
    const workspaceId = this.createWorkspaceId();
    const { destinationPath, rootPath } = resolveWorkspaceStorage(input, workspaceId, this.roots());
    const primary = (await this.repository.list(input.projectId))
      .find((workspace) => workspace.isPrimary && workspace.removedAt === null);
    if (primary === undefined || primary.sourceId === null || primary.sourceId !== input.sourceId) {
      throw new Error("Workspace creation requires the project's owning source.");
    }
    const repositoryPath = await this.git.repositoryPath(primary.path, input.sourceId);
    const creation = await this.repository.creations.begin({
      primaryWorkspaceId: primary.id, sourceId: input.sourceId, projectPath: primary.path,
      repositoryPath, destinationPath, workspaceId, rootPath, start: input.start, name: input.name
    });
    this.busy.add(creation.id);
    try {
      await this.requireDestination(creation);
      const entries = await this.git.create(primary.path, input.sourceId, destinationPath, input.start, {
        beforeDispatch: (head, branch) => this.repository.creations.submitting(creation.id, head, branch),
        afterSuccess: () => this.repository.creations.confirmGit(creation.id)
      });
      return await this.publish(await this.requireCreation(creation.id), entries);
    } catch (error) {
      await this.repository.creations.fail(creation.id);
      throw error;
    } finally {
      this.busy.delete(creation.id);
    }
  }

  /** Recovers only confirmed Git completion; a listed but unfinished checkout is insufficient. */
  async reconcile(id: string): Promise<OpenCodexProjectWorkspace | null> {
    if (this.busy.has(id)) {
      throw new Error("Workspace creation is still running locally.");
    }
    this.busy.add(id);
    try {
      const creation = await this.requireCreation(id);
      if (creation.state === "preparing") {
        await this.repository.creations.fail(id);
        return null;
      }
      if (!creation.gitConfirmed) {
        throw new Error("Git completion is uncertain; creation remains reserved without replay.");
      }
      return await this.publish(creation, await this.git.list(creation.projectPath, creation.sourceId));
    } finally {
      this.busy.delete(id);
    }
  }

  /** Checks trust and path availability in the owning source before any Git mutation. */
  private async requireDestination(creation: OpenCodexWorkspaceCreation): Promise<void> {
    const client = await this.clients.ensureClient(creation.sourceId);
    const response = await client.request<v2.ConfigReadResponse>("config/read", { cwd: creation.projectPath });
    const project = readObject(readObject(response.config.projects)[creation.projectPath]);
    if (project.trust_level !== "trusted") {
      throw new Error("Trust the project in its Codex source before creating a worktree.");
    }
    let exists = true;
    try {
      await client.getMetadata(creation.destinationPath);
    } catch (error) {
      if (!(error instanceof Error) || !/no such file|\b(file|path)\b.*\bnot found\b/iu.test(error.message)) {
        throw error;
      }
      exists = false;
    }
    if (exists) {
      throw new Error("Workspace destination must not already exist.");
    }
    if (creation.destinationPath.startsWith("/") !== creation.projectPath.startsWith("/")) {
      throw new Error("Workspace path must use the project's source path syntax.");
    }
    const syntax = creation.destinationPath.startsWith("/") ? path.posix : path.win32;
    const relative = syntax.relative(creation.projectPath, creation.destinationPath);
    if (relative === "" || (!relative.startsWith(`..${syntax.sep}`) && relative !== ".." && !syntax.isAbsolute(relative))) {
      throw new Error("Create the workspace outside the project's existing checkout.");
    }
    await prepareWorkspaceStorage(client, creation);
    const parent = await client.getMetadata(syntax.dirname(creation.destinationPath));
    if (!parent.isDirectory || parent.isSymlink) {
      throw new Error("Workspace parent must be an existing directory, not a symbolic link.");
    }
    const entries = await this.git.list(creation.projectPath, creation.sourceId);
    if (!entries.some((entry) => normalizeCreationPath(entry.path) === creation.projectPath && !entry.bare)) {
      throw new Error("Project path must be a Git worktree root.");
    }
    if (creation.start.mode !== "detached") {
      const branch = `refs/heads/${creation.start.branchName}`;
      if (entries.some((entry) => entry.branch === branch)) {
        throw new Error("Workspace branch is already checked out in this repository.");
      }
    }
    if (entries.some((entry) => normalizeCreationPath(entry.path) === creation.destinationPath)) {
      throw new Error("Destination is already registered by Git; reconcile it before creating a workspace.");
    }
  }

  /** Verifies the same repository, exact checkout and source directory before atomic publication. */
  private async publish(creation: OpenCodexWorkspaceCreation, entries: GitWorktree[]): Promise<OpenCodexProjectWorkspace> {
    const repositoryPath = await this.git.repositoryPath(creation.projectPath, creation.sourceId);
    if (repositoryPath !== creation.repositoryPath) {
      throw new Error("Git repository identity changed during workspace creation.");
    }
    if (await this.git.repositoryPath(creation.destinationPath, creation.sourceId) !== repositoryPath) {
      throw new Error("Created checkout belongs to a different Git repository.");
    }
    const entry = entries.find((item) => normalizeCreationPath(item.path) === creation.destinationPath);
    if (entry === undefined || entry.bare || entry.prunableReason !== null
      || entry.head !== creation.expectedHead || entry.branch !== creation.expectedBranch) {
      throw new Error("Git checkout does not match the reserved workspace creation.");
    }
    const client = await this.clients.ensureClient(creation.sourceId);
    const metadata = await client.getMetadata(creation.destinationPath);
    if (!metadata.isDirectory || metadata.isSymlink) {
      throw new Error("Created workspace directory is unavailable or a symbolic link.");
    }
    const id = await this.repository.creations.commit(creation.id);
    const workspace = await this.repository.get(id);
    if (workspace === null) {
      throw new Error("Published workspace is unavailable.");
    }
    return workspace;
  }

  /** Requires persisted identity for recovery instead of reconstructing user intent. */
  private async requireCreation(id: string): Promise<OpenCodexWorkspaceCreation> {
    const creation = await this.repository.creations.get(id);
    if (creation === null) {
      throw new Error("Workspace creation does not exist.");
    }
    return creation;
  }
}
