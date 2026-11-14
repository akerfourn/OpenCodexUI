import { makeAutoObservable, runInAction } from "mobx";
import type {
  OpenCodexGitSyncInspection, OpenCodexGitSyncOperation, OpenCodexGitSyncPlan,
  OpenCodexGitSyncRequest, OpenCodexGitSyncResult, OpenCodexGitSyncStrategy,
  OpenCodexGitSyncTarget, OpenCodexProject
} from "@open-codex-ui/opencodex-protocol";
import type { ProjectGitStore } from "./ProjectGitStore";
import { cloneProjectPreferences } from "../projectPreferencesDto";
import { readErrorMessage } from "./gitErrorMessage";

/** Keeps a worktree's synchronization review distinct from ordinary Git status refreshes. */
export class ProjectGitSyncStore {
  /** Whether the synchronization/recovery dialog is visible. */
  isOpen = false;
  /** Current explicit backend phase, used for progress and mutation guards. */
  phase: "inspect" | "plan" | "execute" | "continue" | "abort" | "stage" | "configure" | null = null;
  /** Last simple action outcome, retained outside the advanced dialog. */
  simpleResult: OpenCodexGitSyncResult | null = null;
  /** Last source-owned inspection and its translatable outcome. */
  result: OpenCodexGitSyncResult | null = null;
  /** Explicit remote selected for the next review. */
  remoteName = "";
  /** Destination branch, which may differ from the checked-out branch. */
  branchName = "";
  /** Whether to configure future tracking after a successful publication. */
  setUpstream = false;
  /** Integration strategy for this review. */
  strategy: OpenCodexGitSyncStrategy = "rebase";
  /** Whether the project-wide default is being persisted. */
  isSavingPreference = false;
  /** Localized by the view separately from backend Git diagnostics. */
  preferenceError: string | null = null;

  /** Binds review state to one explicit Git owner, including frozen workspace contexts. */
  constructor(private readonly parent: ProjectGitStore) {
    makeAutoObservable<ProjectGitSyncStore, "parent">(this, { parent: false }, { autoBind: true });
  }

  /** Whether a request owns this synchronization workflow. */
  get isBusy(): boolean { return this.phase !== null; }
  /** Whether closing the dialog could hide an in-flight working-tree mutation. */
  get isMutating(): boolean {
    return this.phase === "execute" || this.phase === "continue" || this.phase === "abort"
      || this.phase === "stage" || this.phase === "configure";
  }
  /** Latest local worktree observation, including persisted Git operations. */
  get inspection(): OpenCodexGitSyncInspection | null { return this.result?.inspection ?? null; }
  /** Immutable review waiting for execution. */
  get plan(): OpenCodexGitSyncPlan | null { return this.result?.plan ?? null; }
  /** Ongoing Git operation, recoverable even after reopening the application. */
  get operation(): OpenCodexGitSyncOperation | null { return this.inspection?.operation ?? null; }
  /** Persisted project preference; old projects use rebase for unpublished commits. */
  get defaultStrategy(): OpenCodexGitSyncStrategy { return this.parent.projectPreferences.git?.syncStrategy ?? "rebase"; }
  /** Vocabulary follows the existing application preference in every synchronization view. */
  get vocabulary(): "simple" | "technical" { return this.parent.settingsStore?.settings.versioningVocabulary ?? "simple"; }
  /** Repository defaults come from the same status snapshot as the visible counters. */
  get configuration() { return this.parent.statusStore.status.synchronization; }
  /** Branch identity reviewed before saving an exception. */
  get localBranch(): string | null { return this.parent.currentBranchName; }
  /** Whether source availability and other reference operations permit opening a review. */
  get canOpen(): boolean {
    const refs = this.parent.referencesStore;
    return this.parent.isAvailable && this.parent.statusStore.isRepository && !this.isBusy
      && !this.parent.statusStore.isLoading && !this.parent.commitStore.isCommitting
      && !refs.isPushing && !refs.isPulling && !refs.isFetchingUpdates && !refs.isSavingRemote
      && !refs.isCheckingOutBranch && !refs.isMergingBranch;
  }

