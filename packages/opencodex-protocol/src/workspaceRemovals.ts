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
}
