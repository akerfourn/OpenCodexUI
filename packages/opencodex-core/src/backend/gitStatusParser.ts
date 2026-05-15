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
  let branchName: string | null = null;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";

    if (record.startsWith("# branch.head ")) {
      branchName = parseBranchName(record);
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
    branchName,
    changedFiles: files.filter((file) => file.unstagedStatus !== null),
    stagedFiles: files.filter((file) => file.stagedStatus !== null)
  };
}

function parseBranchName(record: string): string | null {
  const value = record.slice("# branch.head ".length).trim();
  return value.length === 0 || value === "(detached)" ? null : value;
}

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

function parseConflictedRecord(record: string): OpenCodexGitFile {
  const parts = record.split(" ");
  const path = parts.slice(10).join(" ");

  return createGitFile(path, null, "conflicted", "conflicted", "conflicted");
}

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
