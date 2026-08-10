import type {
  OpenCodexCommitMessageGenerationResult,
  OpenCodexCommitMessageLanguage,
  OpenCodexCommitPrompt,
  OpenCodexGitBranch,
  OpenCodexGitBranchKind,
  OpenCodexGitCommitDetails,
  OpenCodexGitCommitResult,
  OpenCodexGitLogPage,
  OpenCodexGitRemote,
  OpenCodexGitStatus,
  OpenCodexGitTagFetchResult,
  OpenCodexGitTagListResult,
  OpenCodexReasoningEffort,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";

import type { GitRuntimeHandler } from "../../GitRuntimeHandler.js";
import type {
  CommitMessageApi as CommitMessageApiContract,
  GitApi as GitApiContract
} from "./PublicRuntimeApis.js";

type GitApiHandler = Pick<
  GitRuntimeHandler,
  | "readGitVersion"
  | "readGitStatus"
  | "initializeGitRepository"
  | "listGitRemotes"
  | "upsertGitRemote"
  | "listGitBranches"
  | "listGitTags"
  | "fetchGitTags"
  | "createGitTag"
  | "pushGitTag"
  | "pushGitTags"
  | "countGitCommitsSinceTag"
  | "readGitLog"
  | "readGitCommitDetails"
  | "checkoutGitBranch"
  | "createGitBranch"
  | "mergeGitBranch"
  | "stageGitPaths"
  | "unstageGitPaths"
  | "commitGitChanges"
  | "pushGitChanges"
  | "publishCurrentGitBranch"
  | "pullGitChanges"
  | "readCommitPrompt"
  | "updateCommitPrompt"
  | "resetCommitPrompt"
  | "generateGitCommitMessage"
>;

/** Public commit-message operations exposed below the Git API. */
export class CommitMessageApi implements CommitMessageApiContract {
  /** Creates a commit-message API over a Git runtime handler. */
  constructor(private readonly handler: GitApiHandler) {}

  /** Reads the editable commit generation prompt. */
  async readPrompt(): Promise<OpenCodexCommitPrompt> {
    return await this.handler.readCommitPrompt();
  }

  /** Persists the editable commit generation prompt. */
  async updatePrompt(prompt: string): Promise<OpenCodexCommitPrompt> {
    return await this.handler.updateCommitPrompt(prompt);
  }

  /** Restores the default commit generation prompt. */
  async resetPrompt(): Promise<OpenCodexCommitPrompt> {
    return await this.handler.resetCommitPrompt();
  }

  /** Generates a commit message from the currently staged changes. */
  async generate(
    projectPath: string,
    sourceId: string | null,
    instruction: string,
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    language: OpenCodexCommitMessageLanguage
  ): Promise<OpenCodexCommitMessageGenerationResult> {
    return await this.handler.generateGitCommitMessage(
      projectPath,
      sourceId,
      instruction,
      model,
      reasoningEffort,
      language
    );
  }
}

/** Public source-scoped Git operations. */
export class GitApi implements GitApiContract {
  /** Public commit-message operations associated with Git. */
  readonly commitMessage: CommitMessageApi;

  /** Creates a Git API over a Git runtime handler. */
  constructor(private readonly handler: GitApiHandler) {
    this.commitMessage = new CommitMessageApi(handler);
  }

  /** Reads the host-local Git version and availability status. */
  async readVersion(): Promise<OpenCodexToolVersionStatus> {
    return await this.handler.readGitVersion();
  }

  /** Reads Git status for a project through its source. */
  async readStatus(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await this.handler.readGitStatus(projectPath, sourceId);
  }

  /** Initializes a Git repository and returns its refreshed status. */
  async initializeRepository(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitStatus> {
    return await this.handler.initializeGitRepository(projectPath, sourceId);
  }

  /** Lists configured Git remotes for a project. */
  async listRemotes(projectPath: string, sourceId: string | null): Promise<OpenCodexGitRemote[]> {
    return await this.handler.listGitRemotes(projectPath, sourceId);
  }

  /** Adds or updates one Git remote and returns refreshed status. */
  async upsertRemote(
    projectPath: string,
    sourceId: string | null,
    name: string,
    url: string
  ): Promise<OpenCodexGitStatus> {
    return await this.handler.upsertGitRemote(projectPath, sourceId, name, url);
  }

  /** Lists local and remote Git branches for a project. */
  async listBranches(projectPath: string, sourceId: string | null): Promise<OpenCodexGitBranch[]> {
    return await this.handler.listGitBranches(projectPath, sourceId);
  }

  /** Lists local and remote Git tags for a project. */
  async listTags(projectPath: string, sourceId: string | null): Promise<OpenCodexGitTagListResult> {
    return await this.handler.listGitTags(projectPath, sourceId);
  }

  /** Fetches remote Git tags and returns the refreshed local tag list. */
  async fetchTags(projectPath: string, sourceId: string | null): Promise<OpenCodexGitTagFetchResult> {
    return await this.handler.fetchGitTags(projectPath, sourceId);
  }

  /** Creates a lightweight Git tag and returns the refreshed tag list. */
  async createTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string
  ): Promise<OpenCodexGitTagListResult> {
    return await this.handler.createGitTag(projectPath, sourceId, tagName);
  }

  /** Pushes one Git tag to the configured remote. */
  async pushTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string,
    force: boolean
  ): Promise<OpenCodexGitTagListResult> {
    return await this.handler.pushGitTag(projectPath, sourceId, tagName, force);
  }

  /** Pushes all local Git tags to the configured remote. */
  async pushTags(projectPath: string, sourceId: string | null): Promise<OpenCodexGitTagListResult> {
    return await this.handler.pushGitTags(projectPath, sourceId);
  }

  /** Counts commits since a reference tag. */
  async countCommitsSinceTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string
  ): Promise<number> {
    return await this.handler.countGitCommitsSinceTag(projectPath, sourceId, tagName);
  }

  /** Reads one bounded page of Git history. */
  async readLog(
    projectPath: string,
    sourceId: string | null,
    limit: number,
    skip: number
  ): Promise<OpenCodexGitLogPage> {
    return await this.handler.readGitLog(projectPath, sourceId, limit, skip);
  }

  /** Reads details for one Git commit. */
  async readCommitDetails(
    projectPath: string,
    sourceId: string | null,
    hash: string
  ): Promise<OpenCodexGitCommitDetails> {
    return await this.handler.readGitCommitDetails(projectPath, sourceId, hash);
  }

  /** Checks out an existing local or remote Git branch. */
  async checkoutBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string,
    branchKind: OpenCodexGitBranchKind
  ): Promise<OpenCodexGitStatus> {
    return await this.handler.checkoutGitBranch(projectPath, sourceId, branchName, branchKind);
  }

  /** Creates and checks out a new Git branch. */
  async createBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string
  ): Promise<OpenCodexGitStatus> {
    return await this.handler.createGitBranch(projectPath, sourceId, branchName);
  }

  /** Merges an existing Git branch into the current branch. */
  async mergeBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string
  ): Promise<OpenCodexGitStatus> {
    return await this.handler.mergeGitBranch(projectPath, sourceId, branchName);
  }

  /** Stages selected Git paths. */
  async stage(
    projectPath: string,
    sourceId: string | null,
    paths: string[]
  ): Promise<OpenCodexGitStatus> {
    return await this.handler.stageGitPaths(projectPath, sourceId, paths);
  }

  /** Unstages selected Git paths. */
  async unstage(
    projectPath: string,
    sourceId: string | null,
    paths: string[]
  ): Promise<OpenCodexGitStatus> {
    return await this.handler.unstageGitPaths(projectPath, sourceId, paths);
  }

  /** Creates a Git commit from staged files. */
  async commit(
    projectPath: string,
    sourceId: string | null,
    message: string
  ): Promise<OpenCodexGitCommitResult> {
    return await this.handler.commitGitChanges(projectPath, sourceId, message);
  }

  /** Pushes local commits to the configured upstream. */
  async push(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await this.handler.pushGitChanges(projectPath, sourceId);
  }

  /** Publishes the current local branch and configures its upstream. */
  async publishCurrentBranch(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitStatus> {
    return await this.handler.publishCurrentGitBranch(projectPath, sourceId);
  }

  /** Pulls remote commits from the configured upstream. */
  async pull(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await this.handler.pullGitChanges(projectPath, sourceId);
  }
}
