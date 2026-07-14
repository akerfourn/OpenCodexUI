/**
 * Runs Git commands in the filesystem owned by a Codex source.
 */
import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexGitBranch,
  OpenCodexGitBranchKind,
  OpenCodexGitCommitDetails,
  OpenCodexGitCommitFileChange,
  OpenCodexGitCommitResult,
  OpenCodexGitFileState,
  OpenCodexGitLogPage,
  OpenCodexGitRemote,
  OpenCodexGitStatus,
  OpenCodexGitTag,
  OpenCodexGitTagFetchResult,
  OpenCodexGitTagListResult
} from "@open-codex-ui/opencodex-protocol";

import { parseGitStatus } from "./gitStatusParser.js";

type GitProcessResult = Pick<
  v2.ProcessExitedNotification,
  "exitCode" | "stdout" | "stdoutCapReached" | "stderr" | "stderrCapReached"
>;

type PendingCommitMessageSource = {
  markerPath: string;
  messagePath: string;
};

type RemoteTagSnapshot = {
  remoteName: string | null;
  tags: Map<string, string>;
  error: string | null;
};

export type OpenCodexStagedCommitContext = {
  stat: string;
  nameStatus: string;
  diff: string;
  isDiffTruncated: boolean;
};

export type GitServiceOptions = {
  ensureClient(sourceId: string | null): Promise<CodexAppServerClient>;
};

const commitDiffBytesCap = 220_000;
const gitLogPageSizeMax = 100;

/**
 * Coordinates Git operations through Codex app-server command execution.
 */
export class GitService {
  /**
   * Creates a Git service.
   *
   * @param options Codex client resolver used to run Git in the project source.
   */
  constructor(private readonly options: GitServiceOptions) {}

  /**
   * Reads repository status for a project.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Parsed Git status.
   */
  async status(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    const repositoryCheck = await this.runGit(projectPath, sourceId, [
      "rev-parse",
      "--is-inside-work-tree"
    ], { allowFailure: true });

    if (repositoryCheck.exitCode !== 0 || repositoryCheck.stdout.trim() !== "true") {
      return createEmptyGitStatus();
    }

    const response = await this.runGit(projectPath, sourceId, [
      "status",
      "--porcelain=v2",
      "-z",
      "--branch"
    ], { allowFailure: true });

    if (response.exitCode !== 0) {
      throw new Error(createGitErrorMessage(response));
    }

    const status = parseGitStatus(response.stdout);
    const pendingCommitMessage = status.stagedFiles.length > 0
      ? await this.readPendingCommitMessage(projectPath, sourceId)
      : null;
    const remotes = await this.remotes(projectPath, sourceId);

    return {
      ...status,
      pendingCommitMessage,
      remotes
    };
  }

  /**
   * Initializes a repository and returns its refreshed status.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Refreshed Git status.
   */
  async init(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    await this.runGit(projectPath, sourceId, ["init"]);
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
    const response = await this.runGit(projectPath, sourceId, ["remote", "-v"]);
    return parseGitRemotes(response.stdout);
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
    const remoteName = normalizeRemoteInput(name, "Remote name is required.");
    const remoteUrl = normalizeRemoteInput(url, "Remote URL is required.");
    const remotes = await this.remotes(projectPath, sourceId);
    const existingRemote = remotes.find((remote) => remote.name === remoteName) ?? null;

    if (existingRemote === null) {
      await this.runGit(projectPath, sourceId, ["remote", "add", remoteName, remoteUrl]);
    } else {
      await this.runGit(projectPath, sourceId, ["remote", "set-url", remoteName, remoteUrl]);
    }

    return await this.status(projectPath, sourceId);
  }

  /**
   * Lists local and remote branches.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Local branches followed by remote branches.
   */
  async branches(projectPath: string, sourceId: string | null): Promise<OpenCodexGitBranch[]> {
    const currentBranchResponse = await this.runGit(projectPath, sourceId, [
      "branch",
      "--show-current"
    ]);
    const currentBranchName = currentBranchResponse.stdout.trim();
    const response = await this.runGit(projectPath, sourceId, [
      "for-each-ref",
      "--format=%(refname)%09%(refname:short)%09%(upstream:short)",
      "refs/heads",
      "refs/remotes"
    ]);

    return parseGitBranches(response.stdout, currentBranchName);
  }

