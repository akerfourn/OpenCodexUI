/** Frozen removal intent; history remains attached to the original workspace. */
export interface OpenCodexWorkspaceRemoval {
  /** Durable operation identifier used for explicit recovery. */
  id: string;
  /** Secondary managed checkout being removed. */
  workspaceId: string;
  /** Logical project whose history must be preserved. */
  projectId: string;
  /** Filesystem source captured before Git dispatch. */
  sourceId: string;
  /** Primary identity protected while Git uses its checkout. */
  primaryWorkspaceId: string;
  /** Source-native primary checkout used for Git operations. */
  projectPath: string;
  /** Source-native directory to remove, never supplied by the renderer. */
  workspacePath: string;
  /** Common Git directory used for repository exclusion and recovery. */
  repositoryPath: string;
  /** Preparation is cancellable; dispatched effects require verification. */
  state: "preparing" | "submitting" | "uncertain";
  /** Positive command-exit evidence, or null when the outcome is unknown. */
  gitExitCode: number | null;
  /** Explicitly authorized automatic deletion; processing is never replayed after interruption. */
  deferredState?: "queued" | "blocked" | "processing";
  /** Time at which future automatic deletion was authorized. */
  requestedAt?: string;
  /** Last safety check that requires an explicit retry. */
  blockedReason?: string | null;
  /** Explicit consent to discard local tracked, untracked and ignored contents during Git removal. */
  force?: boolean;
}

/** Local filesystem changes that would be lost if this managed checkout were removed. */
export interface OpenCodexWorkspaceRemovalFile {
  path: string;
  kind: "tracked" | "untracked" | "ignored";
}

/** Read-only source inspection; execution repeats the checks before deleting anything. */
export interface OpenCodexWorkspaceRemovalInspection {
  projectId: string;
  workspaceId: string;
  sourceId: string;
  workspacePath: string;
  /** Bounded preview of the complete Git inventory. */
  files: OpenCodexWorkspaceRemovalFile[];
  totalFileCount: number;
}
