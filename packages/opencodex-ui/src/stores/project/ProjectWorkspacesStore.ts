import { makeAutoObservable, runInAction } from "mobx";
import { isWorkspaceRetention } from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";
import type {
  OpenCodexProjectWorkspace, OpenCodexWorkspaceCreation, OpenCodexWorkspaceRemoval, OpenCodexWorkspaceMove, OpenCodexWorkspaceDiscoveryResult,
  OpenCodexWorkspaceStart, OpenCodexWorkspaceRoot, OpenCodexWorkspaceLockState
} from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexWorkspaceActivity } from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexWorkspaceWorkStatus } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import type { ProjectStore } from "./ProjectStore";
import { WorkspaceDiskUsageStore } from "./WorkspaceDiskUsageStore";

/** Source-owned catalogue and explicit workspace operations for one logical project. */
export class ProjectWorkspacesStore {
  /** On-demand size observations remain separate from cached activity and cleanup eligibility. */
  readonly diskUsage: WorkspaceDiskUsageStore;
  /** Retained catalogue, including unavailable historical entries. */
  workspaces: OpenCodexProjectWorkspace[] = [];
  /** Durable creations that need an explicit recovery attempt. */
  pending: OpenCodexWorkspaceCreation[] = [];
  /** Unfinished removals remain visible until source-side reconciliation succeeds. */
  pendingRemovals: OpenCodexWorkspaceRemoval[] = [];
  /** Interrupted moves reserve both paths until explicit source verification. */
  pendingMoves: OpenCodexWorkspaceMove[] = [];
  /** Live source-owned lock snapshots, fetched explicitly rather than assumed from cached metadata. */
  lockStates = new Map<string, OpenCodexWorkspaceLockState>();
  /** Menus remain disabled while their Git state is being checked. */
  loadingLockIds = new Set<string>();
  /** Discards out-of-order state responses, including after relocation or disposal. */
  private readonly lockGenerations = new Map<string, number>();
  /** Workspace used when composing a new conversation. */
  selectedId: string | null = null;
  /** Serializes user mutations without hiding uncertain backend outcomes. */
  isBusy = false;
  /** Last failure, retained until the next explicit action. */
  error: string | null = null;
  /** Discovery exclusions shown with their original paths. */
  skipped: OpenCodexWorkspaceDiscoveryResult["skipped"] = [];
  /** Discards stale catalogue reads after a later request or disposal. */
  private generation = 0;
  /** Cached activity is loaded only by the management view, separately from the sidebar catalogue. */
  activityById = new Map<string, OpenCodexWorkspaceActivity>();
  /** Covers catalogue, activity and bounded source lock checks during explicit refresh. */
  isRefreshingManagement = false;
  /** Invalidates management results after source changes, newer refreshes or disposal. */
  private activityGeneration = 0;

  /** Keeps transport and project references outside observable state. */
  constructor(private readonly project: ProjectStore, private readonly root: RootStore) {
    this.diskUsage = new WorkspaceDiskUsageStore(project, root);
    makeAutoObservable<ProjectWorkspacesStore, "project" | "root">(
      this, { project: false, root: false }, { autoBind: true });
  }

  /** Uses the conversation's physical context when a conversation is selected. */
  get current(): OpenCodexProjectWorkspace | null {
    const thread = this.project.selectedChat?.thread;
    if (thread !== undefined) {
      return this.workspaces.find((item) => item.path === thread.projectPath) ?? null;
    }
    return this.workspaces.find((item) => item.id === this.selectedId)
      ?? this.workspaces.find((item) => item.isPrimary) ?? null;
  }

  /** Lists only locations belonging to this project's filesystem source. */
  get storageRoots(): OpenCodexWorkspaceRoot[] {
    return (this.root.appStore.settingsStore.settings.workspaceRoots ?? [])
      .filter((item) => item.sourceId === this.project.project.sourceId);
  }

  /** Exposes the final directory layout without generating a second, temporary workspace identity. */
  storagePreview(rootId: string, workspaceId = "<workspace-id>"): string {
    const root = this.storageRoots.find((item) => item.id === rootId);
    if (root === undefined) return "";
    const separator = root.path.startsWith("/") ? "/" : "\\";
    return [root.path.replace(/[\\/]+$/u, ""), this.project.project.id, workspaceId].join(separator);
  }

