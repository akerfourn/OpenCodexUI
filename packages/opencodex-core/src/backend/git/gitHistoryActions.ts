/**
 * Runs Git history actions and maps their output to protocol values.
 */
import type {
  OpenCodexGitCommitDetails,
  OpenCodexGitLogPage
} from "@open-codex-ui/opencodex-protocol";

import type { RunGit } from "./gitCommandRunner.js";
import {
  normalizeCommitHash,
  normalizeLogLimit,
  normalizeLogSkip,
  parseCommitFileChanges,
  parseGitLog
} from "./gitHistoryParsers.js";
import { normalizeTagName } from "./gitReferenceParsers.js";

/**
 * Counts commits reachable from `HEAD` after a Git tag.
 *
 * @param runGit Git command runner for the source filesystem.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param tagName Tag whose descendants should be counted.
 * @returns Number of commits reachable from `HEAD` after the tag.
 * @throws When the tag name is empty, the Git command fails, or its output is
 * not a finite integer.
 */
export async function commitsSinceTag(
  runGit: RunGit,
  projectPath: string,
  sourceId: string | null,
  tagName: string
): Promise<number> {
  const normalizedTagName = normalizeTagName(tagName);
  const response = await runGit(projectPath, sourceId, [
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
 * Reads one bounded, paginated page from the Git history.
 *
 * @param runGit Git command runner for the source filesystem.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param limit Requested page size.
 * @param skip Number of commits to skip from `HEAD`.
 * @returns Commit summaries and whether another page is available.
 * @throws When the Git command fails.
 */
export async function log(
  runGit: RunGit,
  projectPath: string,
  sourceId: string | null,
  limit: number,
  skip: number
): Promise<OpenCodexGitLogPage> {
  const normalizedLimit = normalizeLogLimit(limit);
  const normalizedSkip = normalizeLogSkip(skip);
  const response = await runGit(projectPath, sourceId, [
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
 * Reads the commit message and changed files for one Git commit.
 *
 * @param runGit Git command runner for the source filesystem.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param hash Commit hash or revision accepted by Git.
 * @returns Commit details with its normalized hash, message, and file changes.
 * @throws When the commit hash is empty or starts with a dash, or a Git
 * command fails.
 */
export async function commitDetails(
  runGit: RunGit,
  projectPath: string,
  sourceId: string | null,
  hash: string
): Promise<OpenCodexGitCommitDetails> {
  const normalizedHash = normalizeCommitHash(hash);
  const [messageResponse, filesResponse] = await Promise.all([
    runGit(projectPath, sourceId, ["show", "-s", "--format=%B", normalizedHash]),
    runGit(projectPath, sourceId, ["show", "--format=", "--name-status", normalizedHash])
  ]);

  return {
    hash: normalizedHash,
    message: messageResponse.stdout.trim(),
    files: parseCommitFileChanges(filesResponse.stdout)
  };
}
