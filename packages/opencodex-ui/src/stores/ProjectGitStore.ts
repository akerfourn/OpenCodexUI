/**
 * Holds Git state for one opened project.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexCommitMessageGenerationResult,
  OpenCodexGitBranch,
  OpenCodexGitBranchKind,
  OpenCodexGitCommitDetails,
  OpenCodexGitCommitResult,
  OpenCodexGitLogCommit,
  OpenCodexGitLogPage,
  OpenCodexGitRemote,
  OpenCodexGitStatus,
  OpenCodexGitTag,
  OpenCodexGitTagFetchResult,
  OpenCodexProject,
  OpenCodexProjectPreferences
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "./RootStore";
import { cloneProjectPreferences } from "./projectPreferencesDto";

const emptyGitStatus: OpenCodexGitStatus = {
  isRepository: false,
  aheadCount: 0,
  behindCount: 0,
  branchName: null,
  upstreamName: null,
  pendingCommitMessage: null,
  remotes: [],
  changedFiles: [],
  stagedFiles: []
};
const gitLogPageSize = 50;

/**
 * Stores Git status and actions for a project.
 */
export class ProjectGitStore {
  status: OpenCodexGitStatus = emptyGitStatus;
  commitMessage = "";
  branches: OpenCodexGitBranch[] = [];
  tags: OpenCodexGitTag[] = [];
  logCommits: OpenCodexGitLogCommit[] = [];
  commitDetailsByHash = new Map<string, OpenCodexGitCommitDetails>();
  selectedReferenceTagName: string | null = null;
  commitsSinceReferenceTag: number | null = null;
  errorMessage: string | null = null;
  branchErrorMessage: string | null = null;
  tagErrorMessage: string | null = null;
  tagWarningMessage: string | null = null;
  logErrorMessage: string | null = null;
  remoteErrorMessage: string | null = null;
  hasLoaded = false;
  hasLoadedBranches = false;
  hasLoadedTags = false;
  hasLoadedLog = false;
  hasMoreLogCommits = false;
  isLoading = false;
  isLoadingBranches = false;
  isLoadingTags = false;
  isLoadingLog = false;
  isFetchingTags = false;
  isLoadingRemotes = false;
  isCheckingOutBranch = false;
  isMergingBranch = false;
  isCreatingTag = false;
  isLoadingTagReference = false;
  loadingCommitDetailsHash: string | null = null;
  isCommitting = false;
  isGeneratingCommitMessage = false;
  isInitializingRepository = false;
  isSavingRemote = false;
  isPulling = false;
  isPushing = false;
  selectedChangedPaths: string[] = [];
  selectedStagedPaths: string[] = [];

  constructor(
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ProjectGitStore, "projectStore" | "root">(
      this,
      {
        projectStore: false,
        root: false
      },
      {
        autoBind: true
      }
    );
    this.applyProjectPreferences(projectStore.project.preferences);
  }

  get isAvailable(): boolean {
    return this.projectStore.isCodexSourceReady;
  }

  get changedFilesCount(): number {
    return this.status.changedFiles.length;
  }

  get stagedFilesCount(): number {
    return this.status.stagedFiles.length;
  }

  get canCommit(): boolean {
    return (
      this.stagedFilesCount > 0 &&
      this.commitMessage.trim().length > 0 &&
      !this.isCommitting &&
      !this.isGeneratingCommitMessage &&
      !this.isLoading
    );
  }

  get canGenerateCommitMessage(): boolean {
    return (
      this.stagedFilesCount > 0 &&
      !this.isLoading &&
      !this.isGeneratingCommitMessage &&
      this.isAvailable
    );
  }

  get commitGenerationModelLabel(): string | null {
    return this.root.appStore.settings.commitMessageModel;
  }

  get commitGenerationReasoningEffortLabel(): string | null {
    return this.root.appStore.settings.commitMessageReasoningEffort;
  }

  get canPush(): boolean {
    return (
      this.status.isRepository &&
      this.status.upstreamName !== null &&
      this.status.aheadCount > 0 &&
      !this.isLoading &&
      !this.isPushing
    );
  }

