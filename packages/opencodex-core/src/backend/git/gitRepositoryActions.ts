/**
 * Executes the Git actions that read or mutate a repository working tree.
 */
import type { v2 } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexGitCommitResult,
  OpenCodexGitRemote,
  OpenCodexGitStatus
} from "@open-codex-ui/opencodex-protocol";

import { normalizePaths } from "./gitHistoryParsers.js";
import {
  createGitErrorMessage,
  type RunGit
} from "./gitCommandRunner.js";
import { parseGitStatus } from "./gitStatusParser.js";
import type { ClientPort } from "../runtime/runtimePorts.js";

/** Dependencies shared by repository-oriented Git actions. */
export type GitRepositoryActionContext = {
  runGit: RunGit;
  clients: Pick<ClientPort, "ensureClient">;
};

/** Compact staged-change context passed to one-shot commit message generation. */
export type OpenCodexStagedCommitContext = {
  stat: string;
  nameStatus: string;
  numStat: string;
};

type PendingCommitMessageSource = {
  markerPath: string;
  messagePath: string;
};

type ListGitRemotes = (
  projectPath: string,
  sourceId: string | null
) => Promise<OpenCodexGitRemote[]>;

/**
 * Reads the current Git status and configured remotes for a project.
 *
 * @param context Git command runner and source client resolver.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param listRemotes Callback used to avoid coupling this module to the
 *   remote-action module.
 * @returns Parsed Git status, or an empty status for a non-repository path.
 */
export async function readGitStatus(
  context: GitRepositoryActionContext,
  projectPath: string,
  sourceId: string | null,
  listRemotes: ListGitRemotes
): Promise<OpenCodexGitStatus> {
  const repositoryCheck = await context.runGit(projectPath, sourceId, [
    "rev-parse",
    "--is-inside-work-tree"
  ], { allowFailure: true });

  if (repositoryCheck.exitCode !== 0 || repositoryCheck.stdout.trim() !== "true") {
    return createEmptyGitStatus();
  }

  const response = await context.runGit(projectPath, sourceId, [
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
    ? await readPendingCommitMessage(context, projectPath, sourceId)
    : null;
  const remotes = await listRemotes(projectPath, sourceId);

  return {
    ...status,
    pendingCommitMessage,
    remotes
  };
}

/**
 * Initializes a Git repository without reading its status afterward.
 *
 * @param context Git command runner and source client resolver.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Promise resolved after `git init` succeeds.
 */
export async function initializeGitRepository(
  context: GitRepositoryActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<void> {
  await context.runGit(projectPath, sourceId, ["init"]);
}

/**
 * Stages selected paths without reading the refreshed status.
 *
 * @param context Git command runner and source client resolver.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param paths Relative paths to stage.
 * @returns Promise resolved after the paths are staged.
 */
export async function stageGitPaths(
  context: GitRepositoryActionContext,
  projectPath: string,
  sourceId: string | null,
  paths: string[]
): Promise<void> {
  await context.runGit(projectPath, sourceId, ["add", "--", ...normalizePaths(paths)]);
}

/**
 * Unstages selected paths without reading the refreshed status.
 *
 * @param context Git command runner and source client resolver.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param paths Relative paths to unstage.
 * @returns Promise resolved after the paths are unstaged.
 */
export async function unstageGitPaths(
  context: GitRepositoryActionContext,
  projectPath: string,
  sourceId: string | null,
  paths: string[]
): Promise<void> {
  await context.runGit(projectPath, sourceId, [
    "restore",
    "--staged",
    "--",
    ...normalizePaths(paths)
  ]);
}

/**
 * Creates a commit from staged files.
 *
 * @param context Git command runner and source client resolver.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param message Commit message.
 * @param protectedBranches Branches where OpenCodexUI commits are blocked.
 * @returns Successful commit result output.
 */
export async function createGitCommit(
  context: GitRepositoryActionContext,
  projectPath: string,
  sourceId: string | null,
  message: string,
  protectedBranches: readonly string[] = []
): Promise<OpenCodexGitCommitResult> {
  const normalizedMessage = message.trim();

  if (normalizedMessage.length === 0) {
    throw new Error("Commit message is required.");
  }

  if (protectedBranches.length > 0) {
    const currentBranchResponse = await context.runGit(projectPath, sourceId, [
      "branch",
      "--show-current"
    ]);
    const currentBranch = currentBranchResponse.stdout.trim();

    if (protectedBranches.includes(currentBranch)) {
      throw new Error(`Commits are blocked on the protected branch "${currentBranch}".`);
    }
  }

  const response = await context.runGit(projectPath, sourceId, [
    "commit",
    "-m",
    normalizedMessage
  ]);

  return {
    ok: true,
    output: [response.stdout, response.stderr]
      .filter((entry) => entry.trim().length > 0)
      .join("\n")
  };
}

/**
 * Reads the staged Git context used by one-shot commit message generation.
 *
 * @param context Git command runner and source client resolver.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Compact staged-file summaries suitable for an exploratory Codex turn.
 */
export async function readStagedCommitContext(
  context: GitRepositoryActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<OpenCodexStagedCommitContext> {
  const [stat, nameStatus, numStat] = await Promise.all([
    context.runGit(projectPath, sourceId, ["diff", "--cached", "--stat"]),
    context.runGit(projectPath, sourceId, ["diff", "--cached", "--name-status"]),
    context.runGit(projectPath, sourceId, ["diff", "--cached", "--numstat"])
  ]);

  return {
    stat: stat.stdout,
    nameStatus: nameStatus.stdout,
    numStat: numStat.stdout
  };
}

/**
 * Creates the status returned for paths that are not Git repositories.
 *
 * @returns Empty non-repository status DTO.
 */
export function createEmptyGitStatus(): OpenCodexGitStatus {
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
 * Reads a pending merge, revert, cherry-pick, or rebase commit message.
 *
 * @param context Git command runner and source client resolver.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Pending message, or `null` when none can be read.
 */
async function readPendingCommitMessage(
  context: GitRepositoryActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<string | null> {
  const client = await context.clients.ensureClient(sourceId);
  const source = await findPendingCommitMessageSource(context, projectPath, sourceId);

  if (source === null) {
    return null;
  }

  const messagePath = await resolveGitPath(context, projectPath, sourceId, source.messagePath);

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

/**
 * Finds the first Git operation marker with a corresponding message file.
 *
 * @param context Git command runner and source client resolver.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Pending message source, or `null` when no operation is active.
 */
async function findPendingCommitMessageSource(
  context: GitRepositoryActionContext,
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
    const hasMarker = await hasGitPath(context, projectPath, sourceId, source.markerPath);

    if (hasMarker) {
      return source;
    }
  }

  return null;
}

/**
 * Checks whether a Git metadata path exists as a file or directory.
 *
 * @param context Git command runner and source client resolver.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param path Git metadata path.
 * @returns Whether the resolved path exists as a file or directory.
 */
async function hasGitPath(
  context: GitRepositoryActionContext,
  projectPath: string,
  sourceId: string | null,
  path: string
): Promise<boolean> {
  const client = await context.clients.ensureClient(sourceId);
  const resolvedPath = await resolveGitPath(context, projectPath, sourceId, path);

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

/**
 * Resolves a Git metadata path in the source-owned filesystem.
 *
 * @param context Git command runner and source client resolver.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param path Git metadata path.
 * @returns Absolute resolved path, or `null` when Git cannot resolve it.
 */
async function resolveGitPath(
  context: GitRepositoryActionContext,
  projectPath: string,
  sourceId: string | null,
  path: string
): Promise<string | null> {
  const response = await context.runGit(projectPath, sourceId, [
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