  /** Exchanges changes with the usual destination without requiring an advanced review. */
  async simple(direction: "push" | "pull"): Promise<void> {
    if (!this.canOpen) return;
    this.parent.errorMessage = null;
    this.simpleResult = null;
    const response = await this.perform("execute", { ...this.scope(), type: "git.sync.simple", direction });
    runInAction(() => { this.simpleResult = response ?? this.result; });
    if (response?.outcome === "synchronized") await this.refreshLoadedReferences();
  }

  /** Saves a favorite or an override for the branch currently displayed by the editor. */
  async configure(patch: { favoriteRemote?: string; branchRemote?: string | null }): Promise<void> {
    if (!this.canOpen) return;
    this.simpleResult = null;
    await this.perform("configure", {
      ...this.scope(), type: "git.sync.configure", branchName: this.parent.currentBranchName,
      ...patch
    });
  }

  /** Opens with a fresh local inspection, then fetches a suggested destination for review. */
  async open(): Promise<void> {
    if (!this.canOpen) return;
    this.simpleResult = null;
    this.isOpen = true;
    this.strategy = this.defaultStrategy;
    this.preferenceError = null;
    this.result = null;
    this.parent.errorMessage = null;
    this.remoteName = "";
    this.branchName = "";
    this.setUpstream = false;
    const response = await this.perform("inspect", { ...this.scope(), type: "git.sync.inspect" });
    const inspection = response?.inspection;
    if (!this.isOpen || inspection == null || response?.outcome !== "inspected") return;
    const target = inspection.suggestedTarget;
    if (target !== null) {
      runInAction(() => {
        this.remoteName = target.remoteName;
        this.branchName = target.branchName;
        this.setUpstream = target.setUpstream;
      });
    }
    if (inspection.operation === null && target !== null) await this.analyze();
  }

  /** Allows closing a read-only analysis while keeping mutation progress visible. */
  close(): void { if (!this.isMutating) this.isOpen = false; }

  /** Invalidates a previous review whenever its destination or strategy changes. */
  setTarget(patch: Partial<OpenCodexGitSyncTarget>): void {
    if (this.isBusy) return;
    if (patch.remoteName !== undefined) this.remoteName = patch.remoteName;
    if (patch.branchName !== undefined) this.branchName = patch.branchName;
    if (patch.setUpstream !== undefined) this.setUpstream = patch.setUpstream;
    this.invalidateReview();
  }

  /** Changes the integration choice without silently changing the project default. */
  setStrategy(strategy: OpenCodexGitSyncStrategy): void {
    if (this.isBusy) return;
    this.strategy = strategy;
    this.invalidateReview();
  }

  /** Reads operation metadata without fetching or modifying any files. */
  async inspect(): Promise<OpenCodexGitSyncInspection | null> {
    if (this.isBusy) return null;
    const response = await this.perform("inspect", { ...this.scope(), type: "git.sync.inspect" });
    return response?.inspection ?? null;
  }

  /** Fetches the selected push endpoint and presents counts before any integration. */
  async analyze(): Promise<void> {
    if (this.isBusy || this.operation !== null || this.remoteName.length === 0 || this.branchName.trim().length === 0) return;
    await this.perform("plan", {
      ...this.scope(), type: "git.sync.plan", strategy: this.strategy,
      target: { remoteName: this.remoteName, branchName: this.branchName.trim(), setUpstream: this.setUpstream }
    });
  }

  /** Sends only a plain copy of the explicit review, never observable state. */
  async execute(): Promise<void> {
    if (this.isBusy || this.plan === null) return;
    const response = await this.perform("execute", { ...this.scope(), type: "git.sync.execute", plan: copySyncPlan(this.plan) });
    if (response !== null) await this.refreshLoadedReferences();
  }

  /** Continues staged resolutions, then requires a new destination review before sending. */
  async continueOperation(): Promise<void> {
    if (this.isBusy || this.operation === null || this.operation.kind === "other") return;
    const response = await this.perform("continue", {
      ...this.scope(), type: "git.sync.continue", operation: copyOperation(this.operation)
    });
    if (response?.outcome === "continued") {
      await this.refreshLoadedReferences();
    }
  }

