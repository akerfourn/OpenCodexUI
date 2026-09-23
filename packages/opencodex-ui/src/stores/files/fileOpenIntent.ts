import type {
  OpenCodexGitDiffComparison,
  OpenCodexGitFileState
} from "@open-codex-ui/opencodex-protocol";

export type FileViewMode = "file" | "diff";
export type FileDiffLayout = "side-by-side" | "inline";

export type FileOpenIntent =
  | { origin: "explorer" | "link" }
  | {
      origin: "git";
      gitDiff: {
        comparison: OpenCodexGitDiffComparison;
        fileState: OpenCodexGitFileState;
      };
    };

/** Centralizes entry-point defaults so a future user preference has one hook. */
export function resolveInitialFileView(intent: FileOpenIntent): FileViewMode {
  return intent.origin === "git" ? "diff" : "file";
}
