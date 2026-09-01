/**
 * Exposes the stable object-oriented facade over focused Git actions.
 */
import type {
  OpenCodexGitBranch,
  OpenCodexGitBranchKind,
  OpenCodexGitCommitDetails,
  OpenCodexGitCommitResult,
  OpenCodexGitLogPage,
  OpenCodexGitRemote,
  OpenCodexGitStatus,
  OpenCodexGitTagFetchResult,
  OpenCodexGitTagListResult
} from "@open-codex-ui/opencodex-protocol";

import { createRunGit } from "./gitCommandRunner.js";
import {
  commitDetails as readCommitDetails,
  commitsSinceTag as countCommitsSinceTag,
  log as readGitLog
} from "./gitHistoryActions.js";
import {
  branches as listGitBranches,
  checkoutBranch as checkoutGitBranch,
  createBranch as createGitBranch,
  createTag as createGitTag,
  fetchTags as fetchGitTags,
  mergeBranch as mergeGitBranch,
  publishCurrentBranch as publishGitCurrentBranch,
  pull as pullGit,
  push as pushGit,
  pushTag as pushGitTag,
  pushTags as pushGitTags,
  remotes as listGitRemotes,
  tags as listGitTags,
  upsertRemote as upsertGitRemote,
  type GitReferenceActionContext
} from "./gitReferenceActions.js";
import {
  createGitCommit,
  initializeGitRepository,
  readGitStatus,
  readStagedCommitContext as readGitStagedCommitContext,
  stageGitPaths,
  unstageGitPaths,
  type GitRepositoryActionContext,
  type OpenCodexStagedCommitContext
} from "./gitRepositoryActions.js";
import type { ClientPort } from "../runtime/runtimePorts.js";

export type { OpenCodexStagedCommitContext } from "./gitRepositoryActions.js";

/** Dependencies required to execute Git commands for one Codex source. */
export type GitServiceOptions = {
  clients: Pick<ClientPort, "ensureClient">;
};

/**
 * Keeps the historical Git API while delegating behavior to focused actions.
 */
export class GitService {
  /** Dependencies for working-tree and commit actions. */
  private readonly repositoryContext: GitRepositoryActionContext;

  /** Dependencies for remote, branch, and tag actions. */
  private readonly referenceContext: GitReferenceActionContext;

  /**
   * Creates a Git service.
   *
   * @param options Codex client resolver used to run Git in the project source.
   */
  constructor(options: GitServiceOptions) {
    const runGit = createRunGit(options.clients);
    this.repositoryContext = { runGit, clients: options.clients };
    this.referenceContext = {
      runGit,
      readStatus: async (projectPath, sourceId) => await this.status(projectPath, sourceId)
    };
  }

  /**
   * Reads repository status for a project.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Parsed Git status.
   */
  async status(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await readGitStatus(
      this.repositoryContext,
      projectPath,
      sourceId,
      async (path, id) => await listGitRemotes(this.referenceContext, path, id)
    );
  }

  /**
   * Initializes a repository and returns its refreshed status.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Refreshed Git status.
   */
  async init(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    await initializeGitRepository(this.repositoryContext, projectPath, sourceId);
    return await this.status(projectPath, sourceId);
  }

  /**
   * Lists configured Git remotes.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Configured Git remotes.
   */
  async remotes(projectPath: string, sourceId: string | null): Promise<OpenCodexGitRemote[]> {
    return await listGitRemotes(this.referenceContext, projectPath, sourceId);
  }

  /**
   * Adds or updates one Git remote and returns refreshed status.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param name Remote name.
   * @param url Remote URL.
   * @returns Refreshed Git status.
   */
  async upsertRemote(
    projectPath: string,
    sourceId: string | null,
    name: string,
    url: string
  ): Promise<OpenCodexGitStatus> {
    return await upsertGitRemote(this.referenceContext, projectPath, sourceId, name, url);
  }

  /**
   * Lists local and remote branches.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Local branches followed by remote branches.
   */
  async branches(projectPath: string, sourceId: string | null): Promise<OpenCodexGitBranch[]> {
    return await listGitBranches(this.referenceContext, projectPath, sourceId);
  }

  /**
   * Lists Git tags.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Existing tags and their remote synchronization state.
   */
  async tags(projectPath: string, sourceId: string | null): Promise<OpenCodexGitTagListResult> {
    return await listGitTags(this.referenceContext, projectPath, sourceId);
  }

  /**
   * Fetches remote tags and returns the refreshed local tag list.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Refreshed tags and an optional fetch warning.
   */
  async fetchTags(projectPath: string, sourceId: string | null): Promise<OpenCodexGitTagFetchResult> {
    return await fetchGitTags(this.referenceContext, projectPath, sourceId);
  }

