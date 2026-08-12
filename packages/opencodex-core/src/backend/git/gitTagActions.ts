/**
 * Runs Git tag actions and synchronizes tags with the configured remote.
 */
import type {
  OpenCodexGitTagFetchResult,
  OpenCodexGitTagListResult
} from "@open-codex-ui/opencodex-protocol";

import {
  createGitErrorMessage
} from "./gitCommandRunner.js";
import type { GitReferenceActionContext } from "./gitReferenceActions.js";
import {
  mergeTagSynchronization,
  normalizeTagName,
  parseGitTags,
  parseRemoteTags,
  type RemoteTagSnapshot
} from "./gitReferenceParsers.js";
import { resolveDefaultRemoteName } from "./gitRemoteActions.js";

/**
 * Lists local Git tags and synchronizes them with the configured remote.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Git tags, remote name, and any remote-read error.
 * @throws When the local tag-listing command fails.
 */
export async function tags(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<OpenCodexGitTagListResult> {
  const response = await context.runGit(projectPath, sourceId, [
    "for-each-ref",
    "--sort=-creatordate",
    "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
    "refs/tags"
  ]);
  const localTags = parseGitTags(response.stdout);
  const remoteSnapshot = await readRemoteTags(context, projectPath, sourceId);

  return {
    tags: mergeTagSynchronization(localTags, remoteSnapshot),
    remoteName: remoteSnapshot.remoteName,
    remoteError: remoteSnapshot.error
  };
}

/**
 * Fetches remote tags and returns the refreshed local tag list.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Refreshed tags and an optional fetch warning.
 * @throws Only when refreshing the local tag list fails; fetch failures are
 * returned as a warning according to the historical fallback behavior.
 */
export async function fetchTags(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<OpenCodexGitTagFetchResult> {
  const warning = await fetchTagsBestEffort(context, projectPath, sourceId);
  const result = await tags(context, projectPath, sourceId);

  return {
    ...result,
    warning
  };
}

/**
 * Creates a lightweight Git tag and returns the refreshed tag list.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param tagName Tag name.
 * @returns Refreshed Git tags.
 * @throws When the tag name is invalid or a Git command fails.
 */
export async function createTag(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null,
  tagName: string
): Promise<OpenCodexGitTagListResult> {
  const normalizedTagName = normalizeTagName(tagName);
  await validateTagName(context, projectPath, sourceId, normalizedTagName);
  await context.runGit(projectPath, sourceId, ["tag", normalizedTagName]);
  return await tags(context, projectPath, sourceId);
}

/**
 * Pushes one local Git tag to the configured remote.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param tagName Tag name.
 * @param force Whether an existing remote tag may be replaced.
 * @returns Refreshed Git tags.
 * @throws When the tag is invalid, no remote is configured, or Git fails.
 */
export async function pushTag(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null,
  tagName: string,
  force: boolean
): Promise<OpenCodexGitTagListResult> {
  const normalizedTagName = normalizeTagName(tagName);
  await validateTagName(context, projectPath, sourceId, normalizedTagName);
  const remoteName = await resolveDefaultRemoteName(context, projectPath, sourceId);
  const refspec = `refs/tags/${normalizedTagName}`;
  const args = force
    ? ["push", "--force", remoteName, refspec]
    : ["push", remoteName, refspec];

  await context.runGit(projectPath, sourceId, args, { timeoutMs: 120_000 });

  return await tags(context, projectPath, sourceId);
}

/**
 * Pushes all local Git tags to the configured remote.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Refreshed Git tags.
 * @throws When no remote is configured or Git fails.
 */
export async function pushTags(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<OpenCodexGitTagListResult> {
  const remoteName = await resolveDefaultRemoteName(context, projectPath, sourceId);
  await context.runGit(projectPath, sourceId, ["push", remoteName, "--tags"], {
    timeoutMs: 120_000
  });

  return await tags(context, projectPath, sourceId);
}

/**
 * Validates a tag name through Git, including the historical dash guard.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @param tagName Normalized tag name.
 * @returns Nothing when the tag name is valid.
 * @throws With the historical dash error or Git's formatted validation error.
 */
async function validateTagName(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null,
  tagName: string
): Promise<void> {
  if (tagName.startsWith("-")) {
    throw new Error("Tag name cannot start with a dash.");
  }

  const response = await context.runGit(projectPath, sourceId, [
    "check-ref-format",
    `refs/tags/${tagName}`
  ], { allowFailure: true });

  if (response.exitCode !== 0) {
    throw new Error(createGitErrorMessage(response));
  }
}

/**
 * Reads tags from the configured remote without changing local refs.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Remote tag snapshot and an optional read error.
 */
async function readRemoteTags(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<RemoteTagSnapshot> {
  let remoteName: string;

  try {
    remoteName = await resolveDefaultRemoteName(context, projectPath, sourceId);
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

  const response = await context.runGit(
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
 * Fetches tags with the prune fallback used by the tag-listing workflow.
 *
 * @param context Git command and status dependencies.
 * @param projectPath Project working directory.
 * @param sourceId Source identifier.
 * @returns Warning text when a fallback was needed, or `null`.
 */
async function fetchTagsBestEffort(
  context: GitReferenceActionContext,
  projectPath: string,
  sourceId: string | null
): Promise<string | null> {
  try {
    await context.runGit(projectPath, sourceId, ["fetch", "--tags", "--prune-tags"], {
      timeoutMs: 120_000
    });
    return null;
  } catch (pruneError) {
    try {
      await context.runGit(projectPath, sourceId, ["fetch", "--tags"], {
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
 * Reads a human-readable message from an unknown thrown value.
 *
 * @param error Unknown thrown value.
 * @returns Human-readable error message.
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
