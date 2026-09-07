/** Explicit checkout choice; no inferred branch or remote tracking. */
export type OpenCodexWorkspaceStart =
  | { mode: "newBranch"; branchName: string; startPoint: string }
  | { mode: "existingBranch"; branchName: string }
  | { mode: "detached"; startPoint: string };

/** UI intent; the backend resolves the repository and owning source. */
export interface OpenCodexWorkspaceCreateInput {
  /** Logical owner of the requested checkout. */
  projectId: string;
  /** Explicit execution source; never inferred from UI selection. */
  sourceId: string;
  /** Absolute source-native path chosen for the new checkout. */
  destinationPath?: string;
  /** Configured source-owned root; omission selects its default when no custom path is given. */
  rootId?: string;
  /** User-facing workspace name, retained during recovery; optional for older clients. */
  name?: string | null;
  /** Explicit branch or detached revision intent. */
  start: OpenCodexWorkspaceStart;
}

/** Durable creation intent retained until verified publication or safe cancellation. */
export interface OpenCodexWorkspaceCreation {
  /** Stable creation operation identifier used for explicit recovery. */
  id: string;
  /** Reserved workspace identity, retained on recovery. */
  workspaceId: string;
  /** Logical owner of the requested checkout. */
  projectId: string;
  /** Explicit execution source; never inferred from UI selection. */
  sourceId: string;
  /** Primary whose source and location are protected during creation. */
  primaryWorkspaceId: string;
  /** Captured source-local checkout used to run Git. */
  projectPath: string;
  /** Absolute common Git directory used for repository exclusion. */
  repositoryPath: string;
  /** Absolute source-native path chosen for the new checkout. */
  destinationPath: string;
  /** Frozen automatic storage root, independent of later settings edits. */
  rootPath?: string | null;
  /** User-facing workspace name, retained during recovery; optional for older clients. */
  name?: string | null;
  /** Explicit branch or detached revision intent. */
  start: OpenCodexWorkspaceStart;
  /** Dispatch boundary distinguishes cancellable preparation from unknown effects. */
  state: "preparing" | "submitting" | "uncertain";
  /** Commit resolved before Git dispatch, absent during preparation. */
  expectedHead: string | null;
  /** Full expected branch reference, null for detached checkout. */
  expectedBranch: string | null;
  /** Positive command-completion evidence persisted before publication. */
  gitConfirmed: boolean;
}
