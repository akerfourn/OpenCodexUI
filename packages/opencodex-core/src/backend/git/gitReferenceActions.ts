/**
 * Shared context and public exports for Git reference actions.
 */
import type { OpenCodexGitStatus } from "@open-codex-ui/opencodex-protocol";

import type { RunGit } from "./gitCommandRunner.js";

/** Reads the current Git status for a project in a source. */
export type ReadGitStatus = (
  projectPath: string,
  sourceId: string | null
) => Promise<OpenCodexGitStatus>;

/** Dependencies shared by Git reference actions. */
export type GitReferenceActionContext = {
  runGit: RunGit;
  readStatus: ReadGitStatus;
};

export { remotes, upsertRemote } from "./gitRemoteActions.js";
export {
  createTag,
  fetchTags,
  pushTag,
  pushTags,
  tags
} from "./gitTagActions.js";
export {
  branches,
  checkoutBranch,
  createBranch,
  mergeBranch,
  mergeBranchTo,
  publishCurrentBranch,
  pull,
  push
} from "./gitBranchActions.js";
