import type { OpenCodexGitFile, OpenCodexGitFileState } from "@open-codex-ui/opencodex-protocol";

export const directoryGitStates: readonly OpenCodexGitFileState[] = [
  "conflicted", "modified", "added", "untracked", "deleted", "renamed", "copied", "unknown"
];

/** One immutable summary counts each changed path once, independently of expanded tree branches. */
export interface GitDirectoryStatus {
  status: OpenCodexGitFileState;
  count: number;
  untrackedDirectories: number;
  counts: Record<OpenCodexGitFileState, number>;
}

/** Propagates known Git changes to every ancestor; renamed paths also decorate their former folder. */
export function createGitDirectoryStatusIndex(files: ReadonlyMap<string, OpenCodexGitFile>): Map<string, GitDirectoryStatus> {
  const directories = new Map<string, GitDirectoryStatus>();
  for (const file of files.values()) {
    const untrackedDirectory = file.status === "untracked" && file.path.endsWith("/");
    const ancestors = parentDirectories(file.path, untrackedDirectory);
    if (file.status === "renamed" && file.originalPath !== null) {
      for (const path of parentDirectories(file.originalPath, false)) ancestors.add(path);
    }
    for (const path of ancestors) {
      let summary = directories.get(path);
      if (summary === undefined) {
        summary = { status: "added", count: 0, untrackedDirectories: 0,
          counts: { added: 0, untracked: 0, modified: 0, deleted: 0, renamed: 0, copied: 0, conflicted: 0, unknown: 0 } };
        directories.set(path, summary);
      }
      summary.count += 1;
      if (untrackedDirectory) summary.untrackedDirectories += 1;
      else summary.counts[file.status] += 1;
      if (file.status === "conflicted") summary.status = "conflicted";
      else if (summary.status !== "conflicted" && file.status !== "added" && file.status !== "untracked") {
        summary.status = "modified";
      }
    }
  }
  return directories;
}

/** Splits only protocol forward slashes, preserving case, Unicode and literal filename characters. */
function parentDirectories(path: string, includeSelf: boolean): Set<string> {
  const result = new Set<string>();
  let current = path.replace(/\/$/, "");
  if (includeSelf) result.add(current);
  while (current.includes("/")) {
    current = current.slice(0, current.lastIndexOf("/"));
    if (current.length > 0) result.add(current);
  }
  return result;
}

/** Preserves observable map identities when a Git refresh leaves a folder unchanged. */
export function areGitDirectoryStatusesEqual(left: GitDirectoryStatus, right: GitDirectoryStatus): boolean {
  return left.status === right.status && left.count === right.count
    && left.untrackedDirectories === right.untrackedDirectories
    && directoryGitStates.every(state => left.counts[state] === right.counts[state]);
}
