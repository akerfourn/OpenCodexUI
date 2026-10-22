import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import { isWorkspaceDiskUsageValues } from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexFileContext, OpenCodexWorkspaceDiskUsage } from "@open-codex-ui/opencodex-protocol";
import type { ClientPort, ProjectSourcePort } from "../runtime/runtimePorts.js";
import { runLocalFileOperation, runSourceFileOperation } from "../files/runFileOperation.js";
import { requireToolWorkspace } from "./workspaceToolContext.js";

/** Execution boundaries keep remote paths away from the host filesystem. */
interface DiskUsageRunners {
  local: typeof runLocalFileOperation;
  source: typeof runSourceFileOperation;
}

/** On-demand read-only estimates, always executed inside the owning source. */
export class WorkspaceDiskUsageService {
  /** Limits simultaneous traversals per source, independently of the requesting renderer. */
  private readonly running = new Map<string, number>();

  /** Reuses the bounded filesystem helper and keeps tests independent of wall-clock time. */
  constructor(private readonly repository: OpenCodexCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly sources: Pick<ProjectSourcePort, "resolveRequestedSource">,
    private readonly runners: DiskUsageRunners = { local: runLocalFileOperation, source: runSourceFileOperation },
    private readonly now: () => string = () => new Date().toISOString()) {}

  /** Validates the reviewed context before and after scanning; never persists a size as current truth. */
  async read(input: OpenCodexFileContext): Promise<OpenCodexWorkspaceDiskUsage> {
    const context = { projectId: input.projectId, workspaceId: input.workspaceId,
      sourceId: input.sourceId, workspacePath: input.workspacePath };
    await this.requireContext(context);
    const source = await this.sources.resolveRequestedSource(context.sourceId);
    if (source.id !== context.sourceId) throw new Error("Requested source does not own this measurement.");
    const count = this.running.get(context.sourceId) ?? 0;
    if (count >= 2) throw new Error("Two workspace size measurements are already running on this source. Retry when they finish.");
    this.running.set(context.sourceId, count + 1);
    try {
      const request = { type: "workspaceDiskUsage" as const, target: { ...context, path: "" } };
      let result;
      if (source.kind === "local") result = await this.runners.local(request);
      else result = await this.runners.source(await this.clients.ensureClient(context.sourceId), request);
      if (!result.ok) throw new Error(result.details ?? "Workspace size measurement failed.");
      if (!isWorkspaceDiskUsageValues(result.value)) throw new Error("Invalid workspace size measurement.");
      await this.requireContext(context);
      const values = result.value;
      return { ...context, measuredAt: this.now(), logicalBytes: values.logicalBytes,
        allocatedBytes: values.allocatedBytes, fileCount: values.fileCount, skippedLinks: values.skippedLinks,
        unreadableEntries: values.unreadableEntries, complete: values.complete, limitReached: values.limitReached };
    } finally {
      const remaining = (this.running.get(context.sourceId) ?? 1) - 1;
      if (remaining === 0) this.running.delete(context.sourceId);
      else this.running.set(context.sourceId, remaining);
    }
  }

  /** Refuses moved, removed, pending or foreign workspaces without interpreting paths on the host. */
  private async requireContext(context: OpenCodexFileContext): Promise<void> {
    const workspace = await requireToolWorkspace(this.repository, context.workspaceId, context.projectId);
    if (workspace.projectId !== context.projectId || workspace.sourceId !== context.sourceId
      || workspace.path !== context.workspacePath) {
      throw new Error("Workspace context changed. Refresh before measuring its size.");
    }
  }
}
