/**
 * Parses machine-readable Git status output.
 */
import type {
  OpenCodexGitFile,
  OpenCodexGitFileState,
  OpenCodexGitStatus
} from "@open-codex-ui/opencodex-protocol";

/**
 * Parses `git status --porcelain=v2 -z --branch` output.
 *
 * @param output Raw Git status output.
 * @returns Parsed Git status.
 */
export function parseGitStatus(output: string): OpenCodexGitStatus {
  const records = output.split("\0").filter((record) => record.length > 0);
  const files: OpenCodexGitFile[] = [];
  let aheadCount = 0;
  let behindCount = 0;
  let branchName: string | null = null;
  let upstreamName: string | null = null;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";

    if (record.startsWith("# branch.head ")) {
      branchName = parseBranchName(record);
      continue;
    }

    if (record.startsWith("# branch.upstream ")) {
      upstreamName = parseBranchUpstream(record);
      continue;
    }

    if (record.startsWith("# branch.ab ")) {
      const aheadBehind = parseBranchAheadBehind(record);
      aheadCount = aheadBehind.aheadCount;
      behindCount = aheadBehind.behindCount;
      continue;
    }

    if (record.startsWith("? ")) {
      files.push(createGitFile(record.slice(2), null, "untracked", null, "untracked"));
      continue;
    }

    if (record.startsWith("1 ")) {
      files.push(parseOrdinaryRecord(record));
      continue;
    }

    if (record.startsWith("2 ")) {
      const originalPath = records[index + 1] ?? null;
      files.push(parseRenamedRecord(record, originalPath));
      index += originalPath === null ? 0 : 1;
      continue;
    }

    if (record.startsWith("u ")) {
      files.push(parseConflictedRecord(record));
    }
  }

  return {
    isRepository: true,
    aheadCount,
    behindCount,
    branchName,
    upstreamName,
    pendingCommitMessage: null,
    remotes: [],
    changedFiles: files.filter((file) => file.unstagedStatus !== null),
    stagedFiles: files.filter((file) => file.stagedStatus !== null)
  };
}

/**
 * Parses the current branch name from porcelain v2 metadata.
 *
 * @param record Raw `# branch.head` record.
 * @returns Branch name, or `null` for detached/empty heads.
 */
function parseBranchName(record: string): string | null {
  const value = record.slice("# branch.head ".length).trim();
  return value.length === 0 || value === "(detached)" ? null : value;
}

/**
 * Parses the upstream branch name from porcelain v2 metadata.
 *
 * @param record Raw `# branch.upstream` record.
 * @returns Upstream branch name, or `null` when missing.
 */
function parseBranchUpstream(record: string): string | null {
  const value = record.slice("# branch.upstream ".length).trim();
  return value.length === 0 ? null : value;
}

/**
 * Parses ahead/behind counters from porcelain v2 metadata.
 *
 * @param record Raw `# branch.ab` record.
 * @returns Numeric ahead/behind counters.
 */
function parseBranchAheadBehind(record: string): { aheadCount: number; behindCount: number } {
  const parts = record.slice("# branch.ab ".length).trim().split(" ");
  const aheadToken = parts.find((part) => part.startsWith("+")) ?? "+0";
  const behindToken = parts.find((part) => part.startsWith("-")) ?? "-0";

  return {
    aheadCount: Number.parseInt(aheadToken.slice(1), 10) || 0,
    behindCount: Number.parseInt(behindToken.slice(1), 10) || 0
  };
}

/**
 * Parses a normal tracked-file porcelain v2 record.
 *
 * @param record Raw `1` record.
 * @returns Git file status DTO.
 */
function parseOrdinaryRecord(record: string): OpenCodexGitFile {
  const parts = record.split(" ");
  const status = parts[1] ?? "..";
  const path = parts.slice(8).join(" ");
  const stagedStatus = mapStatusCode(status[0] ?? ".");
  const unstagedStatus = mapStatusCode(status[1] ?? ".");

  return createGitFile(
    path,
    null,
    stagedStatus ?? unstagedStatus ?? "unknown",
    stagedStatus,
    unstagedStatus
  );
}

/**
 * Parses a rename/copy porcelain v2 record and its original path.
 *
 * @param record Raw `2` record.
 * @param originalPath Original path record that follows the rename row.
 * @returns Git file status DTO.
 */
function parseRenamedRecord(record: string, originalPath: string | null): OpenCodexGitFile {
  const parts = record.split(" ");
  const status = parts[1] ?? "..";
  const path = parts.slice(9).join(" ");
  const stagedStatus = mapStatusCode(status[0] ?? ".") ?? "renamed";
  const unstagedStatus = mapStatusCode(status[1] ?? ".");

  return createGitFile(
    path,
    originalPath,
    stagedStatus,
    stagedStatus,
    unstagedStatus
  );
}

/**
 * Parses a conflicted-file porcelain v2 record.
 *
 * @param record Raw `u` record.
 * @returns Git file status DTO marked as conflicted.
 */
function parseConflictedRecord(record: string): OpenCodexGitFile {
  const parts = record.split(" ");
  const path = parts.slice(10).join(" ");

  return createGitFile(path, null, "conflicted", "conflicted", "conflicted");
}

/**
 * Creates a protocol Git file object from parsed status data.
 *
 * @param path Current file path.
 * @param originalPath Original path for renames, when available.
 * @param status Primary status displayed by the UI.
 * @param stagedStatus Status in the index.
 * @param unstagedStatus Status in the worktree.
 * @returns Git file status DTO.
 */
function createGitFile(
  path: string,
  originalPath: string | null,
  status: OpenCodexGitFileState,
  stagedStatus: OpenCodexGitFileState | null,
  unstagedStatus: OpenCodexGitFileState | null
): OpenCodexGitFile {
  return {
    path,
    originalPath,
    status,
    stagedStatus,
    unstagedStatus
  };
}

/**
 * Maps one porcelain status code to the protocol state enum.
 *
 * @param code Single-character Git status code.
 * @returns File state, or `null` when the side has no change.
 */
function mapStatusCode(code: string): OpenCodexGitFileState | null {
  if (code === "." || code === " ") {
    return null;
  }

  if (code === "A") {
    return "added";
  }

  if (code === "M" || code === "T") {
    return "modified";
  }

  if (code === "D") {
    return "deleted";
  }

  if (code === "R") {
    return "renamed";
  }

  if (code === "C") {
    return "copied";
  }

  if (code === "U") {
    return "conflicted";
  }

  return "unknown";
}