  /** Reloads persisted state even when the source is offline. */
  async load(): Promise<void> {
    const generation = ++this.generation;
    try {
      const [workspaces, pending, removals, moves] = await Promise.all([
        this.root.request<OpenCodexProjectWorkspace[]>({
          type: "projectWorkspaces.list", projectId: this.project.project.id
        }),
        this.root.request<OpenCodexWorkspaceCreation[]>({
          type: "projectWorkspaces.creations.list", projectId: this.project.project.id
        }),
        this.root.request<OpenCodexWorkspaceRemoval[]>({
          type: "projectWorkspaces.removals.list", projectId: this.project.project.id
        }),
        this.root.request<OpenCodexWorkspaceMove[]>({
          type: "projectWorkspaces.moves.list", projectId: this.project.project.id
        })
      ]);
      runInAction(() => {
        if (generation !== this.generation) return;
        for (const workspace of workspaces) {
          const previous = this.workspaces.find(item => item.id === workspace.id);
          if (previous !== undefined && previous.path !== workspace.path) this.applyRelocation(previous, workspace);
        }
        this.workspaces = workspaces;
        this.pending = pending;
        this.pendingRemovals = removals;
        this.pendingMoves = moves;
        if (this.workspaces.some(item => item.id === this.selectedId && item.removedAt !== null)) {
          this.selectedId = this.workspaces.find(item => item.isPrimary)?.id ?? null;
        }
      });
    } catch (error) {
      runInAction(() => {
        if (generation === this.generation) this.error = errorMessage(error);
      });
    }
  }

  /** Refreshes advisory activity and live locks without starting or recovering any maintenance operation. */
  async refreshManagement(): Promise<void> {
    if (this.isRefreshingManagement) return;
    const generation = ++this.activityGeneration;
    const sourceId = this.project.project.sourceId;
    this.isRefreshingManagement = true;
    this.activityById.clear();
    this.error = null;
    try {
      await this.load();
      const activity = await this.root.request<OpenCodexWorkspaceActivity[]>({
        type: "projectWorkspaces.activity", projectId: this.project.project.id
      });
      if (generation !== this.activityGeneration || sourceId !== this.project.project.sourceId) return;
      runInAction(() => {
        for (const item of activity) {
          const workspace = this.workspaces.find(workspace => workspace.id === item.workspaceId);
          if (workspace?.sourceId === item.sourceId && workspace.path === item.workspacePath) {
            this.activityById.set(item.workspaceId, item);
          }
        }
      });
      if (!this.project.isCodexSourceReady || this.project.isReadOnlyFromCache) return;
      const secondary = this.workspaces.filter(item => !item.isPrimary && item.removedAt === null
        && item.removalPending !== true && item.movePending !== true);
      for (let offset = 0; offset < secondary.length; offset += 3) {
        if (generation !== this.activityGeneration || sourceId !== this.project.project.sourceId) return;
        await Promise.all(secondary.slice(offset, offset + 3).map(item => this.loadLockState(item.id)));
      }
    } catch (error) {
      runInAction(() => {
        if (generation === this.activityGeneration && sourceId === this.project.project.sourceId) this.error = errorMessage(error);
      });
    } finally {
      runInAction(() => { if (generation === this.activityGeneration) this.isRefreshingManagement = false; });
    }
  }

  /** Reads a fresh native Git lock without coupling catalogue loading to source availability. */
  async loadLockState(workspaceId: string): Promise<void> {
    const generation = (this.lockGenerations.get(workspaceId) ?? 0) + 1;
    this.lockGenerations.set(workspaceId, generation);
    this.lockStates.delete(workspaceId);
    this.loadingLockIds.delete(workspaceId);
    if (this.project.isReadOnlyFromCache) return;
    this.loadingLockIds.add(workspaceId);
    try {
      const sourceId = this.requireSource();
      const state = await this.root.request<OpenCodexWorkspaceLockState>({ type: "projectWorkspaces.lock.read",
        projectId: this.project.project.id, workspaceId, sourceId });
      runInAction(() => {
        const current = this.workspaces.find(item => item.id === workspaceId);
        if (this.lockGenerations.get(workspaceId) === generation && state.workspaceId === workspaceId
          && state.sourceId === sourceId && current?.sourceId === sourceId
          && current.path === state.workspacePath && current.removedAt === null
          && current.movePending !== true && current.removalPending !== true) this.lockStates.set(workspaceId, state);
      });
    } catch (error) {
      runInAction(() => {
        if (this.lockGenerations.get(workspaceId) === generation) this.error = errorMessage(error);
      });
    } finally {
      runInAction(() => {
        if (this.lockGenerations.get(workspaceId) === generation) this.loadingLockIds.delete(workspaceId);
      });
    }
  }

  /** Sends only reviewed plain lock fields; re-reads Git even after a lost response. */
  async setLock(state: OpenCodexWorkspaceLockState, locked: boolean, reason: string): Promise<void> {
    await this.perform(async () => {
      await this.root.request({ type: "projectWorkspaces.lock.update", input: {
        projectId: this.project.project.id, workspaceId: state.workspaceId, sourceId: state.sourceId,
        workspacePath: state.workspacePath, expectedReason: state.lockedReason, locked, reason
      } });
    });
    await this.loadLockState(state.workspaceId);
  }