  /**
   * Lists Git tags.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Existing tags, newest first when Git can provide a date.
   */
  async tags(projectPath: string, sourceId: string | null): Promise<OpenCodexGitTagListResult> {
    const response = await this.runGit(projectPath, sourceId, [
      "for-each-ref",
      "--sort=-creatordate",
      "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
      "refs/tags"
    ]);
    const localTags = parseGitTags(response.stdout);
    const remoteSnapshot = await this.readRemoteTags(projectPath, sourceId);

    return {
      tags: mergeTagSynchronization(localTags, remoteSnapshot),
      remoteName: remoteSnapshot.remoteName,
      remoteError: remoteSnapshot.error
    };
  }

  /**
   * Fetches remote tags and returns the refreshed local tag list.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Refreshed tag collection and optional fetch warning.
   */
  async fetchTags(projectPath: string, sourceId: string | null): Promise<OpenCodexGitTagFetchResult> {
    const warning = await this.fetchTagsBestEffort(projectPath, sourceId);
    const result = await this.tags(projectPath, sourceId);

    return {
      ...result,
      warning
    };
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
    const normalizedTagName = normalizeTagName(tagName);
    await this.validateTagName(projectPath, sourceId, normalizedTagName);
    await this.runGit(projectPath, sourceId, ["tag", normalizedTagName]);
    return await this.tags(projectPath, sourceId);
  }

