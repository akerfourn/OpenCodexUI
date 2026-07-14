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
  OpenCodexGitFile,
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
import {
  findDeferredPath,
  isPathDeferred,
  mergeDeferredPaths,
  normalizeDeferredPath,
  normalizeDeferredPaths,
  removeDeferredPath
} from "./gitDeferredPaths";
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
  /** Last Git status snapshot for the project. */
  status: OpenCodexGitStatus = emptyGitStatus;
  /** Commit message currently edited in the Git panel. */
  commitMessage = "";
  /** Local and remote branches loaded for branch actions. */
  branches: OpenCodexGitBranch[] = [];
  /** Tags loaded for release/reference workflows. */
  tags: OpenCodexGitTag[] = [];
  /** Git log entries loaded in pages. */
  logCommits: OpenCodexGitLogCommit[] = [];
  /** Commit details cached by commit hash. */
  commitDetailsByHash = new Map<string, OpenCodexGitCommitDetails>();
  /** Tag selected as the reference point for commit distance. */
  selectedReferenceTagName: string | null = null;
  /** Number of commits since the selected reference tag. */
  commitsSinceReferenceTag: number | null = null;
  /** Relative files or directories excluded from OpenCodexUI staging actions. */
  deferredPaths: string[] = [];
  /** Last generic Git error shown by the panel. */
  errorMessage: string | null = null;
  /** Last branch operation error shown by branch modals. */
  branchErrorMessage: string | null = null;
  /** Last tag operation error shown by tag modals. */
  tagErrorMessage: string | null = null;
  /** Last Git log loading error. */
  logErrorMessage: string | null = null;
  /** Last remote configuration error. */
  remoteErrorMessage: string | null = null;
  /** Whether an initial status request has completed. */
  hasLoaded = false;
  /** Whether branches have been loaded at least once. */
  hasLoadedBranches = false;
  /** Whether tags have been loaded at least once. */
  hasLoadedTags = false;
  /** Whether the Git log has been loaded at least once. */
  hasLoadedLog = false;
  /** Whether more Git log pages are available. */
  hasMoreLogCommits = false;
  /** Whether Git status is loading or mutating. */
  isLoading = false;
  /** Whether branches are loading. */
  isLoadingBranches = false;
  /** Whether tags are loading. */
  isLoadingTags = false;
  /** Whether Git log commits are loading. */
  isLoadingLog = false;
  /** Whether remote tags are being fetched. */
  isFetchingTags = false;
  /** Whether remotes are loading. */
  isLoadingRemotes = false;
  /** Whether a checkout or branch creation is in flight. */
  isCheckingOutBranch = false;
  /** Whether a merge operation is in flight. */
  isMergingBranch = false;
  /** Whether a tag creation is in flight. */
  isCreatingTag = false;
  /** Whether commits since the reference tag are loading. */
  isLoadingTagReference = false;
  /** Commit hash currently loading detailed data. */
  loadingCommitDetailsHash: string | null = null;
  /** Whether a commit operation is in flight. */
  isCommitting = false;
  /** Whether the commit message generator is running. */
  isGeneratingCommitMessage = false;
  /** Whether repository initialization is in flight. */
  isInitializingRepository = false;
  /** Whether remote configuration is being saved. */
  isSavingRemote = false;
  /** Whether deferred-path preferences are being persisted. */
  isUpdatingDeferredPaths = false;
  /** Whether a pull operation is in flight. */
  isPulling = false;
  /** Whether a push or branch publication is in flight. */
  isPushing = false;
  /** Changed file paths selected for staging. */
  selectedChangedPaths: string[] = [];
  /** Staged file paths selected for unstaging. */
  selectedStagedPaths: string[] = [];

  /**
   * Creates the Git store for one project.
   *
   * @param projectStore Owning project store.
   * @param root Root store used for backend requests.
   */
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

  /** Whether Git actions can run for the project source. */
  get isAvailable(): boolean {
    return this.projectStore.isCodexSourceReady;
  }

  /** Number of unstaged changed files. */
  get changedFilesCount(): number {
    return this.stageableChangedFiles.length;
  }

  /** Files with unstaged changes that remain in the staging workflow. */
  get stageableChangedFiles(): OpenCodexGitFile[] {
    return this.status.changedFiles.filter((file) => !this.isPathDeferred(file.path));
  }

  /** Files with unstaged changes currently deferred in OpenCodexUI. */
  get deferredChangedFiles(): OpenCodexGitFile[] {
    return this.status.changedFiles.filter((file) => this.isPathDeferred(file.path));
  }

  /** Number of unstaged files currently deferred in OpenCodexUI. */
  get deferredFilesCount(): number {
    return this.deferredChangedFiles.length;
  }

  /** Whether a Git action should wait for a status or preference operation. */
  get isBusy(): boolean {
    return this.isLoading || this.isUpdatingDeferredPaths;
  }

  /** Number of staged files. */
  get stagedFilesCount(): number {
    return this.status.stagedFiles.length;
  }

  /** Whether the current staged state and message can be committed. */
  get canCommit(): boolean {
    return (
      this.stagedFilesCount > 0 &&
      this.commitMessage.trim().length > 0 &&
      !this.isCommitting &&
      !this.isGeneratingCommitMessage &&
      !this.isBusy
    );
  }

  /** Whether a commit message can be generated for staged files. */
  get canGenerateCommitMessage(): boolean {
    return (
      this.stagedFilesCount > 0 &&
      !this.isBusy &&
      !this.isGeneratingCommitMessage &&
      this.isAvailable
    );
  }

  /** Model configured for commit message generation. */
  get commitGenerationModelLabel(): string | null {
    return this.root.appStore.settings.commitMessageModel;
  }

  /** Reasoning effort configured for commit message generation. */
  get commitGenerationReasoningEffortLabel(): string | null {
    return this.root.appStore.settings.commitMessageReasoningEffort;
  }

  /** Whether local commits can be pushed to the configured upstream. */
  get canPush(): boolean {
    return (
      this.status.isRepository &&
      this.status.upstreamName !== null &&
      this.status.aheadCount > 0 &&
      !this.isLoading &&
      !this.isPushing
    );
  }

  /** Whether the current branch can be published to a remote. */
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

  /** Preferred remote used for publication hints. */
  get primaryRemote(): OpenCodexGitRemote | null {
    return this.status.remotes.find((remote) => remote.name === "origin")
      ?? this.status.remotes[0]
      ?? null;
  }

  /** Whether remote commits can be pulled from the configured upstream. */
  get canPull(): boolean {
    return (
      this.status.isRepository &&
      this.status.upstreamName !== null &&
      this.status.behindCount > 0 &&
      !this.isLoading &&
      !this.isPulling
    );
  }

  /**
   * Updates the editable commit message unless generation is in progress.
   *
   * @param value Commit message text.
   */
  setCommitMessage(value: string): void {
    if (this.isGeneratingCommitMessage) {
      return;
    }

    this.commitMessage = value;
  }

  /**
   * Reads cached commit details by hash.
   *
   * @param hash Commit hash.
   * @returns Commit details, or `null`.
   */
  getCommitDetails(hash: string): OpenCodexGitCommitDetails | null {
    return this.commitDetailsByHash.get(hash) ?? null;
  }

  /**
   * Applies Git preferences from project metadata.
   *
   * @param preferences Project preferences.
   */
  applyProjectPreferences(preferences: OpenCodexProjectPreferences): void {
    const referenceTagName = normalizeNullableText(preferences.git?.referenceTagName ?? null);
    const deferredPaths = normalizeDeferredPaths(preferences.git?.deferredPaths ?? []);

    this.deferredPaths = deferredPaths;
    this.selectedChangedPaths = keepExistingPaths(
      this.selectedChangedPaths,
      this.stageableChangedFiles.map((file) => file.path)
    );

    if (referenceTagName === this.selectedReferenceTagName) {
      return;
    }

    this.selectedReferenceTagName = referenceTagName;
    this.commitsSinceReferenceTag = null;

    if (referenceTagName !== null && this.status.isRepository) {
      void this.loadCommitsSinceReferenceTag(referenceTagName);
    }
  }

  /**
   * Toggles one changed path selection.
   *
   * @param path File path.
   */
  toggleChangedPath(path: string): void {
    if (this.isPathDeferred(path)) {
      return;
    }

    this.selectedChangedPaths = togglePath(this.selectedChangedPaths, path);
  }

  /**
   * Checks whether a path is covered by a deferred file or directory.
   *
   * @param path Relative Git path.
   * @returns `true` when OpenCodexUI should exclude the path from staging.
   */
  isPathDeferred(path: string): boolean {
    return isPathDeferred(path, this.deferredPaths);
  }

  /**
   * Finds the deferred entry covering one changed file.
   *
   * @param path Relative Git file path.
   * @returns Matching deferred entry, or `null`.
   */
  getDeferredPathFor(path: string): string | null {
    return findDeferredPath(path, this.deferredPaths);
  }

  /**
   * Defers selected changed files from OpenCodexUI staging actions.
   *
   * @returns Promise resolved when the preference update completes.
   */
  async deferSelected(): Promise<void> {
    await this.updateDeferredPaths(mergeDeferredPaths(this.deferredPaths, this.selectedChangedPaths));
  }

  /**
   * Defers one file or directory path from OpenCodexUI staging actions.
   *
   * @param path Relative file or directory path.
   * @returns Promise resolved when the preference update completes.
   */
  async deferPath(path: string): Promise<void> {
    const normalizedPath = normalizeDeferredPath(path);

    if (normalizedPath === null) {
      return;
    }

    await this.updateDeferredPaths(mergeDeferredPaths(this.deferredPaths, [normalizedPath]));
  }

  /**
   * Restores one deferred file or directory entry to the staging workflow.
   *
   * @param path Deferred entry to restore.
   * @returns Promise resolved when the preference update completes.
   */
  async restoreDeferredPath(path: string): Promise<void> {
    await this.updateDeferredPaths(removeDeferredPath(this.deferredPaths, path));
  }

  /**
   * Restores every deferred path to the staging workflow.
   *
   * @returns Promise resolved when the preference update completes.
   */
  async restoreAllDeferred(): Promise<void> {
    await this.updateDeferredPaths([]);
  }

  /**
   * Toggles one staged path selection.
   *
   * @param path File path.
   */
  toggleStagedPath(path: string): void {
    this.selectedStagedPaths = togglePath(this.selectedStagedPaths, path);
  }

  /**
   * Refreshes Git status and dependent tag state.
   *
   * @returns Promise resolved when refresh completes.
   */
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

  /**
   * Initializes a Git repository in the project folder.
   *
   * @returns Promise resolved when initialization completes.
   */
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

  /**
   * Loads local and remote branches.
   *
   * @returns Promise resolved when branches are loaded.
   */
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

  /**
   * Loads configured Git remotes.
   *
   * @returns Promise resolved when remotes are loaded.
   */
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

  /**
   * Loads local Git tags and updates the selected reference tag.
   *
   * @returns Promise resolved when tags are loaded.
   */
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

  /**
   * Loads one page of Git log commits.
   *
   * @param reset Whether to replace existing log rows.
   * @returns Promise resolved when the page is loaded.
   */
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

  /**
   * Loads the next Git log page when available.
   *
   * @returns Promise resolved when loading completes.
   */
  async loadMoreGitLog(): Promise<void> {
    if (!this.hasMoreLogCommits) {
      return;
    }

    await this.loadGitLog(false);
  }

  /**
   * Loads details for one commit hash.
   *
   * @param hash Commit hash.
   * @returns Promise resolved when details are loaded.
   */
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

  /**
   * Fetches tags from remotes and reloads local tag state.
   *
   * @returns Promise resolved when fetch completes.
   */
  async fetchTags(): Promise<void> {
    if (!this.isAvailable || !this.status.isRepository || this.isFetchingTags) {
      return;
    }

    this.isFetchingTags = true;
    this.tagErrorMessage = null;

    try {
      const result = await this.root.request<OpenCodexGitTagFetchResult>({
        type: "git.tags.fetch",
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId
      });

      runInAction(() => {
        this.tags = result.tags;
        this.keepSelectedReferenceTag();
      });

      if (result.warning !== null) {
        this.reportTagFetchWarning(result.warning);
      }

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

  /**
   * Checks out an existing branch.
   *
   * @param branch Branch to checkout.
   * @returns Whether checkout succeeded.
   */
  async checkoutBranch(branch: OpenCodexGitBranch): Promise<boolean> {
    return await this.applyBranchStatusRequest("git.checkout", {
      branchName: branch.name,
      branchKind: branch.kind
    });
  }

  /**
   * Creates and checks out a local branch.
   *
   * @param branchName New branch name.
   * @returns Whether creation succeeded.
   */
  async createBranch(branchName: string): Promise<boolean> {
    return await this.applyBranchStatusRequest("git.branch.create", {
      branchName: branchName.trim()
    });
  }

  /**
   * Merges a local branch into the current branch.
   *
   * @param branch Branch to merge.
   * @returns Whether merge succeeded.
   */
  async mergeBranch(branch: OpenCodexGitBranch): Promise<boolean> {
    return await this.applyMergeStatusRequest(branch.name);
  }

  /**
   * Creates a lightweight tag and selects it as reference.
   *
   * @param tagName Tag name.
   * @returns Whether creation succeeded.
   */
  async createTag(tagName: string): Promise<boolean> {
    const normalizedTagName = tagName.trim();

    if (!this.isAvailable || this.isCreatingTag || normalizedTagName.length === 0) {
      return false;
    }

    this.isCreatingTag = true;
    this.tagErrorMessage = null;

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

  /**
   * Selects a tag used as release/reference point.
   *
   * @param tagName Tag name.
   * @returns Whether commit distance could be loaded.
   */
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

  /**
   * Stages selected changed files.
   */
  async stageSelected(): Promise<void> {
    await this.stagePaths(this.selectedChangedPaths.filter((path) => !this.isPathDeferred(path)));
  }

  /**
   * Stages all changed files.
   */
  async stageAll(): Promise<void> {
    await this.stagePaths(this.stageableChangedFiles.map((file) => file.path));
  }

  /**
   * Stages one changed file path.
   *
   * @param path File path.
   */
  async stagePath(path: string): Promise<void> {
    if (this.isPathDeferred(path)) {
      return;
    }

    await this.stagePaths([path]);
  }

  /**
   * Unstages selected staged files.
   */
  async unstageSelected(): Promise<void> {
    await this.unstagePaths(this.selectedStagedPaths);
  }

  /**
   * Unstages all staged files.
   */
  async unstageAll(): Promise<void> {
    await this.unstagePaths(this.status.stagedFiles.map((file) => file.path));
  }

  /**
   * Unstages one file path.
   *
   * @param path File path.
   */
  async unstagePath(path: string): Promise<void> {
    await this.unstagePaths([path]);
  }

  /**
   * Creates a Git commit with the current staged files and message.
   *
   * @returns Promise resolved when commit completes.
   */
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

  /**
   * Generates a commit message from staged changes.
   *
   * @param instruction Optional user instruction.
   * @returns Promise resolved when generation completes.
   */
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

  /**
   * Creates or updates a Git remote.
   *
   * @param name Remote name.
   * @param url Remote URL.
   * @returns Whether saving succeeded.
   */
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

  /**
   * Pushes local commits to the configured upstream.
   *
   * @returns Promise resolved when push completes.
   */
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

  /**
   * Publishes the current branch and configures its upstream.
   *
   * @returns Promise resolved when publication completes.
   */
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

  /**
   * Pulls remote commits from the configured upstream.
   *
   * @returns Promise resolved when pull completes.
   */
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

  /**
   * Stages normalized file paths.
   *
   * @param paths File paths.
   */
  private async stagePaths(paths: string[]): Promise<void> {
    const normalizedPaths = normalizePaths(paths);

    if (normalizedPaths.length === 0) {
      return;
    }

    await this.applyGitStatusRequest("git.stage", normalizedPaths);
  }

  /**
   * Persists a new project-local deferred path collection.
   *
   * @param nextPaths Desired normalized deferred paths.
   */
  private async updateDeferredPaths(nextPaths: string[]): Promise<void> {
    const normalizedNextPaths = normalizeDeferredPaths(nextPaths);

    if (
      this.isUpdatingDeferredPaths ||
      normalizedNextPaths.join("\u0000") === this.deferredPaths.join("\u0000")
    ) {
      return;
    }

    const previousPaths = this.deferredPaths;
    const currentPreferences = cloneProjectPreferences(this.projectStore.project.preferences);
    const preferences: OpenCodexProjectPreferences = {
      ...currentPreferences,
      git: {
        ...currentPreferences.git,
        deferredPaths: normalizedNextPaths
      }
    };

    runInAction(() => {
      this.deferredPaths = normalizedNextPaths;
      this.selectedChangedPaths = keepExistingPaths(
        this.selectedChangedPaths,
        this.stageableChangedFiles.map((file) => file.path)
      );
      this.isUpdatingDeferredPaths = true;
      this.errorMessage = null;
    });

    try {
      const project = await this.root.request<OpenCodexProject>({
        type: "projects.preferences.update",
        projectId: this.projectStore.project.id,
        patch: preferences
      });

      runInAction(() => {
        this.projectStore.setProject(project);
      });
    } catch (error) {
      runInAction(() => {
        this.deferredPaths = previousPaths;
        this.selectedChangedPaths = keepExistingPaths(
          this.selectedChangedPaths,
          this.stageableChangedFiles.map((file) => file.path)
        );
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isUpdatingDeferredPaths = false;
      });
    }
  }

  /**
   * Unstages normalized file paths.
   *
   * @param paths File paths.
   */
  private async unstagePaths(paths: string[]): Promise<void> {
    const normalizedPaths = normalizePaths(paths);

    if (normalizedPaths.length === 0) {
      return;
    }

    await this.applyGitStatusRequest("git.unstage", normalizedPaths);
  }

  /**
   * Applies a Git mutation that returns a new status snapshot.
   *
   * @param type Git status mutation request type.
   * @param paths File paths.
   */
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

  /**
   * Applies a branch mutation that returns a new status snapshot.
   *
   * @param type Branch request type.
   * @param request Branch request payload.
   * @returns Whether the operation succeeded.
   */
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

  /**
   * Applies a branch merge and refreshes branch/tag state.
   *
   * @param branchName Branch name to merge.
   * @returns Whether merge succeeded.
   */
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

  /**
   * Applies a Git status snapshot and reconciles local selections.
   *
   * @param status Git status snapshot.
   */
  private applyStatus(status: OpenCodexGitStatus): void {
    this.status = status;

    if (this.commitMessage.trim().length === 0 && status.pendingCommitMessage !== null) {
      this.commitMessage = status.pendingCommitMessage;
    }

    this.selectedChangedPaths = keepExistingPaths(
      this.selectedChangedPaths,
      this.stageableChangedFiles.map((file) => file.path)
    );
    this.selectedStagedPaths = keepExistingPaths(
      this.selectedStagedPaths,
      status.stagedFiles.map((file) => file.path)
    );
  }

  /**
   * Loads commit distance from a reference tag to HEAD.
   *
   * @param tagName Reference tag name.
   * @returns Whether the count was loaded.
   */
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

  /**
   * Reloads local tags without fetching remotes.
   *
   * @returns Promise resolved when tags are loaded.
   */
  private async refreshLocalTags(): Promise<void> {
    const tags = await this.root.request<OpenCodexGitTag[]>({
      type: "git.tags",
      projectPath: this.projectStore.projectPath,
      sourceId: this.projectStore.project.sourceId
    });

    runInAction(() => {
      this.tags = tags;
      this.keepSelectedReferenceTag();
    });

    if (this.selectedReferenceTagName !== null) {
      await this.loadCommitsSinceReferenceTag(this.selectedReferenceTagName);
    }
  }

  /**
   * Surfaces a non-fatal tag fetch warning to UI and logs.
   *
   * @param message Warning message.
   */
  private reportTagFetchWarning(message: string): void {
    this.root.appStore.showWarningMessage(message);
    void this.root.request({
      type: "logs.create",
      logType: "warning",
      message,
      details: {
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId
      }
    });
  }

  /**
   * Clears the selected reference tag when it no longer exists locally.
   */
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

  /**
   * Clears tag state when the project is not a usable repository.
   */
  private clearTags(): void {
    this.tags = [];
    this.selectedReferenceTagName = null;
    this.commitsSinceReferenceTag = null;
    this.hasLoadedTags = true;
    this.tagErrorMessage = null;
  }

  /**
   * Clears loaded Git log state.
   */
  clearLog(): void {
    this.logCommits = [];
    this.commitDetailsByHash.clear();
    this.hasLoadedLog = false;
    this.hasMoreLogCommits = false;
    this.isLoadingLog = false;
    this.loadingCommitDetailsHash = null;
    this.logErrorMessage = null;
  }

  /**
   * Persists the selected reference tag in project preferences.
   *
   * @param referenceTagName Selected tag name.
   */
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

/**
 * Toggles one path in a selected path collection.
 *
 * @param paths Current selected paths.
 * @param path Path to toggle.
 * @returns Updated selected paths.
 */
function togglePath(paths: string[], path: string): string[] {
  if (paths.includes(path)) {
    return paths.filter((entry) => entry !== path);
  }

  return [...paths, path];
}

/**
 * Keeps only selected paths still present in the current status.
 *
 * @param paths Selected paths.
 * @param availablePaths Available paths.
 * @returns Valid selected paths.
 */
function keepExistingPaths(paths: string[], availablePaths: string[]): string[] {
  const availablePathSet = new Set(availablePaths);
  return paths.filter((path) => availablePathSet.has(path));
}

/**
 * Appends unique Git log commits while preserving loaded history.
 *
 * @param currentCommits Existing log commits.
 * @param nextCommits Newly loaded log commits.
 * @returns Merged commit list.
 */
function mergeLogCommits(
  currentCommits: OpenCodexGitLogCommit[],
  nextCommits: OpenCodexGitLogCommit[]
): OpenCodexGitLogCommit[] {
  const knownHashes = new Set(currentCommits.map((commit) => commit.hash));
  const uniqueNextCommits = nextCommits.filter((commit) => !knownHashes.has(commit.hash));
  return [...currentCommits, ...uniqueNextCommits];
}

/**
 * Trims paths and removes empty entries before Git mutations.
 *
 * @param paths Raw paths.
 * @returns Normalized paths.
 */
function normalizePaths(paths: string[]): string[] {
  return paths.map((path) => path.trim()).filter((path) => path.length > 0);
}

/**
 * Trims optional text and converts empty strings to `null`.
 *
 * @param value Optional text.
 * @returns Normalized text.
 */
function normalizeNullableText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Converts unknown errors into displayable Git error text.
 *
 * @param error Unknown caught error.
 * @returns Error message.
 */
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
