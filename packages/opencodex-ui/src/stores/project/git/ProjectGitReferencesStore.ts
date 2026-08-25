/**
 * Holds Git branch, remote, and remote synchronization state for one project.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexGitBranch,
  OpenCodexGitBranchKind,
  OpenCodexGitRemote,
  OpenCodexGitStatus
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectGitStore } from "./ProjectGitStore";
import { readErrorMessage } from "./gitErrorMessage";

/**
 * Stores Git references and branch-level synchronization actions for a project.
 */
export class ProjectGitReferencesStore {
  /** Local and remote branches loaded for branch actions. */
  branches: OpenCodexGitBranch[] = [];
  /** Last branch operation error shown by branch modals. */
  branchErrorMessage: string | null = null;
  /** Last remote configuration error. */
  remoteErrorMessage: string | null = null;
  /** Whether branches have been loaded at least once. */
  hasLoadedBranches = false;
  /** Whether branches are loading. */
  isLoadingBranches = false;
  /** Whether remotes are loading. */
  isLoadingRemotes = false;
  /** Whether a checkout or branch creation is in flight. */
  isCheckingOutBranch = false;
  /** Whether a merge operation is in flight. */
  isMergingBranch = false;
  /** Whether remote configuration is being saved. */
  isSavingRemote = false;
  /** Whether a pull operation is in flight. */
  isPulling = false;
  /** Whether a push or branch publication is in flight. */
  isPushing = false;

  /**
   * Creates the references store attached to its owning Git aggregate.
   *
   * @param parent Owning Git store used for project context and coordination.
   */
  constructor(private readonly parent: ProjectGitStore) {
    makeAutoObservable<ProjectGitReferencesStore, "parent">(
      this,
      { parent: false },
      { autoBind: true }
    );
  }

  /** Whether Git actions can run for the project source. */
  get isAvailable(): boolean {
    return this.parent.isAvailable;
  }

  /** Whether the current project is a Git repository. */
  get isRepository(): boolean {
    return this.parent.statusStore.isRepository;
  }

  /** Whether local commits can be pushed to the configured upstream. */
  get canPush(): boolean {
    return (
      this.parent.statusStore.isRepository &&
      this.parent.statusStore.status.upstreamName !== null &&
      this.parent.statusStore.status.aheadCount > 0 &&
      !this.parent.statusStore.isLoading &&
      !this.isPushing
    );
  }

  /** Whether the current branch can be published to a remote. */
  get canPublishBranch(): boolean {
    return (
      this.parent.statusStore.isRepository &&
      this.parent.statusStore.status.branchName !== null &&
      this.parent.statusStore.status.upstreamName === null &&
      this.parent.statusStore.status.remotes.length > 0 &&
      !this.parent.statusStore.isLoading &&
      !this.isPushing
    );
  }

  /** Preferred remote used for publication hints. */
  get primaryRemote(): OpenCodexGitRemote | null {
    return this.parent.statusStore.status.remotes.find((remote) => remote.name === "origin")
      ?? this.parent.statusStore.status.remotes[0]
      ?? null;
  }

  /** Whether remote commits can be pulled from the configured upstream. */
  get canPull(): boolean {
    return (
      this.parent.statusStore.isRepository &&
      this.parent.statusStore.status.upstreamName !== null &&
      this.parent.statusStore.status.behindCount > 0 &&
      !this.parent.statusStore.isLoading &&
      !this.isPulling
    );
  }