  /** Moves to configured storage by default; a custom path is an explicit advanced alternative. */
  async move(workspaceId: string, rootId?: string, destinationPath?: string): Promise<void> {
    await this.perform(async () => {
      if (this.project.files.hasUnsavedWorkspaceDocuments(workspaceId)) {
        throw new Error("Save or close unsaved workspace documents before moving it.");
      }
      await this.root.request({ type: "projectWorkspaces.move", input: {
        projectId: this.project.project.id, workspaceId, sourceId: this.requireSource(), rootId, destinationPath
      } });
    });
  }

  /** Verifies frozen source facts after interruption without replaying the Git command. */
  async recoverMove(moveId: string): Promise<void> {
    await this.perform(async () => { await this.root.request({ type: "projectWorkspaces.moves.reconcile", moveId }); });
  }

  /** Reconnects a manually moved directory using plain, explicit transport identities. */
  async relocate(workspaceId: string, destinationPath: string, confirmIdentity: boolean): Promise<void> {
    await this.perform(async () => {
      if (this.project.files.hasUnsavedWorkspaceDocuments(workspaceId)) {
        throw new Error("Save or close unsaved workspace documents before relocating it.");
      }
      await this.root.request({ type: "projectWorkspaces.relocate", projectId: this.project.project.id,
        workspaceId, sourceId: this.requireSource(), destinationPath, confirmIdentity });
    });
    this.root.projectsStore.refreshProjects();
  }

  /** Refreshes current associations while retaining turn snapshots and unsaved documents. */
  private applyRelocation(previous: OpenCodexProjectWorkspace, workspace: OpenCodexProjectWorkspace): void {
    this.diskUsage.forget(workspace.id);
    this.lockGenerations.set(workspace.id, (this.lockGenerations.get(workspace.id) ?? 0) + 1);
    this.lockStates.delete(workspace.id);
    this.loadingLockIds.delete(workspace.id);
    this.project.files.closeRemovedWorkspace(workspace.id);
    const threads = new Map(this.project.threadListStore.threads.map(thread => [thread.id, thread]));
    for (const chat of this.project.chatsById.values()) threads.set(chat.thread.id, chat.thread);
    for (const thread of threads.values()) {
      if (thread.projectPath === previous.path && (thread.sourceId ?? previous.sourceId) === workspace.sourceId) {
        this.project.upsertThread({ ...thread, projectPath: workspace.path });
      }
    }
    const oldCommit = this.project.getGitStoreForWorkspace({ path: previous.path, sourceId: previous.sourceId,
      workspaceId: previous.id }).commitStore;
    const draft = oldCommit.commitMessage;
    this.project.getGitStoreForWorkspace({ path: workspace.path, sourceId: workspace.sourceId,
      workspaceId: workspace.id }).commitStore.setCommitMessage(draft);
    oldCommit.setCommitMessage("");
    if (workspace.isPrimary) this.project.setProject({ ...this.project.project, path: workspace.path });
    this.project.composeStore.reset();
  }

  /** Deletes only the explicit managed checkout; unsaved buffers are never discarded implicitly. */
  async remove(workspaceId: string): Promise<void> {
    await this.perform(async () => {
      if (this.project.files.hasUnsavedWorkspaceDocuments(workspaceId)) {
        throw new Error("Save or close unsaved workspace documents before removing it.");
      }
      await this.root.request({ type: "projectWorkspaces.remove", projectId: this.project.project.id,
        workspaceId, sourceId: this.requireSource() });
      this.project.files.closeRemovedWorkspace(workspaceId);
    });
  }

  /** Verifies completion after restart without replaying the physical deletion. */
  async recoverRemoval(removalId: string): Promise<void> {
    await this.perform(async () => {
      await this.root.request({ type: "projectWorkspaces.removals.reconcile", removalId });
    });
    for (const workspace of this.workspaces) {
      if (workspace.removedAt !== null) this.project.files.closeRemovedWorkspace(workspace.id);
    }
  }

  /** Discovers source-local checkouts without importing another project's ownership. */
  async discover(): Promise<void> {
    await this.perform(async () => {
      const result = await this.root.request<OpenCodexWorkspaceDiscoveryResult>({
        type: "projectWorkspaces.discover", projectId: this.project.project.id,
        sourceId: this.requireSource()
      });
      runInAction(() => { this.skipped = result.skipped; });
    });
  }

