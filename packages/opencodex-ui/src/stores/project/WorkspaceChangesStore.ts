import { makeAutoObservable, runInAction } from "mobx";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceChanges } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import type { ProjectStore } from "./ProjectStore";

/** Keeps fresh scan evidence separate from dated cached observations used for offline display. */
export class WorkspaceChangesStore {
  /** Current inventory checks, including explicit partial results. */
  readonly results = new Map<string, OpenCodexWorkspaceChanges>();
  /** Context-bound errors do not prevent other workspaces from being checked. */
  readonly errors = new Map<string, { sourceId: string; workspacePath: string; message: string }>();
  /** A new inventory refresh or project disposal invalidates all pending replies. */
  private generation = 0;

  /** Owns UI evidence only; transport payloads are detached literal objects. */
  constructor(private readonly project: ProjectStore, private readonly root: RootStore) {
    makeAutoObservable<WorkspaceChangesStore, "project" | "root">(this,
      { project: false, root: false }, { autoBind: true });
  }

  /** Uses persisted evidence only as an explicitly cached fallback. */
  resultFor(workspace: OpenCodexProjectWorkspace): OpenCodexWorkspaceChanges | undefined {
    const result = this.results.get(workspace.id) ?? this.project.workspaces.activityById.get(workspace.id)?.changes;
    if (result === undefined || !this.matches(workspace, result)) return undefined;
    if (!this.project.isCodexSourceReady || this.project.isReadOnlyFromCache) return { ...result, state: "cached" };
    return result;
  }

  /** Hides errors after a workspace has changed source or location. */
  errorFor(workspace: OpenCodexProjectWorkspace): string | undefined {
    const error = this.errors.get(workspace.id);
    if (error?.sourceId !== workspace.sourceId || error.workspacePath !== workspace.path) return undefined;
    return error.message;
  }

  /** Clears fresh evidence without discarding persisted history or starting a scan. */
  reset(): void {
    this.generation += 1;
    this.results.clear();
    this.errors.clear();
  }

  /** Runs once per inventory refresh and discards moved, foreign, removed or late results. */
  async check(workspace: OpenCodexProjectWorkspace): Promise<void> {
    if (workspace.sourceId === null || workspace.sourceId !== this.project.project.sourceId) return;
    const input = { projectId: workspace.projectId, workspaceId: workspace.id,
      sourceId: workspace.sourceId, workspacePath: workspace.path };
    const generation = this.generation;
    try {
      const result = await this.root.request<OpenCodexWorkspaceChanges>({ type: "projectWorkspaces.changes.read", input });
      runInAction(() => {
        const current = this.current(input.workspaceId, generation);
        if (current === undefined || !this.matches(current, input)) return;
        if (!this.matches(current, result) || !["checked", "partial"].includes(result.state)
          || typeof result.hasChanges !== "boolean" || !Number.isFinite(Date.parse(result.checkedAt))
          || (result.lastChangedAt !== null && !Number.isFinite(Date.parse(result.lastChangedAt)))) {
          throw new Error("Invalid workspace change observation.");
        }
        this.results.set(workspace.id, result);
        this.errors.delete(workspace.id);
      });
    } catch (error) {
      runInAction(() => {
        const current = this.current(input.workspaceId, generation);
        if (current === undefined || !this.matches(current, input)) return;
        this.results.delete(workspace.id);
        this.errors.set(workspace.id, { sourceId: input.sourceId, workspacePath: input.workspacePath,
          message: error instanceof Error ? error.message : String(error) });
      });
    }
  }

  /** Requires the same live project source and available physical checkout. */
  private current(workspaceId: string, generation: number): OpenCodexProjectWorkspace | undefined {
    if (generation !== this.generation) return undefined;
    const current = this.project.workspaces.workspaces.find(item => item.id === workspaceId);
    if (current?.sourceId !== this.project.project.sourceId || current?.removedAt !== null
      || current.movePending === true || current.removalPending === true) return undefined;
    return current;
  }

  /** Checks every identity field rather than relying on the active UI selection. */
  private matches(workspace: OpenCodexProjectWorkspace,
    result: { projectId: string; workspaceId: string; sourceId: string; workspacePath: string } | undefined): boolean {
    return result !== undefined && result.workspaceId === workspace.id && result.projectId === workspace.projectId
      && result.sourceId === workspace.sourceId && result.workspacePath === workspace.path
      && workspace.removedAt === null && workspace.movePending !== true && workspace.removalPending !== true;
  }
}
