/**
 * Holds Git repository status and repository lifecycle actions for one project.
 */
import { makeAutoObservable, observable, runInAction } from "mobx";

import type { OpenCodexGitFile, OpenCodexGitStatus } from "@open-codex-ui/opencodex-protocol";

import type { ProjectGitStore } from "./ProjectGitStore";
import { readErrorMessage } from "./gitErrorMessage";
import { areGitFileStatusesEqual, createGitFileStatusIndex } from "./gitFileStatusIndex";
import { areGitDirectoryStatusesEqual, createGitDirectoryStatusIndex, type GitDirectoryStatus } from "./gitDirectoryStatusIndex";

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
  /** Ancestor summaries do not require loading folders from the filesystem. */
  readonly directoriesByPath = observable.map<string, GitDirectoryStatus>({}, { deep: false });
  /** Whether an initial status request has completed. */
  hasLoaded = false;
  /** Whether the latest read-only status request is pending. */
  isRefreshing = false;
  /** Whether repository initialization is in flight. */
  isInitializingRepository = false;
  /** Only the latest refresh may publish results or release its read indicator. */
  private refreshSequence = 0;
  /** Accepted mutations invalidate snapshots requested before their completion. */
  private statusRevision = 0;

  /**
   * Creates a Git status store attached to its owning aggregate.
   *
   * @param parent Owning Git store used for project context and coordination.
   */
  constructor(private readonly parent: ProjectGitStore) {
    makeAutoObservable<ProjectGitStatusStore, "parent" | "filesByPath" | "directoriesByPath" | "refreshSequence" | "statusRevision">(
      this,
      { parent: false, filesByPath: false, directoriesByPath: false, refreshSequence: false, statusRevision: false },
      { autoBind: true }
    );
  }

  /** Whether the current project is a Git repository. */
  get isRepository(): boolean {
    return this.status.isRepository;
  }

  /** General Git actions wait for reads and index mutations, which have independent lifetimes. */
  get isLoading(): boolean {
    return this.isRefreshing || this.parent.changesStore.isUpdatingIndex;
  }

  /**
   * Refreshes Git status and dependent tag state.
   *
   * @returns Promise resolved when refresh completes.
   */
  async refresh(): Promise<void> {
    const sequence = ++this.refreshSequence;
    const revision = this.statusRevision;
    if (!this.parent.isAvailable) {
      this.isRefreshing = false;
      this.applyStatus(emptyGitStatus);
      this.hasLoaded = true;
      return;
    }

    this.isRefreshing = true;
    this.parent.errorMessage = null;

    try {
      const status = await this.parent.request<OpenCodexGitStatus>({
        type: "git.status",
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId
      });

      if (sequence !== this.refreshSequence || revision !== this.statusRevision) return;

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
      if (sequence !== this.refreshSequence || revision !== this.statusRevision) return;
      runInAction(() => {
        this.parent.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        if (sequence === this.refreshSequence) {
          this.isRefreshing = false;
          this.hasLoaded = true;
        }
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
    this.reconcileDirectoryStatuses(createGitDirectoryStatusIndex(this.filesByPath));
    this.parent.reconcileStatus(status);
    this.statusRevision += 1;
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

  /** Updates only changed ancestor summaries, including disappearance after commit or reset. */
  private reconcileDirectoryStatuses(next: Map<string, GitDirectoryStatus>): void {
    for (const path of this.directoriesByPath.keys()) {
      if (!next.has(path)) this.directoriesByPath.delete(path);
    }
    for (const [path, summary] of next) {
      const previous = this.directoriesByPath.get(path);
      if (previous === undefined || !areGitDirectoryStatusesEqual(previous, summary)) {
        this.directoriesByPath.set(path, summary);
      }
    }
  }
}
