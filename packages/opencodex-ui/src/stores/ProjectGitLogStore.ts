/**
 * Holds paginated Git history and commit detail state for one project.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexGitCommitDetails,
  OpenCodexGitLogCommit,
  OpenCodexGitLogPage,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

import { readErrorMessage } from "./gitErrorMessage";

/** Backend and project state required by the Git log store. */
export interface ProjectGitLogContext {
  /** Whether the source can execute Git requests. */
  readonly isAvailable: boolean;
  /** Whether the current project is a Git repository. */
  readonly isRepository: boolean;
  /** Current project path used by Git requests. */
  readonly projectPath: string;
  /** Current source identifier used by Git requests. */
  readonly sourceId: string | null;
  /** Sends one request through the owning backend transport. */
  request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse>;
}

const gitLogPageSize = 50;

/**
 * Stores paginated Git history and lazily loaded commit details.
 */
export class ProjectGitLogStore {
  /** Git log entries loaded in pages. */
  logCommits: OpenCodexGitLogCommit[] = [];
  /** Commit details cached by commit hash. */
  commitDetailsByHash = new Map<string, OpenCodexGitCommitDetails>();
  /** Last Git log loading error. */
  logErrorMessage: string | null = null;
  /** Whether the Git log has been loaded at least once. */
  hasLoadedLog = false;
  /** Whether more Git log pages are available. */
  hasMoreLogCommits = false;
  /** Whether Git log commits are loading. */
  isLoadingLog = false;
  /** Commit hash currently loading detailed data. */
  loadingCommitDetailsHash: string | null = null;

  /**
   * Creates a Git log store with dynamic project and source state.
   *
   * @param context State getters and backend request capability.
   */
  constructor(private readonly context: ProjectGitLogContext) {
    makeAutoObservable<ProjectGitLogStore, "context">(
      this,
      {
        context: false
      },
      {
        autoBind: true
      }
    );
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
   * Loads one page of Git log commits.
   *
   * @param reset Whether to replace existing log rows.
   * @returns Promise resolved when the page is loaded.
   */
  async loadGitLog(reset: boolean): Promise<void> {
    if (!this.context.isAvailable || !this.context.isRepository || this.isLoadingLog) {
      return;
    }

    const skip = reset ? 0 : this.logCommits.length;

    this.isLoadingLog = true;
    this.logErrorMessage = null;

    try {
      const page = await this.context.request<OpenCodexGitLogPage>({
        type: "git.log",
        projectPath: this.context.projectPath,
        sourceId: this.context.sourceId,
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
      !this.context.isAvailable ||
      !this.context.isRepository ||
      normalizedHash.length === 0 ||
      this.commitDetailsByHash.has(normalizedHash)
    ) {
      return;
    }

    this.loadingCommitDetailsHash = normalizedHash;
    this.logErrorMessage = null;

    try {
      const details = await this.context.request<OpenCodexGitCommitDetails>({
        type: "git.commit.details",
        projectPath: this.context.projectPath,
        sourceId: this.context.sourceId,
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
   * Clears loaded Git log state and cached commit details.
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
