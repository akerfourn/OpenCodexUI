import type { WorkspaceCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexWorkspaceDiscoveryResult, OpenCodexWorkspaceDiscoverySkipped } from
  "@open-codex-ui/opencodex-protocol";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { GitWorktreeService } from "../git/GitWorktreeService.js";
import { createRunGit } from "../git/gitCommandRunner.js";
import { normalizeWorkspaceSourcePath } from "./workspaceSourcePath.js";

/** Explicitly discovers source-local Git checkouts without claiming ownership of their files. */
export class WorkspaceDiscoveryService {
  /** Reads Git through the owning source; no filesystem or Git mutation is exposed. */
  constructor(
    private readonly repository: WorkspaceCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly git: Pick<GitWorktreeService, "list" | "repositoryPath"> = new GitWorktreeService(createRunGit(clients))
  ) {}

  /** Verifies all source evidence before atomically registering eligible external checkouts. */
  async discover(projectId: string, sourceId: string): Promise<OpenCodexWorkspaceDiscoveryResult> {
    const primary = (await this.repository.list(projectId))
      .find((workspace) => workspace.isPrimary && workspace.removedAt === null);
    if (primary === undefined || primary.sourceId === null || primary.sourceId !== sourceId) {
      throw new Error("Workspace discovery requires the project's owning source.");
    }
    const repositoryPath = await this.git.repositoryPath(primary.path, sourceId);
    const entries = await this.git.list(primary.path, sourceId);
    const normalized = entries.map((entry) => ({ entry, path: supportedPath(entry.path, primary.path) }));
    if (!normalized.some(({ entry, path }) => path === primary.path && !entry.bare)) {
      throw new Error("Project path must be a Git worktree root for discovery.");
    }
    const client = await this.clients.ensureClient(sourceId);
    const paths: string[] = [];
    const skipped: OpenCodexWorkspaceDiscoverySkipped[] = [];
    for (const { entry, path } of normalized) {
      if (path === null) {
        skipped.push({ path: entry.path, reason: "unsupportedPath" });
        continue;
      }
      if (entry.bare || entry.prunableReason !== null) {
        skipped.push({ path, reason: "unavailable" });
        continue;
      }
      let available: boolean;
      try {
        const metadata = await client.getMetadata(path);
        available = metadata.isDirectory && !metadata.isSymlink;
      } catch (error) {
        if (!(error instanceof Error) || !/no such file|\b(file|path)\b.*\bnot found\b/iu.test(error.message)) {
          throw error;
        }
        available = false;
      }
      if (!available) {
        skipped.push({ path, reason: "unavailable" });
        continue;
      }
      if (await this.git.repositoryPath(path, sourceId) !== repositoryPath) {
        skipped.push({ path, reason: "repositoryMismatch" });
        continue;
      }
      paths.push(path);
    }
    if (await this.git.repositoryPath(primary.path, sourceId) !== repositoryPath) {
      throw new Error("Git repository identity changed during discovery.");
    }
    skipped.push(...await this.repository.registerDiscovered(primary.id, sourceId, primary.path, paths));
    return { workspaces: await this.repository.list(projectId), skipped };
  }
}

/** Unsupported or differently styled source paths remain visible as warnings, never host-resolved. */
function supportedPath(value: string, primaryPath: string): string | null {
  try {
    if (value.startsWith("/") !== primaryPath.startsWith("/")) {
      return null;
    }
    return normalizeWorkspaceSourcePath(value);
  } catch {
    return null;
  }
}