  /**
   * Loads local and remote branches.
   *
   * @returns Promise resolved when branches are loaded.
   */
  async loadBranches(): Promise<void> {
    if (!this.isAvailable || !this.isRepository) {
      this.branches = [];
      this.hasLoadedBranches = true;
      return;
    }

    this.isLoadingBranches = true;
    this.branchErrorMessage = null;

    try {
      const branches = await this.parent.request<OpenCodexGitBranch[]>({
        type: "git.branches",
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId
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
    if (!this.isAvailable || !this.isRepository) {
      this.parent.statusStore.status = {
        ...this.parent.statusStore.status,
        remotes: []
      };
      return;
    }

    this.isLoadingRemotes = true;
    this.remoteErrorMessage = null;

    try {
      const remotes = await this.parent.request<OpenCodexGitRemote[]>({
        type: "git.remotes",
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId
      });

      runInAction(() => {
        this.parent.statusStore.status = {
          ...this.parent.statusStore.status,
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
   * Creates or updates a Git remote.
   *
   * @param name Remote name.
   * @param url Remote URL.
   * @returns Whether saving succeeded.
   */
  async upsertRemote(name: string, url: string): Promise<boolean> {
    if (!this.isAvailable || !this.isRepository || this.isSavingRemote) {
      return false;
    }

    this.isSavingRemote = true;
    this.remoteErrorMessage = null;
    this.parent.errorMessage = null;

    try {
      const status = await this.parent.request<OpenCodexGitStatus>({
        type: "git.remote.upsert",
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId,
        name,
        url
      });

      runInAction(() => {
        this.applyStatus(status);
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
    this.parent.errorMessage = null;

    try {
      const status = await this.parent.request<OpenCodexGitStatus>({
        type: "git.push",
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId
      });

      runInAction(() => {
        this.applyStatus(status);
      });
      if (status.isRepository) {
        void this.parent.tagStore.loadTags();
      }
    } catch (error) {
      runInAction(() => {
        this.parent.errorMessage = readErrorMessage(error);
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
    this.parent.errorMessage = null;

    try {
      const status = await this.parent.request<OpenCodexGitStatus>({
        type: "git.branch.publish",
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId
      });

      runInAction(() => {
        this.applyStatus(status);
      });
      await this.loadBranches();
      if (status.isRepository) {
        void this.parent.tagStore.loadTags();
      }
    } catch (error) {
      runInAction(() => {
        this.parent.errorMessage = readErrorMessage(error);
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
    this.parent.errorMessage = null;

    try {
      const status = await this.parent.request<OpenCodexGitStatus>({
        type: "git.pull",
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId
      });

      runInAction(() => {
        this.applyStatus(status);
      });
      if (status.isRepository) {
        void this.parent.tagStore.loadTags();
      }
    } catch (error) {
      runInAction(() => {
        this.parent.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isPulling = false;
      });
    }
  }

  /**
   * Applies a status returned by a reference mutation and clears tags if needed.
   *
   * @param status Git status snapshot returned by the backend.
   */
  private applyStatus(status: OpenCodexGitStatus): void {
    this.parent.statusStore.applyStatus(status);
    if (!status.isRepository) {
      this.parent.tagStore.clearTags();
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
    this.parent.errorMessage = null;

    try {
      const status = type === "git.checkout"
        ? await this.parent.request<OpenCodexGitStatus>({
          type,
          projectPath: this.parent.projectPath,
          sourceId: this.parent.sourceId,
          branchName: request.branchName,
          branchKind: request.branchKind ?? "local"
        })
        : await this.parent.request<OpenCodexGitStatus>({
          type,
          projectPath: this.parent.projectPath,
          sourceId: this.parent.sourceId,
          branchName: request.branchName
        });

      runInAction(() => {
        this.applyStatus(status);
      });
      await this.loadBranches();
      if (status.isRepository) {
        await this.parent.tagStore.loadTags();
      }
      return true;
    } catch (error) {
      runInAction(() => {
        this.branchErrorMessage = readErrorMessage(error);
      });
      await this.parent.statusStore.refresh();
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
    this.parent.errorMessage = null;

    try {
      const status = await this.parent.request<OpenCodexGitStatus>({
        type: "git.merge",
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId,
        branchName: normalizedBranchName
      });

      runInAction(() => {
        this.applyStatus(status);
      });
      await this.loadBranches();
      if (status.isRepository) {
        await this.parent.tagStore.loadTags();
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
}
