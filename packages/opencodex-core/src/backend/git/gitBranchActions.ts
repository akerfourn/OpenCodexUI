/**
 * Runs Git branch and branch-adjacent synchronization actions.
 */
import type {
  OpenCodexGitBranch,
  OpenCodexGitBranchKind,
  OpenCodexGitStatus
} from "@open-codex-ui/opencodex-protocol";

import { createGitErrorMessage } from "./gitCommandRunner.js";
import type { GitReferenceActionContext } from "./gitReferenceActions.js";
import {
  normalizeBranchName,
  parseGitBranches
} from "./gitReferenceParsers.js";
import { resolveDefaultRemoteName } from "./gitRemoteActions.js";

/**
 * Lists local and remote Git branches.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Local branches followed by remote branches.
 * @throws When either Git command fails.
 */
export async function branches(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<OpenCodexGitBranch[]> {
  const currentBranchResponse = await context.runGit(projectPath, sourceId, [
    "branch",
    "--show-current"
  ]);
  const currentBranchName = currentBranchResponse.stdout.trim();
  const response = await context.runGit(projectPath, sourceId, [
    "for-each-ref",
    "--format=%(refname)%09%(refname:short)%09%(upstream:short)",
    "refs/heads",
    "refs/remotes"
  ]);

  return parseGitBranches(response.stdout, currentBranchName);
}

/**
 * Checks out an existing local or remote branch and returns refreshed status.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param branchName Branch name.
 * @param branchKind Local or remote branch kind.
 * @returns Refreshed Git status.
 * @throws When the branch name is invalid or Git fails.
 */
export async function checkoutBranch(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null,
  branchName: string,
  branchKind: OpenCodexGitBranchKind
): Promise<OpenCodexGitStatus> {
  const normalizedBranchName = normalizeBranchName(branchName);
  const args = branchKind === "remote"
    ? ["checkout", "--track", normalizedBranchName]
    : ["checkout", normalizedBranchName];

  await context.runGit(projectPath, sourceId, args);
  return await context.readStatus(projectPath, sourceId);
}

/**
 * Creates and checks out a new local Git branch.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param branchName Branch name.
 * @returns Refreshed Git status.
 * @throws When the branch name is invalid or Git fails.
 */
export async function createBranch(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null,
  branchName: string
): Promise<OpenCodexGitStatus> {
  const normalizedBranchName = normalizeBranchName(branchName);
  await validateBranchName(context, projectPath, sourceId, normalizedBranchName);
  await context.runGit(projectPath, sourceId, ["checkout", "-b", normalizedBranchName]);
  return await context.readStatus(projectPath, sourceId);
}

/**
 * Merges an existing local Git branch into the current branch.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param branchName Local branch name.
 * @returns Refreshed Git status.
 * @throws When the branch name is empty or Git fails.
 */
export async function mergeBranch(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null,
  branchName: string
): Promise<OpenCodexGitStatus> {
  const normalizedBranchName = normalizeBranchName(branchName);
  await context.runGit(projectPath, sourceId, ["merge", normalizedBranchName], {
    timeoutMs: 120_000
  });
  return await context.readStatus(projectPath, sourceId);
}

/**
 * Pushes local commits to the configured upstream and returns refreshed status.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Refreshed Git status.
 * @throws When Git fails.
 */
export async function push(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<OpenCodexGitStatus> {
  await context.runGit(projectPath, sourceId, ["push"], { timeoutMs: 120_000 });
  return await context.readStatus(projectPath, sourceId);
}

/**
 * Pushes the current local branch and configures its upstream.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Refreshed Git status.
 * @throws When the project is not a repository, `HEAD` is detached, no remote
 * is configured, or Git fails.
 */
export async function publishCurrentBranch(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<OpenCodexGitStatus> {
  const status = await context.readStatus(projectPath, sourceId);

  if (!status.isRepository) {
    throw new Error("This project is not a Git repository.");
  }

  if (status.branchName === null) {
    throw new Error("Cannot publish a detached HEAD.");
  }

  if (status.upstreamName !== null) {
    return await push(context, projectPath, sourceId);
  }

  const remoteName = await resolveDefaultRemoteName(context, projectPath, sourceId);
  await context.runGit(
    projectPath,
    sourceId,
    ["push", "--set-upstream", remoteName, status.branchName],
    { timeoutMs: 120_000 }
  );

  return await context.readStatus(projectPath, sourceId);
}

/**
 * Pulls remote commits from the configured upstream and returns refreshed status.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Refreshed Git status.
 * @throws When Git fails.
 */
export async function pull(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<OpenCodexGitStatus> {
  await context.runGit(projectPath, sourceId, ["pull", "--ff-only"], {
    timeoutMs: 120_000
  });
  return await context.readStatus(projectPath, sourceId);
}

/**
 * Validates a branch name through Git without allowing a failed check to throw
 * from the command runner before its historical error mapping is applied.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param branchName Normalized branch name.
 * @returns Nothing when the branch name is valid.
 * @throws With Git's formatted validation error when the name is invalid.
 */
async function validateBranchName(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null,
  branchName: string
): Promise<void> {
  const response = await context.runGit(projectPath, sourceId, [
    "check-ref-format",
    "--branch",
    branchName
  ], { allowFailure: true });

  if (response.exitCode !== 0) {
    throw new Error(createGitErrorMessage(response));
  }
}
