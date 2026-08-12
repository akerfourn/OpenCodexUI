/**
 * Normalized Git file status.
 */
export type OpenCodexGitFileState =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted"
  | "unknown";

/**
 * Git status entry for one changed file.
 */
export type OpenCodexGitFile = {
  path: string;
  originalPath: string | null;
  status: OpenCodexGitFileState;
  stagedStatus: OpenCodexGitFileState | null;
  unstagedStatus: OpenCodexGitFileState | null;
};

/**
 * Git remote endpoints grouped by remote name.
 */
export type OpenCodexGitRemote = {
  name: string;
  fetchUrl: string | null;
  pushUrl: string | null;
};

/**
 * Current Git repository status for a project.
 */
export type OpenCodexGitStatus = {
  isRepository: boolean;
  aheadCount: number;
  behindCount: number;
  branchName: string | null;
  upstreamName: string | null;
  pendingCommitMessage: string | null;
  remotes: OpenCodexGitRemote[];
  changedFiles: OpenCodexGitFile[];
  stagedFiles: OpenCodexGitFile[];
};

/**
 * Git branch source kind.
 */
export type OpenCodexGitBranchKind = "local" | "remote";

/**
 * Git branch displayed by branch switcher and merge UI.
 */
export type OpenCodexGitBranch = {
  name: string;
  fullName: string;
  kind: OpenCodexGitBranchKind;
  upstreamName: string | null;
  isCurrent: boolean;
};

/**
 * Synchronization state for a local Git tag and its configured remote.
 */
export type OpenCodexGitTagSyncStatus = "synced" | "local-only" | "diverged" | "unknown";

/**
 * Lightweight Git tag metadata and remote synchronization state.
 */
export type OpenCodexGitTag = {
  name: string;
  fullName: string;
  targetHash: string | null;
  createdAt: string | null;
  remoteTargetHash: string | null;
  syncStatus: OpenCodexGitTagSyncStatus;
};

/**
 * Git tag listing with the remote used for synchronization checks.
 */
export type OpenCodexGitTagListResult = {
  tags: OpenCodexGitTag[];
  remoteName: string | null;
  remoteError: string | null;
};

/**
 * Tag listing result with optional fetch warning.
 */
export type OpenCodexGitTagFetchResult = OpenCodexGitTagListResult & {
  warning: string | null;
};

/**
 * Compact Git commit metadata shown in the log modal.
 */
export type OpenCodexGitLogCommit = {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string | null;
  subject: string;
  refs: string[];
};

/**
 * Paginated Git log result.
 */
export type OpenCodexGitLogPage = {
  commits: OpenCodexGitLogCommit[];
  hasMore: boolean;
};

/**
 * File-level change included in one Git commit.
 */
export type OpenCodexGitCommitFileChange = {
  status: OpenCodexGitFileState;
  path: string;
  originalPath: string | null;
};

/**
 * Full Git commit details loaded on demand.
 */
export type OpenCodexGitCommitDetails = {
  hash: string;
  message: string;
  files: OpenCodexGitCommitFileChange[];
};

/**
 * Successful Git commit response.
 */
export type OpenCodexGitCommitResult = {
  ok: true;
  output: string;
};

/**
 * Editable commit-generation prompt state.
 */
export type OpenCodexCommitPrompt = {
  prompt: string;
  defaultPrompt: string;
  isDefault: boolean;
};

/**
 * Generated commit message returned by the backend.
 */
export type OpenCodexCommitMessageGenerationResult = {
  message: string;
};
