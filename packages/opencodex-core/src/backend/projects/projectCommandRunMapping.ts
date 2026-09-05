import type { OpenCodexProjectCommandRun } from "@open-codex-ui/opencodex-protocol";

/**
 * Converts an active run to its protocol DTO.
 *
 * @param run Active run metadata.
 * @returns Protocol command-run DTO.
 */
export function toProtocolRun(run: OpenCodexProjectCommandRun): OpenCodexProjectCommandRun {
  return {
    id: run.id,
    projectId: run.projectId,
    commandId: run.commandId,
    processHandle: run.processHandle,
    command: run.command,
    status: run.status,
    startedAt: run.startedAt,
    exitedAt: run.exitedAt,
    exitCode: run.exitCode,
    logPath: run.logPath,
    sourceId: run.sourceId,
    cwd: run.cwd,
    workspaceId: run.workspaceId
  };
}

