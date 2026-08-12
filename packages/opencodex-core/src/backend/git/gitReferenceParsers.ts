/**
 * Parses and normalizes Git remotes, branches, and tags.
 */
import type {
  OpenCodexGitBranch,
  OpenCodexGitBranchKind,
  OpenCodexGitRemote,
  OpenCodexGitTag
} from "@open-codex-ui/opencodex-protocol";

export type RemoteTagSnapshot = {
  remoteName: string | null;
  tags: Map<string, string>;
  error: string | null;
};

/**
 * Parses `git remote -v` output.
 *
 * @param output Raw command output.
 * @returns Git remotes grouped by name.
 */
export function parseGitRemotes(output: string): OpenCodexGitRemote[] {
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
export function normalizeRemoteInput(value: string, errorMessage: string): string {
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
export function parseGitBranches(output: string, currentBranchName: string): OpenCodexGitBranch[] {
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
export function parseGitTags(output: string): OpenCodexGitTag[] {
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
export function parseRemoteTags(output: string): Map<string, string> {
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
export function mergeTagSynchronization(
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
export function normalizeBranchName(branchName: string): string {
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
export function normalizeTagName(tagName: string): string {
  const normalizedTagName = tagName.trim();

  if (normalizedTagName.length === 0) {
    throw new Error("Tag name is required.");
  }

  return normalizedTagName;
}
