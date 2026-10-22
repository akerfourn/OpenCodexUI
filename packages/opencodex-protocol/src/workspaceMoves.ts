/** Explicit source-owned destination choice; configured storage is the default. */
export interface OpenCodexWorkspaceMoveInput {
  projectId: string;
  workspaceId: string;
  sourceId: string;
  /** Omission chooses this source's default configured storage root. */
  rootId?: string;
  /** Advanced alternative to a configured root, never combined with rootId. */
  destinationPath?: string;
}

/** Frozen move intent retained until source facts establish its outcome. */
export interface OpenCodexWorkspaceMove {
  /** Opaque journal identity used for explicit recovery. */
  id: string;
  /** Managed secondary checkout whose identity is retained. */
  workspaceId: string;
  /** Logical project and filesystem owner. */
  projectId: string;
  sourceId: string;
  /** Primary checkout protected while Git updates its worktree registry. */
  primaryWorkspaceId: string;
  projectPath: string;
  /** Original and requested source-native checkout paths. */
  workspacePath: string;
  destinationPath: string;
  /** Selected storage root frozen before dispatch; null for custom paths. */
  rootPath: string | null;
  /** Frozen common repository and stable worktree administrative directory. */
  repositoryPath: string;
  gitDirectory: string;
  /** Expected checked-out commit and full branch reference, or null when detached. */
  expectedHead: string;
  expectedBranch: string | null;
  /** Preparation is cancellable; dispatched effects require explicit reconciliation. */
  state: "preparing" | "submitting" | "uncertain";
  /** Observed Git exit, null if its response was lost. */
  gitExitCode: number | null;
}
