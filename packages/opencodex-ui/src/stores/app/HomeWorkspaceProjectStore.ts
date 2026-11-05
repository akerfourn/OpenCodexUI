import { makeAutoObservable, runInAction } from "mobx";
import type {
  OpenCodexProject, OpenCodexProjectWorkspace, OpenCodexWorkspaceActivity,
  OpenCodexWorkspaceChanges, OpenCodexWorkspaceCreation, OpenCodexWorkspaceRemoval,
  OpenCodexWorkspaceMove, OpenCodexWorkspaceLockState, OpenCodexWorkspaceDiskUsage
} from "@open-codex-ui/opencodex-protocol";
import { defaultWorkspaceRetentionDays } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import { WorkspaceDiskUsageStore } from "../project/WorkspaceDiskUsageStore";
import { matchingWorkspaceActivity, workspaceManagementStatus } from "../project/workspaceManagement";
import type { WorkspaceManagementStatus } from "../project/workspaceManagement";

/** One project's inventory needs no project tab, thread loading or background runtime. */
export class HomeWorkspaceProjectStore {
  /** Cache snapshots include removed entries for matching retained observations. */
  private catalogue: OpenCodexProjectWorkspace[] = [];
  /** Metadata identity captured with the current catalogue. */
  private snapshot: OpenCodexProject;
  /** Known Codex activity is separate from source-side file checks. */
  readonly activity = new Map<string, OpenCodexWorkspaceActivity>();
  /** Fresh source checks exist only after an explicit refresh. */
  readonly changes = new Map<string, OpenCodexWorkspaceChanges>();
  /** Fresh native Git locks are required before proposing cleanup. */
  readonly locks = new Map<string, OpenCodexWorkspaceLockState>();
  /** Per-folder failures leave the rest of the inventory usable. */
  readonly checkErrors = new Map<string, string>();
  /** Existing recovery journals remain visible without automatically replaying them. */
  creations: OpenCodexWorkspaceCreation[] = [];
  /** Removals retain their original review/recovery identities. */
  removals: OpenCodexWorkspaceRemoval[] = [];
  /** Moves remain pending until both source paths have been verified. */
  moves: OpenCodexWorkspaceMove[] = [];
  /** Traversals remain separate from inventory refresh. */
  readonly diskUsage: WorkspaceDiskUsageStore;
  /** Independent errors do not hide projects whose reads succeeded. */
  error: string | null = null;
  /** Covers catalogue loading and the explicitly requested source checks. */
  isLoading = false;
  /** Age-based suggestions use the time of the last explicit refresh. */
  checkedAt: number = 0;
  /** Invalidates reads after refresh, metadata changes or Home unmount. */
  private generation = 0;

  /** Captures metadata, not a global active source or project store. */
  constructor(project: OpenCodexProject, private readonly root: RootStore) {
    this.snapshot = project;
    this.diskUsage = new WorkspaceDiskUsageStore(this, root);
    makeAutoObservable<HomeWorkspaceProjectStore, "root">(this, { root: false }, { autoBind: true });
  }

  /** Current metadata can invalidate a snapshot while its request is still pending. */
  get project(): OpenCodexProject {
    return this.root.projectsStore.projects.find(item => item.id === this.snapshot.id) ?? this.snapshot;
  }

  /** A changed source or principal path requires a new catalogue before publishing observations. */
  get workspaces(): { workspaces: OpenCodexProjectWorkspace[] } {
    if (this.project.sourceId !== this.snapshot.sourceId || this.project.path !== this.snapshot.path) {
      return { workspaces: [] };
    }
    return { workspaces: this.catalogue };
  }

  /** Removed folders remain accessible through project history, not the default Home inventory. */
  get entries(): OpenCodexProjectWorkspace[] {
    return this.workspaces.workspaces.filter(item => item.removedAt === null);
  }

  /** Source availability is evaluated for this project explicitly. */
  get isCodexSourceReady(): boolean {
    return this.root.sourcesStore.isSourceReady(this.project.sourceId);
  }

