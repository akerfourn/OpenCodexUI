/**
 * Holds Git repository status and repository lifecycle actions for one project.
 */
import { makeAutoObservable, observable, runInAction } from "mobx";

import type { OpenCodexGitFile, OpenCodexGitStatus } from "@open-codex-ui/opencodex-protocol";

import type { ProjectGitStore } from "./ProjectGitStore";
import { readErrorMessage } from "./gitErrorMessage";
import { areGitFileStatusesEqual, createGitFileStatusIndex } from "./gitFileStatusIndex";

/** Empty status used when the project has no usable Git repository. */
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

/**
 * Stores the current Git status and repository initialization state.
 */
export class ProjectGitStatusStore {
  /** Last Git status snapshot for the project. */
  status: OpenCodexGitStatus = emptyGitStatus;
  /** Git state indexed by workspace-relative path for file-tree rows. */
  readonly filesByPath = observable.map<string, OpenCodexGitFile>({}, { deep: false });
  /** Whether an initial status request has completed. */
  hasLoaded = false;
  /** Whether Git status is loading or mutating. */
  isLoading = false;
  /** Whether repository initialization is in flight. */
  isInitializingRepository = false;

  /**
   * Creates a Git status store attached to its owning aggregate.
   *
   * @param parent Owning Git store used for project context and coordination.
   */
  constructor(private readonly parent: ProjectGitStore) {
    makeAutoObservable<ProjectGitStatusStore, "parent" | "filesByPath">(
      this,
      { parent: false, filesByPath: false },
      { autoBind: true }
    );
  }

  /** Whether the current project is a Git repository. */
  get isRepository(): boolean {
    return this.status.isRepository;
  }

  /**
   * Refreshes Git status and dependent tag state.
   *
   * @returns Promise resolved when refresh completes.
   */
  async refresh(): Promise<void> {
    if (!this.parent.isAvailable) {
      this.applyStatus(emptyGitStatus);
      this.hasLoaded = true;
      return;
    }

    this.isLoading = true;
    this.parent.errorMessage = null;

    try {
      const status = await this.parent.request<OpenCodexGitStatus>({
        type: "git.status",
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId
      });

      runInAction(() => {
        this.applyStatus(status);
        if (!status.isRepository) {
          this.parent.tagStore.clearTags();
        }
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
    if (!this.parent.isAvailable || this.isInitializingRepository) {
      return;
    }

    this.isInitializingRepository = true;
    this.parent.errorMessage = null;

    try {
      const status = await this.parent.request<OpenCodexGitStatus>({
        type: "git.init",
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId
      });

      runInAction(() => {
        this.applyStatus(status);
        if (!status.isRepository) {
          this.parent.tagStore.clearTags();
        }
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
        this.isInitializingRepository = false;
        this.hasLoaded = true;
      });
    }
  }

  /**
   * Applies a Git status and delegates cross-store reconciliation to the parent.
   *
   * @param status Git status snapshot.
   */
  applyStatus(status: OpenCodexGitStatus): void {
    this.status = status;
    this.reconcileFileStatuses(createGitFileStatusIndex(status));
    this.parent.reconcileStatus(status);
  }

  /** Reconciles paths incrementally so unchanged file rows do not rerender. */
  private reconcileFileStatuses(nextFiles: Map<string, OpenCodexGitFile>): void {
    for (const path of this.filesByPath.keys()) {
      if (!nextFiles.has(path)) this.filesByPath.delete(path);
    }

    for (const [path, nextFile] of nextFiles) {
      const currentFile = this.filesByPath.get(path);
      if (currentFile === undefined || !areGitFileStatusesEqual(currentFile, nextFile)) {
        this.filesByPath.set(path, nextFile);
      }
    }
  }
}
