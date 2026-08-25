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

import { CommitMessageService } from "../commit/CommitMessageService.js";
import { GitService } from "../GitService.js";
import type { ThreadRuntimeHandler } from "../threads/ThreadRuntimeHandler.js";
import { readGitVersionStatus } from "../sources/toolVersionDetection.js";
import type { ClientPort, RuntimeSettingsPort } from "../runtime/runtimePorts.js";
import type { UsageRuntimeService } from "../usage/UsageRuntimeService.js";

/** Dependencies needed by the Git and commit-message runtime boundary. */
export type GitRuntimeHandlerOptions = {
  userDataPath?: string;
  defaultPromptPath?: string;
  generationPromptPath?: string;
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  clients: Pick<ClientPort, "ensureClient">;
  threads: Pick<ThreadRuntimeHandler, "ignoreThreadNotifications" | "releaseThreadNotifications">;
  usage: Pick<UsageRuntimeService, "onCommitGenerationStarted" | "onCommitGenerationFinished">;
  logger?: (message: string) => void;
};

/**
 * Exposes Git operations and one-shot commit-message generation to the runtime.
 *
 * The handler deliberately keeps the host-local Git version probe separate from
 * source-owned Git operations, which are delegated through {@link GitService}.
 */
export class GitRuntimeHandler {
  /** Performs source-scoped Git operations through Codex clients. */
  private readonly gitService: GitService;
  /** Manages the editable commit prompt and one-shot message generation. */
  private readonly commitMessageService: CommitMessageService;

  /**
   * Creates a Git runtime handler and wires its two focused services.
   *
   * @param options Source client, prompt, thread, usage, and logging services.
   */
  constructor(options: GitRuntimeHandlerOptions) {
    this.gitService = new GitService({
      clients: options.clients
    });
    this.commitMessageService = new CommitMessageService({
      userDataPath: options.userDataPath,
      defaultPromptPath: options.defaultPromptPath,
      generationPromptPath: options.generationPromptPath,
      gitService: this.gitService,
      settings: options.settings,
      clients: options.clients,
      threads: options.threads,
      usage: options.usage,
      logger: options.logger
    });
  }

  /** Reads the host-local Git version and availability status. */
  async readGitVersion(): Promise<OpenCodexToolVersionStatus> {
    return await readGitVersionStatus();
  }

  /** Reads Git status for a project through its source. */
  async readGitStatus(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await this.gitService.status(projectPath, sourceId);
  }