  /** Offline and orphan inventories remain readable, with live actions disabled. */
  get isReadOnlyFromCache(): boolean {
    return this.project.sourceId === null || !this.isCodexSourceReady;
  }

  /** Journals may also refer to a folder not yet registered in the catalogue. */
  get pendingCount(): number {
    return this.creations.length + this.removals.length + this.moves.length;
  }

  /** Binds activity to its observed source/path, including after a relocation. */
  activityFor(workspace: OpenCodexProjectWorkspace): OpenCodexWorkspaceActivity | undefined {
    return matchingWorkspaceActivity(workspace, this.activity.get(workspace.id));
  }

  /** A cached observation is displayed as cached and cannot create a cleanup suggestion. */
  changesFor(workspace: OpenCodexProjectWorkspace): OpenCodexWorkspaceChanges | undefined {
    const fresh = this.changes.get(workspace.id);
    if (fresh !== undefined && this.matches(workspace, fresh)) return fresh;
    const cached = this.activityFor(workspace)?.changes;
    if (cached !== undefined && this.matches(workspace, cached)) return { ...cached, state: "cached" };
    return undefined;
  }

  /** Shows execution/transition blockers independently of the permanent principal/imported roles. */
  hasPending(workspace: OpenCodexProjectWorkspace): boolean {
    return workspace.movePending === true || workspace.removalPending === true
      || (this.activityFor(workspace)?.pendingOperationCount ?? 0) > 0;
  }

  /** Reuses dated measurements made in Home or an already opened project's management view. */
  sizeFor(workspace: OpenCodexProjectWorkspace): OpenCodexWorkspaceDiskUsage | undefined {
    const own = this.diskUsage.resultFor(workspace);
    const opened = this.root.projectsStore.projectStoresById.get(this.project.id)
      ?.workspaces.diskUsage.resultFor(workspace);
    if (own === undefined) return opened;
    if (opened !== undefined && Date.parse(opened.measuredAt) > Date.parse(own.measuredAt)) return opened;
    return own;
  }

  /** Reuses the conservative project-management policy; suggestions never authorize deletion. */
  statusFor(workspace: OpenCodexProjectWorkspace): WorkspaceManagementStatus {
    const opened = this.root.projectsStore.projectStoresById.get(this.project.id);
    const localActivity = opened !== undefined && (opened.hasRunningChatIndicator
      || opened.commandsStore.hasActiveRun || opened.hasActiveDebugSession
      || opened.composeStore.hasNonStoppedContainer || opened.composeStore.pendingServiceNames.size > 0);
    return workspaceManagementStatus({
      workspace, activity: this.activityFor(workspace), changes: this.changesFor(workspace),
      lock: this.locks.get(workspace.id), hasLocalActivity: localActivity,
      hasUnsavedDocuments: opened?.files.hasUnsavedWorkspaceDocuments(workspace.id) ?? false,
      sourceAvailable: !this.isReadOnlyFromCache && workspace.sourceId === this.project.sourceId,
      checking: this.isLoading || this.root.homeWorkspacesStore.isLoading || this.root.homeWorkspacesStore.error !== null,
      now: this.checkedAt,
      retentionDays: this.project.preferences.workspaceRetention?.days === undefined
        ? defaultWorkspaceRetentionDays : this.project.preferences.workspaceRetention.days
    });
  }

