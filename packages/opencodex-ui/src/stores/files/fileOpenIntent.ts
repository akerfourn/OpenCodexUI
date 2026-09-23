import type {
  OpenCodexGitDiffComparison,
  OpenCodexGitFile,
  OpenCodexGitFileState
} from "@open-codex-ui/opencodex-protocol";

export type FileViewMode = "file" | "diff";
export type FileDiffLayout = "side-by-side" | "inline";

export interface FileGitDiffContext {
  comparison: OpenCodexGitDiffComparison;
  fileState: OpenCodexGitFileState;
}

export type FileOpenIntent =
  | { origin: "explorer"; gitDiff?: FileGitDiffContext }
  | { origin: "link" }
  | {
      origin: "git";
      gitDiff: FileGitDiffContext;
    };

/** Carries Git comparison context into the explorer without changing its file-mode default. */
export function createExplorerFileOpenIntent(file?: OpenCodexGitFile): FileOpenIntent {
  if (file === undefined) return { origin: "explorer" };

  const comparison = file.unstagedStatus === null ? "staged" : "workingTree";
  const fileState = comparison === "staged" ? file.stagedStatus : file.unstagedStatus;

  return {
    origin: "explorer",
    gitDiff: { comparison, fileState: fileState ?? file.status }
  };
}

/** Centralizes entry-point defaults so a future user preference has one hook. */
export function resolveInitialFileView(intent: FileOpenIntent): FileViewMode {
  return intent.origin === "git" ? "diff" : "file";
}
