import { makeAutoObservable, runInAction } from "mobx";
import { isWorkspaceDiskUsageValues } from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceDiskUsage } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import type { ProjectStore } from "./ProjectStore";

/** Ephemeral measurements never change retention decisions or survive closing the project tab. */
export class WorkspaceDiskUsageStore {
  /** Results remain explicitly dated observations until another user measurement. */
  readonly results = new Map<string, OpenCodexWorkspaceDiskUsage>();
  /** Per-workspace failures keep the inventory and other measurements usable. */
  readonly errors = new Map<string, string>();
  /** Errors retain their source/path context, just like successful observations. */
  private readonly errorContexts = new Map<string, { sourceId: string; workspacePath: string }>();
  /** At most one traversal per workspace and two per project can be requested locally. */
  readonly loading = new Set<string>();
  /** Invalidates responses when the project tab is disposed. */
  private generation = 0;

  /** Keeps source and transport references outside observable payloads. */
  constructor(private readonly project: ProjectStore, private readonly root: RootStore) {
    makeAutoObservable<WorkspaceDiskUsageStore, "project" | "root">(this,
      { project: false, root: false }, { autoBind: true });
  }

  /** Hides observations from old source/path identities and pending or removed workspaces. */
  resultFor(workspace: OpenCodexProjectWorkspace): OpenCodexWorkspaceDiskUsage | undefined {
    const result = this.results.get(workspace.id);
    if (!this.available(workspace) || result?.sourceId !== workspace.sourceId
      || result.workspacePath !== workspace.path || result.projectId !== workspace.projectId) return undefined;
    return result;
  }

  /** Hides failures from a previous physical location or source. */
  errorFor(workspace: OpenCodexProjectWorkspace): string | undefined {
    const context = this.errorContexts.get(workspace.id);
    if (!this.available(workspace) || context?.sourceId !== workspace.sourceId
      || context.workspacePath !== workspace.path) return undefined;
    return this.errors.get(workspace.id);
  }

  /** A missing source disables new requests while retaining dated results for offline reading. */
  canMeasure(workspace: OpenCodexProjectWorkspace): boolean {
    return this.available(workspace) && this.project.isCodexSourceReady && !this.project.isReadOnlyFromCache
      && !this.loading.has(workspace.id) && this.loading.size < 2;
  }

  /** Captures a plain immutable request and discards replies after any workspace context change. */
  async measure(workspace: OpenCodexProjectWorkspace): Promise<void> {
    if (!this.canMeasure(workspace) || workspace.sourceId === null) return;
    const input = { projectId: this.project.project.id, workspaceId: workspace.id,
      sourceId: workspace.sourceId, workspacePath: workspace.path };
    const generation = this.generation;
    this.loading.add(workspace.id);
    this.errors.delete(workspace.id);
    this.errorContexts.delete(workspace.id);
    try {
      const result = await this.root.request<OpenCodexWorkspaceDiskUsage>({ type: "projectWorkspaces.diskUsage.read", input });
      runInAction(() => {
        if (!this.isCurrent(input.workspaceId, input.sourceId, input.workspacePath, generation)) return;
        if (!isWorkspaceDiskUsageValues(result) || result.workspaceId !== input.workspaceId
          || result.projectId !== input.projectId || result.sourceId !== input.sourceId
          || result.workspacePath !== input.workspacePath || !Number.isFinite(Date.parse(result.measuredAt))) {
          throw new Error("Invalid workspace size measurement.");
        }
        this.results.set(input.workspaceId, result);
      });
    } catch (error) {
      runInAction(() => {
        if (this.isCurrent(input.workspaceId, input.sourceId, input.workspacePath, generation)) {
          this.errors.set(input.workspaceId, error instanceof Error ? error.message : String(error));
          this.errorContexts.set(input.workspaceId, { sourceId: input.sourceId, workspacePath: input.workspacePath });
        }
      });
    } finally {
      runInAction(() => { if (generation === this.generation) this.loading.delete(input.workspaceId); });
    }
  }

  /** Invalidates observations after a local relocation, without re-running a scan. */
  forget(workspaceId: string): void {
    this.results.delete(workspaceId);
    this.errors.delete(workspaceId);
    this.errorContexts.delete(workspaceId);
  }

  /** Invalidates outstanding callbacks without turning a closed view into a background poller. */
  dispose(): void {
    this.generation += 1;
    this.results.clear();
    this.errors.clear();
    this.errorContexts.clear();
    this.loading.clear();
  }

  /** Checks explicit catalogue ownership, independently of the selected conversation. */
  private available(workspace: OpenCodexProjectWorkspace): boolean {
    const current = this.project.workspaces.workspaces.find(item => item.id === workspace.id);
    return current !== undefined && current.projectId === workspace.projectId
      && current.sourceId === workspace.sourceId && current.path === workspace.path
      && workspace.projectId === this.project.project.id && workspace.sourceId !== null
      && workspace.sourceId === this.project.project.sourceId && workspace.removedAt === null
      && current.removedAt === null && current.movePending !== true && current.removalPending !== true;
  }

  /** Requires the original source, path and live project lifetime before publishing a reply. */
  private isCurrent(workspaceId: string, sourceId: string, workspacePath: string, generation: number): boolean {
    const current = this.project.workspaces.workspaces.find(item => item.id === workspaceId);
    return generation === this.generation && current !== undefined && this.available(current)
      && current.sourceId === sourceId && current.path === workspacePath;
  }
}