  get canPublishBranch(): boolean {
    return (
      this.status.isRepository &&
      this.status.branchName !== null &&
      this.status.upstreamName === null &&
      this.status.remotes.length > 0 &&
      !this.isLoading &&
      !this.isPushing
    );
  }

  get primaryRemote(): OpenCodexGitRemote | null {
    return this.status.remotes.find((remote) => remote.name === "origin")
      ?? this.status.remotes[0]
      ?? null;
  }

  get canPull(): boolean {
    return (
      this.status.isRepository &&
      this.status.upstreamName !== null &&
      this.status.behindCount > 0 &&
      !this.isLoading &&
      !this.isPulling
    );
  }

  setCommitMessage(value: string): void {
    if (this.isGeneratingCommitMessage) {
      return;
    }

    this.commitMessage = value;
  }

  getCommitDetails(hash: string): OpenCodexGitCommitDetails | null {
    return this.commitDetailsByHash.get(hash) ?? null;
  }

  applyProjectPreferences(preferences: OpenCodexProjectPreferences): void {
    const referenceTagName = normalizeNullableText(preferences.git?.referenceTagName ?? null);

    if (referenceTagName === this.selectedReferenceTagName) {
      return;
    }

    this.selectedReferenceTagName = referenceTagName;
    this.commitsSinceReferenceTag = null;

    if (referenceTagName !== null && this.status.isRepository) {
      void this.loadCommitsSinceReferenceTag(referenceTagName);
    }
  }

  toggleChangedPath(path: string): void {
    this.selectedChangedPaths = togglePath(this.selectedChangedPaths, path);
  }

  toggleStagedPath(path: string): void {
    this.selectedStagedPaths = togglePath(this.selectedStagedPaths, path);
  }

