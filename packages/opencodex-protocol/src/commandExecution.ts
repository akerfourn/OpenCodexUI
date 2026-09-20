/** Concurrency limit applied separately to each configured command. */
export type OpenCodexCommandExecutionMode = "project" | "workspace" | "parallel";

/** Immutable command context used for running processes and pending launches. */
export interface OpenCodexCommandExecutionContext {
  commandId: string;
  sourceId?: string | null;
  workspaceId?: string;
  cwd?: string;
}

/** Applies the same concurrency rule to backend reservations and UI launch controls. */
export function commandExecutionConflicts(
  mode: OpenCodexCommandExecutionMode,
  target: OpenCodexCommandExecutionContext,
  active: OpenCodexCommandExecutionContext,
): boolean {
  if (target.commandId !== active.commandId || mode === "parallel") return false;
  if (mode === "project") return true;
  if (target.sourceId !== undefined && target.sourceId !== null &&
      active.sourceId !== undefined && active.sourceId !== null && target.sourceId !== active.sourceId) return false;
  if (target.workspaceId !== undefined && active.workspaceId !== undefined && target.workspaceId === active.workspaceId) {
    return true;
  }
  if (target.cwd !== undefined && active.cwd !== undefined) return target.cwd === active.cwd;
  if (target.workspaceId !== undefined && active.workspaceId !== undefined) return false;
  // Older run snapshots without physical context must not allow a duplicate launch.
  return true;
}