  /** Loads local metadata first; only an explicit refresh performs bounded source checks. */
  async load(verifySource: boolean): Promise<void> {
    const generation = ++this.generation;
    const project = { ...this.project };
    this.isLoading = true;
    this.error = null;
    this.changes.clear();
    this.locks.clear();
    this.checkErrors.clear();
    try {
      const [catalogue, activity, creations, removals, moves] = await Promise.all([
        this.root.request<OpenCodexProjectWorkspace[]>({ type: "projectWorkspaces.list", projectId: project.id }),
        this.root.request<OpenCodexWorkspaceActivity[]>({ type: "projectWorkspaces.activity", projectId: project.id }),
        this.root.request<OpenCodexWorkspaceCreation[]>({ type: "projectWorkspaces.creations.list", projectId: project.id }),
        this.root.request<OpenCodexWorkspaceRemoval[]>({ type: "projectWorkspaces.removals.list", projectId: project.id }),
        this.root.request<OpenCodexWorkspaceMove[]>({ type: "projectWorkspaces.moves.list", projectId: project.id })
      ]);
      if (!this.current(generation, project)) return;
      runInAction(() => {
        this.snapshot = project;
        this.catalogue = catalogue.filter(item => item.projectId === project.id && item.sourceId === project.sourceId);
        this.activity.clear();
        for (const item of activity) this.activity.set(item.workspaceId, item);
        this.creations = creations;
        this.removals = removals;
        this.moves = moves;
        this.checkedAt = Date.now();
      });
      if (!verifySource || this.isReadOnlyFromCache) return;
      const available = this.entries.filter(item => item.movePending !== true && item.removalPending !== true);
      for (let offset = 0; offset < available.length; offset += 3) {
        if (!this.current(generation, project)) return;
        await Promise.all(available.slice(offset, offset + 3).map(item => this.check(item, generation, project)));
      }
    } catch (error) {
      runInAction(() => {
        if (this.current(generation, project)) this.error = String(error);
      });
    } finally {
      runInAction(() => {
        if (generation === this.generation) {
          this.checkedAt = Date.now();
          this.isLoading = false;
        }
      });
    }
  }

  /** A source failure belongs to its own row; it does not abort other projects. */
  private async check(workspace: OpenCodexProjectWorkspace, generation: number, project: OpenCodexProject): Promise<void> {
    if (workspace.sourceId === null) return;
    const input = { projectId: project.id, workspaceId: workspace.id,
      sourceId: workspace.sourceId, workspacePath: workspace.path };
    try {
      const [changes, lock] = await Promise.all([
        this.root.request<OpenCodexWorkspaceChanges>({ type: "projectWorkspaces.changes.read", input }),
        workspace.isPrimary ? Promise.resolve(undefined) : this.root.request<OpenCodexWorkspaceLockState>({
          type: "projectWorkspaces.lock.read", projectId: project.id, workspaceId: workspace.id, sourceId: workspace.sourceId
        })
      ]);
      if (!this.current(generation, project)) return;
      if (!this.matches(workspace, changes) || !Number.isFinite(Date.parse(changes.checkedAt))
        || !["checked", "partial"].includes(changes.state) || typeof changes.hasChanges !== "boolean"
        || (changes.lastChangedAt !== null && !Number.isFinite(Date.parse(changes.lastChangedAt)))) {
        throw new Error("Invalid workspace observation or mismatched source/path identity.");
      }
      if (lock !== undefined && (lock.workspaceId !== workspace.id || lock.sourceId !== workspace.sourceId
        || lock.workspacePath !== workspace.path)) {
        throw new Error("Workspace lock belongs to a different source or path.");
      }
      runInAction(() => {
        this.changes.set(workspace.id, changes);
        if (lock !== undefined) this.locks.set(workspace.id, lock);
      });
    } catch (error) {
      runInAction(() => {
        if (this.current(generation, project)) this.checkErrors.set(workspace.id, String(error));
      });
    }
  }

  /** Compares explicit project/source/path identities rather than normalizing host paths. */
  private matches(workspace: OpenCodexProjectWorkspace, value: OpenCodexWorkspaceChanges): boolean {
    return value.projectId === workspace.projectId && value.workspaceId === workspace.id
      && value.sourceId === workspace.sourceId && value.workspacePath === workspace.path;
  }

  /** Discards responses after a source or principal path changes while scanning. */
  private current(generation: number, project: OpenCodexProject): boolean {
    return generation === this.generation && project.sourceId === this.project.sourceId && project.path === this.project.path;
  }

  /** Cancels late publication when Home closes, without deleting cached metadata. */
  dispose(): void {
    this.generation += 1;
    this.isLoading = false;
    this.diskUsage.dispose();
  }
}