  async refresh(): Promise<void> {
    if (!this.isAvailable) {
      this.status = emptyGitStatus;
      this.hasLoaded = true;
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    try {
      const status = await this.root.request<OpenCodexGitStatus>({
        type: "git.status",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId
      });

      runInAction(() => {
        this.applyStatus(status);
        if (!status.isRepository) {
          this.clearTags();
        }
      });

      if (status.isRepository) {
        void this.loadTags();
      }
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
        this.hasLoaded = true;
      });
    }
  }

  async initializeRepository(): Promise<void> {
    if (!this.isAvailable || this.isInitializingRepository) {
      return;
    }

    this.isInitializingRepository = true;
    this.errorMessage = null;

    try {
      const status = await this.root.request<OpenCodexGitStatus>({
        type: "git.init",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId
      });

      runInAction(() => {
        this.applyStatus(status);
        if (!status.isRepository) {
          this.clearTags();
        }
      });
      if (status.isRepository) {
        void this.loadTags();
      }
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isInitializingRepository = false;
        this.hasLoaded = true;
      });
    }
  }

  async loadBranches(): Promise<void> {
    if (!this.isAvailable || !this.status.isRepository) {
      this.branches = [];
      this.hasLoadedBranches = true;
      return;
    }

    this.isLoadingBranches = true;
    this.branchErrorMessage = null;

    try {
      const branches = await this.root.request<OpenCodexGitBranch[]>({
        type: "git.branches",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId
      });

      runInAction(() => {
        this.branches = branches;
      });
    } catch (error) {
      runInAction(() => {
        this.branchErrorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isLoadingBranches = false;
        this.hasLoadedBranches = true;
      });
    }
  }

  async loadRemotes(): Promise<void> {
    if (!this.isAvailable || !this.status.isRepository) {
      this.status = {
        ...this.status,
        remotes: []
      };
      return;
    }

    this.isLoadingRemotes = true;
    this.remoteErrorMessage = null;

    try {
      const remotes = await this.root.request<OpenCodexGitRemote[]>({
        type: "git.remotes",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId
      });

      runInAction(() => {
        this.status = {
          ...this.status,
          remotes
        };
      });
    } catch (error) {
      runInAction(() => {
        this.remoteErrorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isLoadingRemotes = false;
      });
    }
  }

  async loadTags(): Promise<void> {
    if (!this.isAvailable || !this.status.isRepository) {
      this.tags = [];
      this.selectedReferenceTagName = null;
      this.commitsSinceReferenceTag = null;
      this.hasLoadedTags = true;
      return;
    }

    this.isLoadingTags = true;
    this.tagErrorMessage = null;
    this.tagWarningMessage = null;

    try {
      await this.refreshLocalTags();
    } catch (error) {
      runInAction(() => {
        this.tagErrorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isLoadingTags = false;
        this.hasLoadedTags = true;
      });
    }
  }

  async loadGitLog(reset: boolean): Promise<void> {
    if (!this.isAvailable || !this.status.isRepository || this.isLoadingLog) {
      return;
    }

    const skip = reset ? 0 : this.logCommits.length;

    this.isLoadingLog = true;
    this.logErrorMessage = null;

    try {
      const page = await this.root.request<OpenCodexGitLogPage>({
        type: "git.log",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId,
        limit: gitLogPageSize,
        skip
      });

      runInAction(() => {
        if (reset) {
          this.commitDetailsByHash.clear();
        }
        this.logCommits = reset ? page.commits : mergeLogCommits(this.logCommits, page.commits);
        this.hasMoreLogCommits = page.hasMore;
        this.hasLoadedLog = true;
      });
    } catch (error) {
      runInAction(() => {
        this.logErrorMessage = readErrorMessage(error);
        this.hasLoadedLog = true;
      });
    } finally {
      runInAction(() => {
        this.isLoadingLog = false;
      });
    }
  }

  async loadMoreGitLog(): Promise<void> {
    if (!this.hasMoreLogCommits) {
      return;
    }

    await this.loadGitLog(false);
  }

  async loadCommitDetails(hash: string): Promise<void> {
    const normalizedHash = hash.trim();

    if (
      !this.isAvailable ||
      !this.status.isRepository ||
      normalizedHash.length === 0 ||
      this.commitDetailsByHash.has(normalizedHash)
    ) {
      return;
    }

    this.loadingCommitDetailsHash = normalizedHash;
    this.logErrorMessage = null;

    try {
      const details = await this.root.request<OpenCodexGitCommitDetails>({
        type: "git.commit.details",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId,
        hash: normalizedHash
      });

      runInAction(() => {
        this.commitDetailsByHash.set(normalizedHash, details);
      });
    } catch (error) {
      runInAction(() => {
        this.logErrorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.loadingCommitDetailsHash = null;
      });
    }
  }

  async fetchTags(): Promise<void> {
    if (!this.isAvailable || !this.status.isRepository || this.isFetchingTags) {
      return;
    }

    this.isFetchingTags = true;
    this.tagErrorMessage = null;
    this.tagWarningMessage = null;

    try {
      const result = await this.root.request<OpenCodexGitTagFetchResult>({
        type: "git.tags.fetch",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId
      });

      runInAction(() => {
        this.tags = result.tags;
        this.tagWarningMessage = result.warning;
        this.keepSelectedReferenceTag();
      });

      if (this.selectedReferenceTagName !== null) {
        await this.loadCommitsSinceReferenceTag(this.selectedReferenceTagName);
      }
    } catch (error) {
      runInAction(() => {
        this.tagErrorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isFetchingTags = false;
        this.hasLoadedTags = true;
      });
    }
  }

  async checkoutBranch(branch: OpenCodexGitBranch): Promise<boolean> {
    return await this.applyBranchStatusRequest("git.checkout", {
      branchName: branch.name,
      branchKind: branch.kind
    });
  }

  async createBranch(branchName: string): Promise<boolean> {
    return await this.applyBranchStatusRequest("git.branch.create", {
      branchName: branchName.trim()
    });
  }

  async mergeBranch(branch: OpenCodexGitBranch): Promise<boolean> {
    return await this.applyMergeStatusRequest(branch.name);
  }

  async createTag(tagName: string): Promise<boolean> {
    const normalizedTagName = tagName.trim();

    if (!this.isAvailable || this.isCreatingTag || normalizedTagName.length === 0) {
      return false;
    }

    this.isCreatingTag = true;
    this.tagErrorMessage = null;
    this.tagWarningMessage = null;

    try {
      const tags = await this.root.request<OpenCodexGitTag[]>({
        type: "git.tag.create",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId,
        tagName: normalizedTagName
      });

      runInAction(() => {
        this.tags = tags;
        this.selectedReferenceTagName = normalizedTagName;
      });
      const loaded = await this.loadCommitsSinceReferenceTag(normalizedTagName);

      if (loaded) {
        this.persistReferenceTagPreference(normalizedTagName);
      }

      return true;
    } catch (error) {
      runInAction(() => {
        this.tagErrorMessage = readErrorMessage(error);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isCreatingTag = false;
      });
    }
  }

  async selectReferenceTag(tagName: string): Promise<boolean> {
    const normalizedTagName = tagName.trim();

    if (!this.isAvailable || normalizedTagName.length === 0) {
      return false;
    }

    runInAction(() => {
      this.selectedReferenceTagName = normalizedTagName;
      this.commitsSinceReferenceTag = null;
    });

    const loaded = await this.loadCommitsSinceReferenceTag(normalizedTagName);

    if (loaded) {
      this.persistReferenceTagPreference(normalizedTagName);
    }

    return loaded;
  }

  async stageSelected(): Promise<void> {
    await this.stagePaths(this.selectedChangedPaths);
  }

  async stageAll(): Promise<void> {
    await this.stagePaths(this.status.changedFiles.map((file) => file.path));
  }

  async stagePath(path: string): Promise<void> {
    await this.stagePaths([path]);
  }

  async unstageSelected(): Promise<void> {
    await this.unstagePaths(this.selectedStagedPaths);
  }

  async unstageAll(): Promise<void> {
    await this.unstagePaths(this.status.stagedFiles.map((file) => file.path));
  }

  async unstagePath(path: string): Promise<void> {
    await this.unstagePaths([path]);
  }

  async commit(): Promise<void> {
    if (!this.canCommit) {
      return;
    }

    this.isCommitting = true;
    this.errorMessage = null;

    try {
      await this.root.request<OpenCodexGitCommitResult>({
        type: "git.commit",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId,
        message: this.commitMessage
      });

      runInAction(() => {
        this.commitMessage = "";
      });
      await this.refresh();
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isCommitting = false;
      });
    }
  }

  async generateCommitMessage(instruction: string): Promise<void> {
    if (!this.canGenerateCommitMessage) {
      return;
    }

    this.isGeneratingCommitMessage = true;
    this.errorMessage = null;

    try {
      const result = await this.root.request<OpenCodexCommitMessageGenerationResult>({
        type: "git.commitMessage.generate",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId,
        instruction,
        model: this.root.appStore.settings.commitMessageModel,
        reasoningEffort: this.root.appStore.settings.commitMessageReasoningEffort,
        language: this.root.appStore.settings.commitMessageLanguage
      });

      runInAction(() => {
        this.commitMessage = result.message;
      });
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isGeneratingCommitMessage = false;
      });
    }
  }

  async upsertRemote(name: string, url: string): Promise<boolean> {
    if (!this.isAvailable || !this.status.isRepository || this.isSavingRemote) {
      return false;
    }

    this.isSavingRemote = true;
    this.remoteErrorMessage = null;
    this.errorMessage = null;

    try {
      const status = await this.root.request<OpenCodexGitStatus>({
        type: "git.remote.upsert",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId,
        name,
        url
      });

      runInAction(() => {
        this.applyStatus(status);
        if (!status.isRepository) {
          this.clearTags();
        }
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.remoteErrorMessage = readErrorMessage(error);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isSavingRemote = false;
      });
    }
  }

  async push(): Promise<void> {
    if (!this.canPush) {
      return;
    }

    this.isPushing = true;
    this.errorMessage = null;

    try {
      const status = await this.root.request<OpenCodexGitStatus>({
        type: "git.push",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId
      });

      runInAction(() => {
        this.applyStatus(status);
        if (!status.isRepository) {
          this.clearTags();
        }
      });
      if (status.isRepository) {
        void this.loadTags();
      }
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isPushing = false;
      });
    }
  }

  async publishBranch(): Promise<void> {
    if (!this.canPublishBranch) {
      return;
    }

    this.isPushing = true;
    this.errorMessage = null;

    try {
      const status = await this.root.request<OpenCodexGitStatus>({
        type: "git.branch.publish",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId
      });

      runInAction(() => {
        this.applyStatus(status);
        if (!status.isRepository) {
          this.clearTags();
        }
      });
      await this.loadBranches();
      if (status.isRepository) {
        void this.loadTags();
      }
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isPushing = false;
      });
    }
  }

  async pull(): Promise<void> {
    if (!this.canPull) {
      return;
    }

    this.isPulling = true;
    this.errorMessage = null;

    try {
      const status = await this.root.request<OpenCodexGitStatus>({
        type: "git.pull",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId
      });

      runInAction(() => {
        this.applyStatus(status);
        if (!status.isRepository) {
          this.clearTags();
        }
      });
      if (status.isRepository) {
        void this.loadTags();
      }
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isPulling = false;
      });
    }
  }

  private async stagePaths(paths: string[]): Promise<void> {
    const normalizedPaths = normalizePaths(paths);

    if (normalizedPaths.length === 0) {
      return;
    }

    await this.applyGitStatusRequest("git.stage", normalizedPaths);
  }

  private async unstagePaths(paths: string[]): Promise<void> {
    const normalizedPaths = normalizePaths(paths);

    if (normalizedPaths.length === 0) {
      return;
    }

    await this.applyGitStatusRequest("git.unstage", normalizedPaths);
  }

  private async applyGitStatusRequest(type: "git.stage" | "git.unstage", paths: string[]): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const status = await this.root.request<OpenCodexGitStatus>({
        type,
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId,
        paths
      });

      runInAction(() => {
        this.applyStatus(status);
      });
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  private async applyBranchStatusRequest(
    type: "git.checkout",
    request: { branchName: string; branchKind: OpenCodexGitBranchKind }
  ): Promise<boolean>;
  private async applyBranchStatusRequest(
    type: "git.branch.create",
    request: { branchName: string }
  ): Promise<boolean>;
  private async applyBranchStatusRequest(
    type: "git.checkout" | "git.branch.create",
    request: { branchName: string; branchKind?: OpenCodexGitBranchKind }
  ): Promise<boolean> {
    if (!this.isAvailable || this.isCheckingOutBranch) {
      return false;
    }

    this.isCheckingOutBranch = true;
    this.branchErrorMessage = null;
    this.errorMessage = null;

    try {
      const status = type === "git.checkout"
        ? await this.root.request<OpenCodexGitStatus>({
          type,
          projectPath: this.projectStore.projectPath,
          sourceId: this.projectStore.project.sourceId,
          branchName: request.branchName,
          branchKind: request.branchKind ?? "local"
        })
        : await this.root.request<OpenCodexGitStatus>({
          type,
          projectPath: this.projectStore.projectPath,
          sourceId: this.projectStore.project.sourceId,
          branchName: request.branchName
        });

      runInAction(() => {
        this.applyStatus(status);
        if (!status.isRepository) {
          this.clearTags();
        }
      });
      await this.loadBranches();
      if (status.isRepository) {
        await this.loadTags();
      }
      return true;
    } catch (error) {
      runInAction(() => {
        this.branchErrorMessage = readErrorMessage(error);
      });
      await this.refresh();
      return false;
    } finally {
      runInAction(() => {
        this.isCheckingOutBranch = false;
      });
    }
  }

  private async applyMergeStatusRequest(branchName: string): Promise<boolean> {
    const normalizedBranchName = branchName.trim();

    if (!this.isAvailable || this.isMergingBranch || normalizedBranchName.length === 0) {
      return false;
    }

    this.isMergingBranch = true;
    this.branchErrorMessage = null;
    this.errorMessage = null;

    try {
      const status = await this.root.request<OpenCodexGitStatus>({
        type: "git.merge",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId,
        branchName: normalizedBranchName
      });

      runInAction(() => {
        this.applyStatus(status);
        if (!status.isRepository) {
          this.clearTags();
        }
      });
      await this.loadBranches();
      if (status.isRepository) {
        await this.loadTags();
      }
      return true;
    } catch (error) {
      runInAction(() => {
        this.branchErrorMessage = readErrorMessage(error);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isMergingBranch = false;
      });
    }
  }

  private applyStatus(status: OpenCodexGitStatus): void {
    this.status = status;

    if (this.commitMessage.trim().length === 0 && status.pendingCommitMessage !== null) {
      this.commitMessage = status.pendingCommitMessage;
    }

    this.selectedChangedPaths = keepExistingPaths(
      this.selectedChangedPaths,
      status.changedFiles.map((file) => file.path)
    );
    this.selectedStagedPaths = keepExistingPaths(
      this.selectedStagedPaths,
      status.stagedFiles.map((file) => file.path)
    );
  }

  private async loadCommitsSinceReferenceTag(tagName: string): Promise<boolean> {
    this.isLoadingTagReference = true;
    this.tagErrorMessage = null;

    try {
      const count = await this.root.request<number>({
        type: "git.tag.commitsSince",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId,
        tagName
      });

      runInAction(() => {
        this.commitsSinceReferenceTag = count;
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.tagErrorMessage = readErrorMessage(error);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isLoadingTagReference = false;
      });
    }
  }

  private async refreshLocalTags(): Promise<void> {
    const tags = await this.root.request<OpenCodexGitTag[]>({
      type: "git.tags",
      projectPath: this.projectStore.projectPath,
      sourceId: this.projectStore.project.sourceId
    });

    runInAction(() => {
      this.tags = tags;
      this.tagWarningMessage = null;
      this.keepSelectedReferenceTag();
    });

    if (this.selectedReferenceTagName !== null) {
      await this.loadCommitsSinceReferenceTag(this.selectedReferenceTagName);
    }
  }

  private keepSelectedReferenceTag(): void {
    if (this.selectedReferenceTagName === null) {
      this.commitsSinceReferenceTag = null;
      return;
    }

    const stillExists = this.tags.some((tag) => tag.name === this.selectedReferenceTagName);

    if (!stillExists) {
      this.selectedReferenceTagName = null;
      this.commitsSinceReferenceTag = null;
      this.persistReferenceTagPreference(null);
    }
  }

  private clearTags(): void {
    this.tags = [];
    this.selectedReferenceTagName = null;
    this.commitsSinceReferenceTag = null;
    this.hasLoadedTags = true;
    this.tagErrorMessage = null;
    this.tagWarningMessage = null;
  }

  clearLog(): void {
    this.logCommits = [];
    this.commitDetailsByHash.clear();
    this.hasLoadedLog = false;
    this.hasMoreLogCommits = false;
    this.isLoadingLog = false;
    this.loadingCommitDetailsHash = null;
    this.logErrorMessage = null;
  }

  private persistReferenceTagPreference(referenceTagName: string | null): void {
    const currentPreferences = cloneProjectPreferences(this.projectStore.project.preferences);
    const preferences: OpenCodexProjectPreferences = {
      ...currentPreferences,
      git: {
        ...currentPreferences.git,
        referenceTagName
      }
    };

    void this.root.request<OpenCodexProject>({
      type: "projects.preferences.update",
      projectId: this.projectStore.project.id,
      patch: preferences
    }).then((project) => {
      runInAction(() => {
        this.projectStore.setProject(project);
      });
    }).catch((error) => {
      runInAction(() => {
        this.tagErrorMessage = readErrorMessage(error);
      });
    });
  }
}

function togglePath(paths: string[], path: string): string[] {
  if (paths.includes(path)) {
    return paths.filter((entry) => entry !== path);
  }

  return [...paths, path];
}

function keepExistingPaths(paths: string[], availablePaths: string[]): string[] {
  const availablePathSet = new Set(availablePaths);
  return paths.filter((path) => availablePathSet.has(path));
}

function mergeLogCommits(
  currentCommits: OpenCodexGitLogCommit[],
  nextCommits: OpenCodexGitLogCommit[]
): OpenCodexGitLogCommit[] {
  const knownHashes = new Set(currentCommits.map((commit) => commit.hash));
  const uniqueNextCommits = nextCommits.filter((commit) => !knownHashes.has(commit.hash));
  return [...currentCommits, ...uniqueNextCommits];
}

function normalizePaths(paths: string[]): string[] {
  return paths.map((path) => path.trim()).filter((path) => path.length > 0);
}

function normalizeNullableText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return String(error);
}