  /** Aborts only the operation fingerprint currently displayed by this worktree. */
  async abortOperation(): Promise<void> {
    if (this.isBusy || this.operation === null || this.operation.kind === "other") return;
    const response = await this.perform("abort", {
      ...this.scope(), type: "git.sync.abort", operation: copyOperation(this.operation)
    });
    if (response !== null) await this.refreshLoadedReferences();
  }

  /** Stages one user-reviewed resolution; Git remains responsible for integration state. */
  async markResolved(path: string): Promise<void> {
    if (this.isBusy || !this.operation?.conflicts.includes(path)) return;
    await this.perform("stage", { ...this.scope(), type: "git.sync.resolve",
      operation: copyOperation(this.operation), path });
  }

  /** Saves just the selected project preference while preserving unrelated nested settings. */
  async saveDefaultStrategy(): Promise<void> {
    if (this.isBusy || this.isSavingPreference) return;
    this.isSavingPreference = true;
    this.preferenceError = null;
    const preferences = cloneProjectPreferences(this.parent.projectPreferences);
    preferences.git = { ...preferences.git, syncStrategy: this.strategy };
    try {
      const project = await this.parent.request<OpenCodexProject>({
        type: "projects.preferences.update", projectId: this.parent.projectId, patch: preferences
      });
      runInAction(() => { this.parent.setProject(project); });
    } catch (error) {
      runInAction(() => { this.preferenceError = readErrorMessage(error); });
    } finally {
      runInAction(() => { this.isSavingPreference = false; });
    }
  }

  /** Explicit physical scope; the Git owner injects its workspace identity into transport DTOs. */
  private scope() {
    return { projectId: this.parent.projectId, projectPath: this.parent.projectPath, sourceId: this.parent.sourceId };
  }

  /** Clears stale counts and errors when preparing a new destination review. */
  private invalidateReview(): void {
    if (this.result !== null) this.result = { ...this.result, plan: null, issue: null, details: null, outcome: "inspected" };
  }

  /** Runs a single phase, preserving main messages separately from technical error details. */
  private async perform(phase: NonNullable<ProjectGitSyncStore["phase"]>, request: OpenCodexGitSyncRequest) {
    this.phase = phase;
    if (this.result !== null) this.result = { ...this.result, plan: null };
    try {
      const response = await this.parent.request<OpenCodexGitSyncResult>(request);
      runInAction(() => {
        this.result = response;
        if (response.inspection !== null) this.parent.statusStore.applyStatus(response.inspection.status);
      });
      return response;
    } catch (error) {
      runInAction(() => { this.result = { outcome: "error", inspection: this.inspection, plan: null,
        issue: "gitFailed", details: readErrorMessage(error) }; });
      return null;
    } finally {
      runInAction(() => { this.phase = null; });
    }
  }

  /** Refreshes already viewed references after history changed, without loading unused panels. */
  private async refreshLoadedReferences(): Promise<void> {
    if (this.parent.referencesStore.hasLoadedBranches) await this.parent.referencesStore.loadBranches();
    if (this.parent.tagStore.hasLoadedTags) await this.parent.tagStore.loadTags();
    if (this.parent.logStore.hasLoadedLog) await this.parent.logStore.loadGitLog(true);
  }
}

/** Copies a MobX review into a structured-clone-compatible request payload. */
export function copySyncPlan(plan: OpenCodexGitSyncPlan): OpenCodexGitSyncPlan {
  return { target: { remoteName: plan.target.remoteName, branchName: plan.target.branchName, setUpstream: plan.target.setUpstream },
    pushUrl: plan.pushUrl, branchName: plan.branchName, localHead: plan.localHead, remoteHead: plan.remoteHead,
    aheadCount: plan.aheadCount, behindCount: plan.behindCount, strategy: plan.strategy, action: plan.action };
}

/** Copies the worktree operation fingerprint without leaking observable arrays. */
function copyOperation(operation: OpenCodexGitSyncOperation): OpenCodexGitSyncOperation {
  return { kind: operation.kind, fingerprint: operation.fingerprint, branchName: operation.branchName,
    conflicts: [...operation.conflicts] };
}