  /** Initializes a Git repository and returns its refreshed status. */
  async initializeGitRepository(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitStatus> {
    return await this.gitService.init(projectPath, sourceId);
  }

  /** Lists configured Git remotes for a project. */
  async listGitRemotes(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitRemote[]> {
    return await this.gitService.remotes(projectPath, sourceId);
  }

  /** Adds or updates one Git remote and returns refreshed status. */
  async upsertGitRemote(
    projectPath: string,
    sourceId: string | null,
    name: string,
    url: string
  ): Promise<OpenCodexGitStatus> {
    return await this.gitService.upsertRemote(projectPath, sourceId, name, url);
  }

  /** Lists local and remote Git branches for a project. */
  async listGitBranches(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitBranch[]> {
    return await this.gitService.branches(projectPath, sourceId);
  }

  /** Lists local and remote Git tags for a project. */
  async listGitTags(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitTagListResult> {
    return await this.gitService.tags(projectPath, sourceId);
  }

  /** Fetches remote Git tags and returns the refreshed local tag list. */
  async fetchGitTags(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitTagFetchResult> {
    return await this.gitService.fetchTags(projectPath, sourceId);
  }

  /** Creates a lightweight Git tag and returns the refreshed tag list. */
  async createGitTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string
  ): Promise<OpenCodexGitTagListResult> {
    return await this.gitService.createTag(projectPath, sourceId, tagName);
  }

  /** Pushes one Git tag to the configured remote. */
  async pushGitTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string,
    force: boolean
  ): Promise<OpenCodexGitTagListResult> {
    return await this.gitService.pushTag(projectPath, sourceId, tagName, force);
  }

  /** Pushes all local Git tags to the configured remote. */
  async pushGitTags(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitTagListResult> {
    return await this.gitService.pushTags(projectPath, sourceId);
  }

  /** Counts commits since a reference tag. */
  async countGitCommitsSinceTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string
  ): Promise<number> {
    return await this.gitService.commitsSinceTag(projectPath, sourceId, tagName);
  }

  /** Reads one bounded page of Git history. */
  async readGitLog(
    projectPath: string,
    sourceId: string | null,
    limit: number,
    skip: number
  ): Promise<OpenCodexGitLogPage> {
    return await this.gitService.log(projectPath, sourceId, limit, skip);
  }

  /** Reads details for one Git commit. */
  async readGitCommitDetails(
    projectPath: string,
    sourceId: string | null,
    hash: string
  ): Promise<OpenCodexGitCommitDetails> {
    return await this.gitService.commitDetails(projectPath, sourceId, hash);
  }

  /** Checks out an existing local or remote Git branch. */
  async checkoutGitBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string,
    branchKind: OpenCodexGitBranchKind
  ): Promise<OpenCodexGitStatus> {
    return await this.gitService.checkoutBranch(projectPath, sourceId, branchName, branchKind);
  }

  /** Creates and checks out a new Git branch. */
  async createGitBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string
  ): Promise<OpenCodexGitStatus> {
    return await this.gitService.createBranch(projectPath, sourceId, branchName);
  }

  /** Merges an existing Git branch into the current branch. */
  async mergeGitBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string
  ): Promise<OpenCodexGitStatus> {
    return await this.gitService.mergeBranch(projectPath, sourceId, branchName);
  }

  /** Stages selected Git paths. */
  async stageGitPaths(
    projectPath: string,
    sourceId: string | null,
    paths: string[]
  ): Promise<OpenCodexGitStatus> {
    return await this.gitService.stage(projectPath, sourceId, paths);
  }

  /** Unstages selected Git paths. */
  async unstageGitPaths(
    projectPath: string,
    sourceId: string | null,
    paths: string[]
  ): Promise<OpenCodexGitStatus> {
    return await this.gitService.unstage(projectPath, sourceId, paths);
  }

  /** Creates a Git commit from staged files. */
  async commitGitChanges(
    projectPath: string,
    sourceId: string | null,
    message: string
  ): Promise<OpenCodexGitCommitResult> {
    return await this.gitService.commit(projectPath, sourceId, message);
  }

  /** Pushes local commits to the configured upstream. */
  async pushGitChanges(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await this.gitService.push(projectPath, sourceId);
  }

  /** Publishes the current local branch and configures its upstream. */
  async publishCurrentGitBranch(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitStatus> {
    return await this.gitService.publishCurrentBranch(projectPath, sourceId);
  }

  /** Reads the editable commit generation prompt. */
  async readCommitPrompt(): Promise<OpenCodexCommitPrompt> {
    return await this.commitMessageService.readPrompt();
  }

  /** Persists the editable commit generation prompt. */
  async updateCommitPrompt(prompt: string): Promise<OpenCodexCommitPrompt> {
    return await this.commitMessageService.updatePrompt(prompt);
  }

  /** Restores the default commit generation prompt. */
  async resetCommitPrompt(): Promise<OpenCodexCommitPrompt> {
    return await this.commitMessageService.resetPrompt();
  }

  /** Generates a commit message from the currently staged changes. */
  async generateGitCommitMessage(
    projectPath: string,
    sourceId: string | null,
    instruction: string,
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    language: OpenCodexCommitMessageLanguage
  ): Promise<OpenCodexCommitMessageGenerationResult> {
    return await this.commitMessageService.generateCommitMessage(
      projectPath,
      sourceId,
      instruction,
      model,
      reasoningEffort,
      language
    );
  }

  /** Pulls remote commits from the configured upstream. */
  async pullGitChanges(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    return await this.gitService.pull(projectPath, sourceId);
  }
}