  /**
   * Pushes one local tag to the configured remote.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param tagName Tag name.
   * @param force Whether an existing remote tag may be replaced.
   * @returns Refreshed tag listing.
   */
  async pushTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string,
    force: boolean
  ): Promise<OpenCodexGitTagListResult> {
    const normalizedTagName = normalizeTagName(tagName);
    await this.validateTagName(projectPath, sourceId, normalizedTagName);
    const remoteName = await this.resolveDefaultRemoteName(projectPath, sourceId);
    const refspec = `refs/tags/${normalizedTagName}`;
    const args = force
      ? ["push", "--force", remoteName, refspec]
      : ["push", remoteName, refspec];

    await this.runGit(projectPath, sourceId, args, { timeoutMs: 120_000 });

    return await this.tags(projectPath, sourceId);
  }

  /**
   * Pushes all local tags to the configured remote.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Refreshed tag listing.
   */
  async pushTags(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexGitTagListResult> {
    const remoteName = await this.resolveDefaultRemoteName(projectPath, sourceId);
    await this.runGit(projectPath, sourceId, ["push", remoteName, "--tags"], {
      timeoutMs: 120_000
    });

    return await this.tags(projectPath, sourceId);
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
    const normalizedTagName = normalizeTagName(tagName);
    const response = await this.runGit(projectPath, sourceId, [
      "rev-list",
      "--count",
      `${normalizedTagName}..HEAD`
    ]);
    const count = Number.parseInt(response.stdout.trim(), 10);

    if (!Number.isFinite(count)) {
      throw new Error("Unable to read commit count since tag.");
    }

    return count;
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
    const normalizedLimit = normalizeLogLimit(limit);
    const normalizedSkip = normalizeLogSkip(skip);
    const response = await this.runGit(projectPath, sourceId, [
      "log",
      `--max-count=${normalizedLimit + 1}`,
      `--skip=${normalizedSkip}`,
      "--date=iso-strict",
      "--format=%x1e%H%x09%h%x09%an%x09%ae%x09%aI%x09%s%x09%D"
    ]);
    const commits = parseGitLog(response.stdout);

    return {
      commits: commits.slice(0, normalizedLimit),
      hasMore: commits.length > normalizedLimit
    };
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
    const normalizedHash = normalizeCommitHash(hash);
    const [messageResponse, filesResponse] = await Promise.all([
      this.runGit(projectPath, sourceId, ["show", "-s", "--format=%B", normalizedHash]),
      this.runGit(projectPath, sourceId, ["show", "--format=", "--name-status", normalizedHash])
    ]);

    return {
      hash: normalizedHash,
      message: messageResponse.stdout.trim(),
      files: parseCommitFileChanges(filesResponse.stdout)
    };
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
    const normalizedBranchName = normalizeBranchName(branchName);
    const args = branchKind === "remote"
      ? ["checkout", "--track", normalizedBranchName]
      : ["checkout", normalizedBranchName];

    await this.runGit(projectPath, sourceId, args);
    return await this.status(projectPath, sourceId);
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
    const normalizedBranchName = normalizeBranchName(branchName);
    await this.validateBranchName(projectPath, sourceId, normalizedBranchName);
    await this.runGit(projectPath, sourceId, ["checkout", "-b", normalizedBranchName]);
    return await this.status(projectPath, sourceId);
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
    const normalizedBranchName = normalizeBranchName(branchName);
    await this.runGit(projectPath, sourceId, ["merge", normalizedBranchName], {
      timeoutMs: 120_000
    });
    return await this.status(projectPath, sourceId);
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
    await this.runGit(projectPath, sourceId, ["add", "--", ...normalizePaths(paths)]);
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
    await this.runGit(projectPath, sourceId, ["restore", "--staged", "--", ...normalizePaths(paths)]);
    return await this.status(projectPath, sourceId);
  }

  /**
   * Creates a commit from staged files.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param message Commit message.
   * @returns Commit result output.
   */
  async commit(
    projectPath: string,
    sourceId: string | null,
    message: string
  ): Promise<OpenCodexGitCommitResult> {
    const normalizedMessage = message.trim();

    if (normalizedMessage.length === 0) {
      throw new Error("Commit message is required.");
    }

    const response = await this.runGit(projectPath, sourceId, ["commit", "-m", normalizedMessage]);

    return {
      ok: true,
      output: [response.stdout, response.stderr].filter((entry) => entry.trim().length > 0).join("\n")
    };
  }

  /**
   * Pushes local commits to the configured upstream.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Refreshed status.
   */
  async push(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    await this.runGit(projectPath, sourceId, ["push"], { timeoutMs: 120_000 });
    return await this.status(projectPath, sourceId);
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
    const status = await this.status(projectPath, sourceId);

    if (!status.isRepository) {
      throw new Error("This project is not a Git repository.");
    }

    if (status.branchName === null) {
      throw new Error("Cannot publish a detached HEAD.");
    }

    if (status.upstreamName !== null) {
      return await this.push(projectPath, sourceId);
    }

    const remoteName = await this.resolveDefaultRemoteName(projectPath, sourceId);
    await this.runGit(
      projectPath,
      sourceId,
      ["push", "--set-upstream", remoteName, status.branchName],
      { timeoutMs: 120_000 }
    );

    return await this.status(projectPath, sourceId);
  }

  /**
   * Pulls remote commits from the configured upstream.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Refreshed status.
   */
  async pull(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    await this.runGit(projectPath, sourceId, ["pull", "--ff-only"], { timeoutMs: 120_000 });
    return await this.status(projectPath, sourceId);
  }

  private async resolveDefaultRemoteName(
    projectPath: string,
    sourceId: string | null
  ): Promise<string> {
    const response = await this.runGit(projectPath, sourceId, ["remote"]);
    const remotes = response.stdout
      .split("\n")
      .map((remoteName) => remoteName.trim())
      .filter((remoteName) => remoteName.length > 0);

    if (remotes.length === 0) {
      throw new Error("No Git remote is configured for this repository.");
    }

    const firstRemoteName = remotes[0];

    if (firstRemoteName === undefined) {
      throw new Error("No Git remote is configured for this repository.");
    }

    return remotes.includes("origin") ? "origin" : firstRemoteName;
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
    const [stat, nameStatus, diff] = await Promise.all([
      this.runGit(projectPath, sourceId, ["diff", "--cached", "--stat"]),
      this.runGit(projectPath, sourceId, ["diff", "--cached", "--name-status"]),
      this.runGit(projectPath, sourceId, ["diff", "--cached"], { outputBytesCap: commitDiffBytesCap })
    ]);

    return {
      stat: stat.stdout,
      nameStatus: nameStatus.stdout,
      diff: diff.stdout,
      isDiffTruncated: diff.stdoutCapReached === true
    };
  }

  private async readPendingCommitMessage(
    projectPath: string,
    sourceId: string | null
  ): Promise<string | null> {
    const client = await this.options.ensureClient(sourceId);
    const source = await this.findPendingCommitMessageSource(projectPath, sourceId);

    if (source === null) {
      return null;
    }

    const messagePath = await this.resolveGitPath(projectPath, sourceId, source.messagePath);

    if (messagePath === null) {
      return null;
    }

    try {
      const response = await client.request<v2.FsReadFileResponse>("fs/readFile", {
        path: messagePath
      });
      const message = Buffer.from(response.dataBase64, "base64").toString("utf8").trim();
      return message.length > 0 ? message : null;
    } catch {
      return null;
    }
  }

  private async findPendingCommitMessageSource(
    projectPath: string,
    sourceId: string | null
  ): Promise<PendingCommitMessageSource | null> {
    const sources: PendingCommitMessageSource[] = [
      { markerPath: "REVERT_HEAD", messagePath: "MERGE_MSG" },
      { markerPath: "MERGE_HEAD", messagePath: "MERGE_MSG" },
      { markerPath: "CHERRY_PICK_HEAD", messagePath: "MERGE_MSG" },
      { markerPath: "rebase-merge", messagePath: "COMMIT_EDITMSG" },
      { markerPath: "rebase-apply", messagePath: "COMMIT_EDITMSG" }
    ];

    for (const source of sources) {
      const hasMarker = await this.hasGitPath(projectPath, sourceId, source.markerPath);

      if (hasMarker) {
        return source;
      }
    }

    return null;
  }

  private async hasGitPath(
    projectPath: string,
    sourceId: string | null,
    path: string
  ): Promise<boolean> {
    const client = await this.options.ensureClient(sourceId);
    const resolvedPath = await this.resolveGitPath(projectPath, sourceId, path);

    if (resolvedPath === null) {
      return false;
    }

    try {
      const metadata = await client.request<v2.FsGetMetadataResponse>("fs/getMetadata", {
        path: resolvedPath
      });
      return metadata.isFile || metadata.isDirectory;
    } catch {
      return false;
    }
  }

  private async resolveGitPath(
    projectPath: string,
    sourceId: string | null,
    path: string
  ): Promise<string | null> {
    const response = await this.runGit(projectPath, sourceId, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      path
    ], { allowFailure: true });
    const resolvedPath = response.stdout.trim();

    if (response.exitCode !== 0 || resolvedPath.length === 0) {
      return null;
    }

    return resolvedPath;
  }

  private async validateBranchName(
    projectPath: string,
    sourceId: string | null,
    branchName: string
  ): Promise<void> {
    const response = await this.runGit(projectPath, sourceId, [
      "check-ref-format",
      "--branch",
      branchName
    ], { allowFailure: true });

    if (response.exitCode !== 0) {
      throw new Error(createGitErrorMessage(response));
    }
  }

  private async validateTagName(
    projectPath: string,
    sourceId: string | null,
    tagName: string
  ): Promise<void> {
    if (tagName.startsWith("-")) {
      throw new Error("Tag name cannot start with a dash.");
    }

    const response = await this.runGit(projectPath, sourceId, [
      "check-ref-format",
      `refs/tags/${tagName}`
    ], { allowFailure: true });

    if (response.exitCode !== 0) {
      throw new Error(createGitErrorMessage(response));
    }
  }

  /**
   * Reads tags directly from the configured remote without changing local refs.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Remote tag snapshot and an optional read error.
   */
  private async readRemoteTags(
    projectPath: string,
    sourceId: string | null
  ): Promise<RemoteTagSnapshot> {
    let remoteName: string;

    try {
      remoteName = await this.resolveDefaultRemoteName(projectPath, sourceId);
    } catch (error) {
      const message = readUnknownErrorMessage(error);

      if (message === "No Git remote is configured for this repository.") {
        return {
          remoteName: null,
          tags: new Map<string, string>(),
          error: null
        };
      }

      return {
        remoteName: null,
        tags: new Map<string, string>(),
        error: message
      };
    }

    const response = await this.runGit(
      projectPath,
      sourceId,
      ["ls-remote", "--tags", "--refs", remoteName],
      { allowFailure: true, timeoutMs: 120_000 }
    );

    if (response.exitCode !== 0) {
      return {
        remoteName,
        tags: new Map<string, string>(),
        error: createGitErrorMessage(response)
      };
    }

    return {
      remoteName,
      tags: parseRemoteTags(response.stdout),
      error: null
    };
  }

  /**
   * Fetches tags without failing the main tag-listing workflow.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Warning text when a fallback was needed, or `null`.
   */
  private async fetchTagsBestEffort(projectPath: string, sourceId: string | null): Promise<string | null> {
    try {
      await this.runGit(projectPath, sourceId, ["fetch", "--tags", "--prune-tags"], {
        timeoutMs: 120_000
      });
      return null;
    } catch (pruneError) {
      try {
        await this.runGit(projectPath, sourceId, ["fetch", "--tags"], {
          timeoutMs: 120_000
        });

        return readUnknownErrorMessage(pruneError);
      } catch (fetchError) {
        return [
          readUnknownErrorMessage(pruneError),
          readUnknownErrorMessage(fetchError)
        ].join("\n");
      }
    }
  }

  /**
   * Runs Git through the Codex app-server process API.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param args Git arguments without the leading `git`.
   * @param options Failure, timeout, and output options.
   * @returns Captured Git process result.
   */
  private async runGit(
    projectPath: string,
    sourceId: string | null,
    args: string[],
    options: { allowFailure?: boolean; timeoutMs?: number; outputBytesCap?: number } = {}
  ): Promise<GitProcessResult> {
    if (sourceId === null) {
      throw new Error("Git operations require a Codex source.");
    }

    const client = await this.options.ensureClient(sourceId);
    const response = await runHostProcess(client, {
      command: ["git", ...args],
      cwd: projectPath,
      timeoutMs: options.timeoutMs ?? 30_000,
      outputBytesCap: options.outputBytesCap ?? 2_000_000
    });

    if (response.exitCode !== 0 && options.allowFailure !== true) {
      throw new Error(createGitErrorMessage(response));
    }

    return response;
  }
}

