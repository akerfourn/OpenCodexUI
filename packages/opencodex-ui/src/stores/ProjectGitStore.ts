/**
 * Holds Git state for one opened project.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexCommitMessageGenerationResult,
  OpenCodexGitCommitResult,
  OpenCodexGitStatus
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "./RootStore";

const emptyGitStatus: OpenCodexGitStatus = {
  isRepository: false,
  aheadCount: 0,
  behindCount: 0,
  branchName: null,
  upstreamName: null,
  changedFiles: [],
  stagedFiles: []
};

/**
 * Stores Git status and actions for a project.
 */
export class ProjectGitStore {
  status: OpenCodexGitStatus = emptyGitStatus;
  commitMessage = "";
  errorMessage: string | null = null;
  hasLoaded = false;
  isLoading = false;
  isCommitting = false;
  isGeneratingCommitMessage = false;
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
  }

  get isAvailable(): boolean {
    return this.projectStore.project.sourceId !== null;
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

  get canPush(): boolean {
    return (
      this.status.isRepository &&
      this.status.upstreamName !== null &&
      this.status.aheadCount > 0 &&
      !this.isLoading &&
      !this.isPushing
    );
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
    this.commitMessage = value;
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
      });
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
      });
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
      });
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

  private applyStatus(status: OpenCodexGitStatus): void {
    this.status = status;
    this.selectedChangedPaths = keepExistingPaths(
      this.selectedChangedPaths,
      status.changedFiles.map((file) => file.path)
    );
    this.selectedStagedPaths = keepExistingPaths(
      this.selectedStagedPaths,
      status.stagedFiles.map((file) => file.path)
    );
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

function normalizePaths(paths: string[]): string[] {
  return paths.map((path) => path.trim()).filter((path) => path.length > 0);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
