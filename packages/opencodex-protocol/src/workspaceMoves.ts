/** Source-owned destination; principals require an explicit choice and their reviewed original path. */
export interface OpenCodexWorkspaceMoveInput {
  projectId: string;
  workspaceId: string;
  sourceId: string;
  /** Secondary moves may omit both choices to use the source's default storage root. */
  rootId?: string;
  /** Normal principal destination or advanced secondary destination; never combined with rootId. */
  destinationPath?: string;
  /** Reviewed principal path; required for moving a project's reference directory. */
  expectedPath?: string;
}

/** Frozen move intent retained until source facts establish its outcome. */
export interface OpenCodexWorkspaceMove {
  /** Present only for principal-directory moves; secondary journals remain compatible. */
  primarySnapshot?: import("./primaryWorkspaceMove.js").OpenCodexPrimaryMoveSnapshot;
  /** Opaque journal identity used for explicit recovery. */
  id: string;
  /** Principal or registered secondary whose stable identity and ownership are retained. */
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
  /** Secondary commit/reference; principals keep per-checkout evidence in primarySnapshot. */
  expectedHead: string;
  expectedBranch: string | null;
  /** Preparation is cancellable; dispatched effects require explicit reconciliation. */
  state: "preparing" | "submitting" | "uncertain";
  /** Physical move command result, null if its response was lost. Primary helper failure uses 1. */
  gitExitCode: number | null;
}