/**
 * Runs a host process through Codex and waits for its exit notification.
 *
 * @param client Codex app-server client.
 * @param params Process spawn params except the generated handle.
 * @returns Captured process result.
 */
async function runHostProcess(
  client: CodexAppServerClient,
  params: Omit<v2.ProcessSpawnParams, "processHandle">
): Promise<GitProcessResult> {
  const processHandle = `opencodex-git-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return await new Promise<GitProcessResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`Timed out waiting for Git process ${processHandle}.`));
    }, (params.timeoutMs ?? 30_000) + 5_000);
    const subscription = client.onNotification((notification) => {
      if (notification.method !== "process/exited") {
        return;
      }

      const exit = readProcessExitedNotification(notification.params);

      if (exit === null || exit.processHandle !== processHandle) {
        return;
      }

      clearTimeout(timeout);
      subscription.dispose();
      resolve(exit);
    });

    client.request<v2.ProcessSpawnResponse>("process/spawn", {
      ...params,
      processHandle
    }).catch((error: unknown) => {
      clearTimeout(timeout);
      subscription.dispose();
      reject(error);
    });
  });
}

/**
 * Reads a process exit notification with the fields required by GitService.
 *
 * @param value Raw notification params.
 * @returns Process result, or `null` when the payload is invalid.
 */
function readProcessExitedNotification(value: unknown): v2.ProcessExitedNotification | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const params = value as Partial<v2.ProcessExitedNotification>;

  if (
    typeof params.processHandle !== "string" ||
    typeof params.exitCode !== "number" ||
    typeof params.stdout !== "string" ||
    typeof params.stderr !== "string"
  ) {
    return null;
  }

  return {
    processHandle: params.processHandle,
    exitCode: params.exitCode,
    stdout: params.stdout,
    stdoutCapReached: params.stdoutCapReached === true,
    stderr: params.stderr,
    stderrCapReached: params.stderrCapReached === true
  };
}

/**
 * Creates the status returned for paths that are not Git repositories.
 *
 * @returns Empty non-repository status DTO.
 */
function createEmptyGitStatus(): OpenCodexGitStatus {
  return {
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
}

/**
 * Parses `git remote -v` output.
 *
 * @param output Raw command output.
 * @returns Git remotes grouped by name.
 */
function parseGitRemotes(output: string): OpenCodexGitRemote[] {
  const remotesByName = new Map<string, OpenCodexGitRemote>();

  output.split("\n").forEach((line) => {
    const parsedRemote = parseGitRemoteLine(line);

    if (parsedRemote === null) {
      return;
    }

    const currentRemote = remotesByName.get(parsedRemote.name) ?? {
      name: parsedRemote.name,
      fetchUrl: null,
      pushUrl: null
    };

    if (parsedRemote.kind === "fetch") {
      currentRemote.fetchUrl = parsedRemote.url;
    }

    if (parsedRemote.kind === "push") {
      currentRemote.pushUrl = parsedRemote.url;
    }

    remotesByName.set(parsedRemote.name, currentRemote);
  });

  return Array.from(remotesByName.values()).sort((left, right) => (
    left.name.localeCompare(right.name)
  ));
}

/**
 * Parses one `git remote -v` line.
 *
 * @param line Raw remote line.
 * @returns Parsed remote endpoint, or `null`.
 */
function parseGitRemoteLine(line: string): {
  name: string;
  url: string;
  kind: "fetch" | "push";
} | null {
  const match = /^(\S+)\s+(.+)\s+\((fetch|push)\)$/.exec(line.trim());

  if (match === null) {
    return null;
  }

  const [, name, url, rawKind] = match;

  if (name === undefined || url === undefined || rawKind === undefined) {
    return null;
  }

  const kind = rawKind === "push" ? "push" : "fetch";

  return {
    name,
    url,
    kind
  };
}

/**
 * Trims and validates a remote name or URL.
 *
 * @param value Raw user input.
 * @param errorMessage Error message used when empty.
 * @returns Normalized input.
 */
function normalizeRemoteInput(value: string, errorMessage: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new Error(errorMessage);
  }

  return normalizedValue;
}

/**
 * Parses local and remote branch rows from `git for-each-ref`.
 *
 * @param output Raw command output.
 * @param currentBranchName Current local branch name.
 * @returns Sorted branch DTOs.
 */
function parseGitBranches(output: string, currentBranchName: string): OpenCodexGitBranch[] {
  const branches = output
    .split("\n")
    .map((line) => parseGitBranchLine(line, currentBranchName))
    .filter((branch): branch is OpenCodexGitBranch => branch !== null);

  return branches.sort((first, second) => {
    if (first.kind !== second.kind) {
      return first.kind === "local" ? -1 : 1;
    }

    return first.name.localeCompare(second.name);
  });
}

/**
 * Parses one branch row from `git for-each-ref`.
 *
 * @param line Raw branch row.
 * @param currentBranchName Current local branch name.
 * @returns Branch DTO, or `null` when unsupported.
 */
function parseGitBranchLine(line: string, currentBranchName: string): OpenCodexGitBranch | null {
  const trimmedLine = line.trim();

  if (trimmedLine.length === 0) {
    return null;
  }

  const columns = trimmedLine.split("\t");
  const fullName = columns[0] ?? "";
  const shortName = columns[1] ?? "";
  const upstreamName = columns[2] ?? "";
  const kind = readBranchKind(fullName);

  if (kind === null || shortName.length === 0 || shortName.endsWith("/HEAD")) {
    return null;
  }

  return {
    name: shortName,
    fullName,
    kind,
    upstreamName: upstreamName.length > 0 ? upstreamName : null,
    isCurrent: kind === "local" && shortName === currentBranchName
  };
}

/**
 * Parses tag rows from `git for-each-ref`.
 *
 * @param output Raw command output.
 * @returns Tag DTOs.
 */
function parseGitTags(output: string): OpenCodexGitTag[] {
  return output
    .split("\n")
    .map(parseGitTagLine)
    .filter((tag): tag is OpenCodexGitTag => tag !== null);
}

/**
 * Parses one tag row from `git for-each-ref`.
 *
 * @param line Raw tag row.
 * @returns Tag DTO, or `null` when invalid.
 */
function parseGitTagLine(line: string): OpenCodexGitTag | null {
  const trimmedLine = line.trim();

  if (trimmedLine.length === 0) {
    return null;
  }

  const columns = trimmedLine.split("\t");
  const fullName = columns[0] ?? "";
  const shortName = columns[1] ?? "";
  const targetHash = columns[2] ?? "";
  const createdAt = columns[3] ?? "";

  if (!fullName.startsWith("refs/tags/") || shortName.length === 0) {
    return null;
  }

  return {
    name: shortName,
    fullName,
    targetHash: targetHash.length > 0 ? targetHash : null,
    createdAt: createdAt.length > 0 ? createdAt : null,
    remoteTargetHash: null,
    syncStatus: "unknown"
  };
}

/**
 * Parses `git ls-remote --tags --refs` output.
 *
 * @param output Raw remote tag output.
 * @returns Remote tag hashes indexed by tag name.
 */
function parseRemoteTags(output: string): Map<string, string> {
  const remoteTags = new Map<string, string>();

  output.split("\n").forEach((line) => {
    const columns = line.trim().split("\t");
    const targetHash = columns[0] ?? "";
    const fullName = columns[1] ?? "";

    if (!fullName.startsWith("refs/tags/") || targetHash.length === 0) {
      return;
    }

    remoteTags.set(fullName.slice("refs/tags/".length), targetHash);
  });

  return remoteTags;
}

/**
 * Combines local tags with the latest remote tag snapshot.
 *
 * @param localTags Local tag rows.
 * @param remoteSnapshot Remote tag snapshot.
 * @returns Local tags annotated with synchronization state.
 */
function mergeTagSynchronization(
  localTags: OpenCodexGitTag[],
  remoteSnapshot: RemoteTagSnapshot
): OpenCodexGitTag[] {
  return localTags.map((tag) => {
    const remoteTargetHash = remoteSnapshot.tags.get(tag.name) ?? null;
    const syncStatus = readTagSyncStatus(tag.targetHash, remoteTargetHash, remoteSnapshot);

    return {
      ...tag,
      remoteTargetHash,
      syncStatus
    };
  });
}

/**
 * Determines the synchronization state for one local tag.
 *
 * @param localTargetHash Local tag object hash.
 * @param remoteTargetHash Remote tag object hash.
 * @param remoteSnapshot Remote read state.
 * @returns Tag synchronization status.
 */
function readTagSyncStatus(
  localTargetHash: string | null,
  remoteTargetHash: string | null,
  remoteSnapshot: RemoteTagSnapshot
): OpenCodexGitTag["syncStatus"] {
  if (remoteSnapshot.remoteName === null || remoteSnapshot.error !== null) {
    return "unknown";
  }

  if (localTargetHash === null || remoteTargetHash === null) {
    return "local-only";
  }

  return localTargetHash === remoteTargetHash ? "synced" : "diverged";
}

/**
 * Parses paginated Git log records.
 *
 * @param output Raw log output separated by record separators.
 * @returns Commit summaries.
 */
function parseGitLog(output: string): OpenCodexGitLogPage["commits"] {
  return output
    .split("\x1e")
    .map(parseGitLogRecord)
    .filter((commit): commit is OpenCodexGitLogPage["commits"][number] => commit !== null);
}

/**
 * Parses one Git log record.
 *
 * @param record Raw log record.
 * @returns Commit summary, or `null` when incomplete.
 */
function parseGitLogRecord(record: string): OpenCodexGitLogPage["commits"][number] | null {
  const trimmedRecord = record.trim();

  if (trimmedRecord.length === 0) {
    return null;
  }

  const columns = trimmedRecord.split("\t");
  const hash = columns[0] ?? "";
  const shortHash = columns[1] ?? "";
  const authorName = columns[2] ?? "";
  const authorEmail = columns[3] ?? "";
  const authoredAt = columns[4] ?? "";
  const subject = columns[5] ?? "";
  const refs = columns[6] ?? "";

  if (hash.length === 0 || shortHash.length === 0) {
    return null;
  }

  return {
    hash,
    shortHash,
    authorName,
    authorEmail,
    authoredAt: authoredAt.length > 0 ? authoredAt : null,
    subject,
    refs: parseGitRefs(refs)
  };
}

/**
 * Parses decorated refs from one log record.
 *
 * @param value Raw refs string.
 * @returns Ref labels.
 */
function parseGitRefs(value: string): string[] {
  return value
    .split(",")
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0);
}

/**
 * Parses file changes for one commit.
 *
 * @param output Raw `git show --name-status` output.
 * @returns File changes.
 */
function parseCommitFileChanges(output: string): OpenCodexGitCommitFileChange[] {
  return output
    .split("\n")
    .map(parseCommitFileChangeLine)
    .filter((file): file is OpenCodexGitCommitFileChange => file !== null);
}

/**
 * Parses one commit file-change row.
 *
 * @param line Raw name-status line.
 * @returns File change DTO, or `null`.
 */
function parseCommitFileChangeLine(line: string): OpenCodexGitCommitFileChange | null {
  const trimmedLine = line.trim();

  if (trimmedLine.length === 0) {
    return null;
  }

  const columns = trimmedLine.split("\t");
  const rawStatus = columns[0] ?? "";
  const firstPath = columns[1] ?? "";
  const secondPath = columns[2] ?? "";
  const status = parseCommitFileStatus(rawStatus);

  if (firstPath.length === 0) {
    return null;
  }

  if (status === "renamed" || status === "copied") {
    return {
      status,
      path: secondPath.length > 0 ? secondPath : firstPath,
      originalPath: firstPath
    };
  }

  return {
    status,
    path: firstPath,
    originalPath: null
  };
}

/**
 * Maps a Git name-status code to the protocol file state.
 *
 * @param value Raw status token.
 * @returns File state.
 */
function parseCommitFileStatus(value: string): OpenCodexGitFileState {
  const statusCode = value.charAt(0);

  switch (statusCode) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    default:
      return "unknown";
  }
}

/**
 * Reads the branch kind from a full ref name.
 *
 * @param fullName Full Git ref name.
 * @returns Branch kind, or `null`.
 */
function readBranchKind(fullName: string): OpenCodexGitBranchKind | null {
  if (fullName.startsWith("refs/heads/")) {
    return "local";
  }

  if (fullName.startsWith("refs/remotes/")) {
    return "remote";
  }

  return null;
}

/**
 * Trims and validates a branch name.
 *
 * @param branchName Raw branch name.
 * @returns Normalized branch name.
 */
function normalizeBranchName(branchName: string): string {
  const normalizedBranchName = branchName.trim();

  if (normalizedBranchName.length === 0) {
    throw new Error("Branch name is required.");
  }

  return normalizedBranchName;
}

/**
 * Trims and validates a tag name.
 *
 * @param tagName Raw tag name.
 * @returns Normalized tag name.
 */
function normalizeTagName(tagName: string): string {
  const normalizedTagName = tagName.trim();

  if (normalizedTagName.length === 0) {
    throw new Error("Tag name is required.");
  }

  return normalizedTagName;
}

/**
 * Trims and validates a commit hash.
 *
 * @param hash Raw commit hash.
 * @returns Normalized commit hash.
 */
function normalizeCommitHash(hash: string): string {
  const normalizedHash = hash.trim();

  if (normalizedHash.length === 0 || normalizedHash.startsWith("-")) {
    throw new Error("Commit hash is required.");
  }

  return normalizedHash;
}

/**
 * Normalizes Git log page size.
 *
 * @param limit Requested page size.
 * @returns Page size clamped to supported bounds.
 */
function normalizeLogLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 50;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), gitLogPageSizeMax);
}

/**
 * Normalizes Git log skip count.
 *
 * @param skip Requested skip count.
 * @returns Non-negative skip count.
 */
function normalizeLogSkip(skip: number): number {
  if (!Number.isFinite(skip)) {
    return 0;
  }

  return Math.max(Math.trunc(skip), 0);
}

/**
 * Trims and validates a list of file paths.
 *
 * @param paths Raw path list.
 * @returns Non-empty normalized path list.
 */
function normalizePaths(paths: string[]): string[] {
  const normalizedPaths = paths.map((path) => path.trim()).filter((path) => path.length > 0);

  if (normalizedPaths.length === 0) {
    throw new Error("At least one path is required.");
  }

  return normalizedPaths;
}

/**
 * Builds a user-facing error message from a failed Git process.
 *
 * @param response Failed process result.
 * @returns Error message.
 */
function createGitErrorMessage(response: GitProcessResult): string {
  const message = [response.stderr, response.stdout]
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .join("\n");

  return message.length > 0 ? message : `Git exited with code ${response.exitCode}.`;
}

/**
 * Reads an error message from unknown thrown values.
 *
 * @param error Unknown error.
 * @returns Human-readable message.
 */
function readUnknownErrorMessage(error: unknown): string {
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
