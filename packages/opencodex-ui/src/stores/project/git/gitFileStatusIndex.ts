import type {
  OpenCodexGitFile,
  OpenCodexGitStatus
} from "@open-codex-ui/opencodex-protocol";

/** Combines staged and unstaged snapshots into one lookup for the file tree. */
export function createGitFileStatusIndex(
  status: OpenCodexGitStatus
): Map<string, OpenCodexGitFile> {
  const filesByPath = new Map<string, OpenCodexGitFile>();

  for (const file of [...status.stagedFiles, ...status.changedFiles]) {
    const previous = filesByPath.get(file.path);
    const stagedStatus = file.stagedStatus ?? previous?.stagedStatus ?? null;
    const unstagedStatus = file.unstagedStatus ?? previous?.unstagedStatus ?? null;

    filesByPath.set(file.path, {
      path: file.path,
      originalPath: file.originalPath ?? previous?.originalPath ?? null,
      status: unstagedStatus ?? stagedStatus ?? previous?.status ?? file.status,
      stagedStatus,
      unstagedStatus
    });
  }

  return filesByPath;
}

/** Compares the fields observed by file-tree rows before updating the index. */
export function areGitFileStatusesEqual(
  left: OpenCodexGitFile,
  right: OpenCodexGitFile
): boolean {
  return left.path === right.path &&
    left.originalPath === right.originalPath &&
    left.status === right.status &&
    left.stagedStatus === right.stagedStatus &&
    left.unstagedStatus === right.unstagedStatus;
}
