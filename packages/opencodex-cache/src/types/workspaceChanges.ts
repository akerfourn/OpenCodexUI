import type { OpenCodexFileContext, OpenCodexWorkspaceChanges } from "@open-codex-ui/opencodex-protocol";

/** Backend-only fingerprint; file names and contents are never stored in the observation table. */
export interface WorkspaceChangesInput extends OpenCodexFileContext {
  fingerprint: string;
  checkedAt: string;
  hasChanges: boolean;
}

/** Persists complete observations without altering manual progress or Codex history. */
export interface WorkspaceChangesRepository {
  get(workspaceId: string): Promise<OpenCodexWorkspaceChanges | null>;
  observe(input: WorkspaceChangesInput): Promise<OpenCodexWorkspaceChanges>;
}