  /** Sends a plain creation intent; Git and source validation remain in the backend. */
  async create(destinationPath: string | undefined, start: OpenCodexWorkspaceStart, name?: string, rootId?: string): Promise<void> {
    await this.perform(async () => {
      await this.root.request({ type: "projectWorkspaces.create", input: {
        projectId: this.project.project.id, sourceId: this.requireSource(), destinationPath,
        name, rootId, start: { ...start }
      } });
    });
  }

  /** Saves the secondary name through a project-scoped metadata operation. */
  async rename(workspaceId: string, name: string): Promise<void> {
    await this.perform(async () => {
      await this.root.request({ type: "projectWorkspaces.rename",
        projectId: this.project.project.id, workspaceId, name });
    });
  }

  /** Changes only the reviewed organizational state; a fresh catalogue also resolves a lost response. */
  async setWorkStatus(workspace: OpenCodexProjectWorkspace, workStatus: OpenCodexWorkspaceWorkStatus): Promise<void> {
    const input = {
      projectId: this.project.project.id, workspaceId: workspace.id, sourceId: workspace.sourceId,
      workspacePath: workspace.path, workStatus, expectedWorkStatus: workspace.workStatus ?? "active",
      expectedCompletedAt: workspace.completedAt ?? null
    };
    await this.perform(async () => {
      if (workspace.isPrimary) throw new Error("The primary workspace has no editable work status.");
      await this.root.request({ type: "projectWorkspaces.workStatus.update", input });
    }, true);
  }

  /** Saves only this project's advisory retention preference, including while its source is offline. */
  async setRetentionDays(days: number | null): Promise<void> {
    await this.perform(async () => {
      if (!isWorkspaceRetention({ days })) throw new Error("Invalid workspace retention days.");
      const project = await this.root.request<OpenCodexProject>({
        type: "projects.preferences.update", projectId: this.project.project.id,
        patch: { workspaceRetention: { days } }
      });
      runInAction(() => this.project.setProject(project));
    }, true);
  }

  /** Selects a draft context or requests a verified transition for the selected conversation. */
  async select(workspaceId: string, threadId = this.project.selectedChatId): Promise<void> {
    if (threadId !== null) {
      const chat = this.project.chatsById.get(threadId);
      if (chat?.composer.isSubmitting === true) return;
      if (chat?.isLocalDraft === true) {
        if (!this.isBusy && !this.project.isReadOnlyFromCache) {
          this.project.drafts.selectWorkspace(threadId, workspaceId);
        }
        return;
      }
    }
    await this.perform(async () => {
      if (threadId !== null) {
        await this.root.request({ type: "threads.workspace.select", threadId, workspaceId });
        const workspace = this.workspaces.find((item) => item.id === workspaceId);
        const thread = this.project.chatsById.get(threadId)?.thread
          ?? this.project.threadListStore.findThread(threadId);
        if (workspace !== undefined && thread !== null) {
          runInAction(() => this.project.upsertThread({ ...thread, projectPath: workspace.path }));
        }
      } else {
        runInAction(() => { this.selectedId = workspaceId; });
      }
    });
  }

  /** Retries verification only; the backend never blindly repeats an uncertain Git creation. */
  async recoverCreation(creationId: string): Promise<void> {
    await this.perform(async () => {
      await this.root.request({ type: "projectWorkspaces.creations.reconcile", creationId });
    });
  }

  /** Exposes explicit recovery for a conversation whose transition response was lost. */
  async recoverThread(threadId = this.project.selectedChatId): Promise<void> {
    if (threadId === null) return;
    await this.perform(async () => {
      await this.root.request({ type: "threads.workspace.reconcile", threadId });
      this.project.openThread(threadId);
    });
  }

  /** Invalidates responses when the project tab closes. */
  dispose(): void {
    this.diskUsage.dispose();
    this.generation += 1;
    this.activityGeneration += 1;
    this.activityById.clear();
    this.isRefreshingManagement = false;
    for (const [id, generation] of this.lockGenerations) this.lockGenerations.set(id, generation + 1);
    this.loadingLockIds.clear();
  }

  /** Refreshes durable outcomes; only explicitly local metadata actions may run without a live source. */
  private async perform(action: () => Promise<void>, allowCachedMetadata = false): Promise<void> {
    if (this.isBusy || (this.project.isReadOnlyFromCache && !allowCachedMetadata)) return;
    this.isBusy = true;
    this.error = null;
    try {
      await action();
    } catch (error) {
      runInAction(() => { this.error = errorMessage(error); });
    } finally {
      await this.load();
      runInAction(() => { this.isBusy = false; });
    }
  }

  /** Refuses operations against an orphan project. */
  private requireSource(): string {
    const sourceId = this.project.project.sourceId;
    if (sourceId === null) throw new Error("Workspace requires a Codex source.");
    return sourceId;
  }
}

/** Preserves actionable errors returned by the source. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
