import type { TFunction } from "i18next";
import type { OpenCodexGitFileState } from "@open-codex-ui/opencodex-protocol";
import { directoryGitStates, type GitDirectoryStatus } from "../../stores/project/git/gitDirectoryStatusIndex";

/** Uses the same Git hues as the Git panel, with stronger contrast on light backgrounds. */
export function fileTreeGitColor(status: OpenCodexGitFileState | undefined, mode: "light" | "dark"): string | undefined {
  if (status === undefined) return undefined;
  if (status === "added" || status === "untracked") return mode === "dark" ? "#3fb950" : "#1a7f37";
  if (status === "deleted" || status === "conflicted") return mode === "dark" ? "#ff7b72" : "#cf222e";
  if (status === "renamed" || status === "copied") return mode === "dark" ? "#79c0ff" : "#0969da";
  return mode === "dark" ? "#e3b341" : "#9a6700";
}

/** Explains exact known files and explicitly separates untracked folders whose contents Git grouped. */
export function describeGitDirectory(summary: GitDirectoryStatus, t: TFunction): string {
  const descriptions: string[] = [];
  for (const status of directoryGitStates) {
    const count = summary.counts[status];
    if (count > 0) descriptions.push(t(`files.directoryGit.${status}`, { count }));
  }
  if (summary.untrackedDirectories > 0) {
    descriptions.push(t("files.directoryGit.untrackedDirectories", { count: summary.untrackedDirectories }));
  }
  return descriptions.join(", ");
}

/** Keeps individual file markers consistent with the Git panel convention. */
export function fileTreeGitMarker(status: OpenCodexGitFileState): string {
  if (status === "added" || status === "untracked") return "A";
  if (status === "modified") return "M";
  if (status === "deleted") return "D";
  if (status === "renamed") return "R";
  if (status === "copied") return "C";
  if (status === "conflicted") return "!";
  return "?";
}
