/**
 * Parses Git history and normalizes history-related inputs.
 */
import type {
  OpenCodexGitCommitFileChange,
  OpenCodexGitFileState,
  OpenCodexGitLogPage
} from "@open-codex-ui/opencodex-protocol";

const gitLogPageSizeMax = 100;

/**
 * Parses paginated Git log records.
 *
 * @param output Raw log output separated by record separators.
 * @returns Commit summaries.
 */
export function parseGitLog(output: string): OpenCodexGitLogPage["commits"] {
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
export function parseCommitFileChanges(output: string): OpenCodexGitCommitFileChange[] {
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
 * Trims and validates a commit hash.
 *
 * @param hash Raw commit hash.
 * @returns Normalized commit hash.
 */
export function normalizeCommitHash(hash: string): string {
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
export function normalizeLogLimit(limit: number): number {
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
export function normalizeLogSkip(skip: number): number {
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
export function normalizePaths(paths: string[]): string[] {
  const normalizedPaths = paths.map((path) => path.trim()).filter((path) => path.length > 0);

  if (normalizedPaths.length === 0) {
    throw new Error("At least one path is required.");
  }

  return normalizedPaths;
}
