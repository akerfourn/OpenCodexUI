/**
 * Runs Git remote actions and resolves configured remotes.
 */
import type {
  OpenCodexGitRemote,
  OpenCodexGitStatus
} from "@open-codex-ui/opencodex-protocol";

import type { GitReferenceActionContext } from "./gitReferenceActions.js";
import {
  normalizeRemoteInput,
  parseGitRemotes
} from "./gitReferenceParsers.js";

/**
 * Lists configured Git remotes.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Configured Git remotes.
 * @throws When the Git command fails.
 */
export async function remotes(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<OpenCodexGitRemote[]> {
  const response = await context.runGit(projectPath, sourceId, ["remote", "-v"]);
  return parseGitRemotes(response.stdout);
}

/**
 * Adds or updates one Git remote and returns refreshed status.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param name Remote name.
 * @param url Remote URL.
 * @returns Refreshed Git status.
 * @throws When an input is empty or a Git command fails.
 */
export async function upsertRemote(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null,
  name: string,
  url: string
): Promise<OpenCodexGitStatus> {
  const remoteName = normalizeRemoteInput(name, "Remote name is required.");
  const remoteUrl = normalizeRemoteInput(url, "Remote URL is required.");
  const remoteList = await remotes(context, projectPath, sourceId);
  const existingRemote = remoteList.find((remote) => remote.name === remoteName) ?? null;

  if (existingRemote === null) {
    await context.runGit(projectPath, sourceId, ["remote", "add", remoteName, remoteUrl]);
  } else {
    await context.runGit(projectPath, sourceId, ["remote", "set-url", remoteName, remoteUrl]);
  }

  return await context.readStatus(projectPath, sourceId);
}

/**
 * Resolves the default remote, preferring `origin` when configured.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Selected remote name.
 * @throws When no Git remote is configured.
 */
export async function resolveDefaultRemoteName(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<string> {
  const response = await context.runGit(projectPath, sourceId, ["remote"]);
  const remoteNames = response.stdout
    .split("\n")
    .map((remoteName) => remoteName.trim())
    .filter((remoteName) => remoteName.length > 0);

  if (remoteNames.length === 0) {
    throw new Error("No Git remote is configured for this repository.");
  }

  const firstRemoteName = remoteNames[0];

  if (firstRemoteName === undefined) {
    throw new Error("No Git remote is configured for this repository.");
  }

  return remoteNames.includes("origin") ? "origin" : firstRemoteName;
}
