/**
 * Holds changed and staged Git files and project-local staging preferences.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexGitFile,
  OpenCodexGitStatus,
  OpenCodexProject,
  OpenCodexProjectPreferences
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectGitStore } from "./ProjectGitStore";
import { readErrorMessage } from "./gitErrorMessage";
import {
  findDeferredPath,
  isPathDeferred,
  mergeDeferredPaths,
  normalizeDeferredPath,
  normalizeDeferredPaths,
  removeDeferredPath
} from "./gitDeferredPaths";
import { cloneProjectPreferences } from "../projectPreferencesDto";

/**
 * Stores the changed-file staging workflow for one project.
 */
export class ProjectGitChangesStore {
  /** Relative files or directories excluded from OpenCodexUI staging actions. */
  deferredPaths: string[] = [];
  /** Whether deferred-path preferences are being persisted. */
  isUpdatingDeferredPaths = false;
  /** Changed file paths selected for staging. */
  selectedChangedPaths: string[] = [];
  /** Staged file paths selected for unstaging. */
  selectedStagedPaths: string[] = [];

  /**
   * Creates a changed-file store attached to its owning Git aggregate.
   *
   * @param parent Owning Git store used for project context and coordination.
   */
  constructor(private readonly parent: ProjectGitStore) {
    makeAutoObservable<ProjectGitChangesStore, "parent">(
      this,
      { parent: false },
      { autoBind: true }
    );
  }

  /** Number of unstaged changed files. */
  get changedFilesCount(): number {
    return this.stageableChangedFiles.length;
  }

  /** Files with unstaged changes that remain in the staging workflow. */
  get stageableChangedFiles(): OpenCodexGitFile[] {
    return this.parent.statusStore.status.changedFiles.filter((file) => !this.isPathDeferred(file.path));
  }

  /** Files with unstaged changes currently deferred in OpenCodexUI. */
  get deferredChangedFiles(): OpenCodexGitFile[] {
    return this.parent.statusStore.status.changedFiles.filter((file) => this.isPathDeferred(file.path));
  }

  /** Number of unstaged files currently deferred in OpenCodexUI. */
  get deferredFilesCount(): number {
    return this.deferredChangedFiles.length;
  }

  /** Whether a Git action should wait for a status or preference operation. */
  get isBusy(): boolean {
    return this.parent.statusStore.isLoading || this.isUpdatingDeferredPaths;
  }

  /** Number of staged files. */
  get stagedFilesCount(): number {
    return this.parent.statusStore.status.stagedFiles.length;
  }

  /** Files currently staged in the repository. */
  get stagedFiles(): OpenCodexGitFile[] {
    return this.parent.statusStore.status.stagedFiles;
  }

  /**
   * Applies Git preferences from project metadata.
   *
   * @param preferences Project preferences.
   */
  applyProjectPreferences(preferences: OpenCodexProjectPreferences): void {
    const deferredPaths = normalizeDeferredPaths(preferences.git?.deferredPaths ?? []);

    this.deferredPaths = deferredPaths;
    this.selectedChangedPaths = keepExistingPaths(
      this.selectedChangedPaths,
      this.stageableChangedFiles.map((file) => file.path)
    );
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

  /** Stages selected changed files. */
  async stageSelected(): Promise<void> {
    await this.stagePaths(this.selectedChangedPaths.filter((path) => !this.isPathDeferred(path)));
  }

  /** Stages all changed files. */
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

  /** Unstages selected staged files. */
  async unstageSelected(): Promise<void> {
    await this.unstagePaths(this.selectedStagedPaths);
  }

  /** Unstages all staged files. */
  async unstageAll(): Promise<void> {
    await this.unstagePaths(this.parent.statusStore.status.stagedFiles.map((file) => file.path));
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
   * Reconciles changed and staged selections after a status snapshot is applied.
   *
   * @param status Git status snapshot, already installed by the status store.
   */
  reconcileStatus(status: OpenCodexGitStatus): void {
    const stageableChangedPaths = status.changedFiles
      .filter((file) => !this.isPathDeferred(file.path))
      .map((file) => file.path);

    this.selectedChangedPaths = keepExistingPaths(
      this.selectedChangedPaths,
      stageableChangedPaths
    );
    this.selectedStagedPaths = keepExistingPaths(
      this.selectedStagedPaths,
      status.stagedFiles.map((file) => file.path)
    );
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
    const currentPreferences = cloneProjectPreferences(this.parent.projectPreferences);
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
      this.parent.errorMessage = null;
    });

    try {
      const project = await this.parent.request<OpenCodexProject>({
        type: "projects.preferences.update",
        projectId: this.parent.projectId,
        patch: preferences
      });

      runInAction(() => {
        this.parent.setProject(project);
      });
    } catch (error) {
      runInAction(() => {
        this.deferredPaths = previousPaths;
        this.selectedChangedPaths = keepExistingPaths(
          this.selectedChangedPaths,
          this.stageableChangedFiles.map((file) => file.path)
        );
        this.parent.errorMessage = readErrorMessage(error);
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
    this.parent.statusStore.isLoading = true;
    this.parent.errorMessage = null;

    try {
      const status = await this.parent.request<OpenCodexGitStatus>({
        type,
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId,
        paths
      });

      runInAction(() => {
        this.parent.statusStore.applyStatus(status);
      });
    } catch (error) {
      runInAction(() => {
        this.parent.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.parent.statusStore.isLoading = false;
      });
    }
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
 * Trims paths and removes empty entries before Git mutations.
 *
 * @param paths Raw paths.
 * @returns Normalized paths.
 */
function normalizePaths(paths: string[]): string[] {
  return paths.map((path) => path.trim()).filter((path) => path.length > 0);
}