  /**
   * Creates a lightweight Git tag and returns the refreshed tag list.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param tagName Tag name.
   * @returns Refreshed tags.
   */
  async createTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string
  ): Promise<OpenCodexGitTagListResult> {
    return await createGitTag(this.referenceContext, projectPath, sourceId, tagName);
  }

  /**
   * Pushes one local tag to the configured remote.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param tagName Tag name.
   * @param force Whether an existing remote tag may be replaced.
   * @returns Refreshed tags.
   */
  async pushTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string,
    force: boolean
  ): Promise<OpenCodexGitTagListResult> {
    return await pushGitTag(this.referenceContext, projectPath, sourceId, tagName, force);
  }

  /**
   * Pushes all local tags to the configured remote.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Refreshed tags.
   */
  async pushTags(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitTagListResult> {
    return await pushGitTags(this.referenceContext, projectPath, sourceId);
  }

  /**
   * Counts commits since a reference tag.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param tagName Tag name.
   * @returns Number of commits reachable from HEAD after the tag.
   */
  async commitsSinceTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string
  ): Promise<number> {
    return await countCommitsSinceTag(this.repositoryContext.runGit, projectPath, sourceId, tagName);
  }

  /**
   * Reads one bounded page from the Git history.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param limit Page size.
   * @param skip Number of commits to skip from HEAD.
   * @returns Commit summaries and pagination state.
   */
  async log(
    projectPath: string,
    sourceId: string | null,
    limit: number,
    skip: number
  ): Promise<OpenCodexGitLogPage> {
    return await readGitLog(this.repositoryContext.runGit, projectPath, sourceId, limit, skip);
  }

  /**
   * Reads the message and changed files for one commit.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param hash Commit hash.
   * @returns Commit details.
   */
  async commitDetails(
    projectPath: string,
    sourceId: string | null,
    hash: string
  ): Promise<OpenCodexGitCommitDetails> {
    return await readCommitDetails(this.repositoryContext.runGit, projectPath, sourceId, hash);
  }

  /**
   * Checks out an existing local or remote branch and returns refreshed status.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param branchName Branch name.
   * @param branchKind Branch kind.
   * @returns Refreshed status.
   */
  async checkoutBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string,
    branchKind: OpenCodexGitBranchKind
  ): Promise<OpenCodexGitStatus> {
    return await checkoutGitBranch(
      this.referenceContext,
      projectPath,
      sourceId,
      branchName,
      branchKind
    );
  }

  /**
   * Creates and checks out a new local branch.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param branchName Branch name.
   * @returns Refreshed status.
   */
  async createBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string
  ): Promise<OpenCodexGitStatus> {
    return await createGitBranch(this.referenceContext, projectPath, sourceId, branchName);
  }

  /**
   * Merges an existing local branch into the current branch.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param branchName Local branch name.
   * @returns Refreshed status.
   */
  async mergeBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string
  ): Promise<OpenCodexGitStatus> {
    return await mergeGitBranch(this.referenceContext, projectPath, sourceId, branchName);
  }

  /**
   * Stages selected paths.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param paths Relative paths to stage.
   * @returns Refreshed status.
   */
  async stage(
    projectPath: string,
    sourceId: string | null,
    paths: string[]
  ): Promise<OpenCodexGitStatus> {
    await stageGitPaths(this.repositoryContext, projectPath, sourceId, paths);
    return await this.status(projectPath, sourceId);
  }

  /**
   * Unstages selected paths.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param paths Relative paths to unstage.
   * @returns Refreshed status.
   */
  async unstage(
    projectPath: string,
    sourceId: string | null,
    paths: string[]
  ): Promise<OpenCodexGitStatus> {
    await unstageGitPaths(this.repositoryContext, projectPath, sourceId, paths);
    return await this.status(projectPath, sourceId);
  }

  /**
   * Creates a commit from staged files.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param message Commit message.
   * @param protectedBranches Branches where OpenCodexUI commits are blocked.
   * @returns Commit result output.
   */
  async commit(
    projectPath: string,
    sourceId: string | null,
    message: string,
    protectedBranches: readonly string[] = []
  ): Promise<OpenCodexGitCommitResult> {
    return await createGitCommit(
      this.repositoryContext,
      projectPath,
      sourceId,
      message,
      protectedBranches
    );
  }

  /**
   * Pushes local commits to the configured upstream.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Refreshed status.
   */
  async push(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await pushGit(this.referenceContext, projectPath, sourceId);
  }

  /**
   * Pushes the current local branch and configures its upstream.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Refreshed status.
   */
  async publishCurrentBranch(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitStatus> {
    return await publishGitCurrentBranch(this.referenceContext, projectPath, sourceId);
  }

  /**
   * Pulls remote commits from the configured upstream.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Refreshed status.
   */
  async pull(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await pullGit(this.referenceContext, projectPath, sourceId);
  }

  /**
   * Reads the staged Git context used by one-shot commit message generation.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Staged files summary and a bounded diff.
   */
  async readStagedCommitContext(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexStagedCommitContext> {
    return await readGitStagedCommitContext(this.repositoryContext, projectPath, sourceId);
  }
}
