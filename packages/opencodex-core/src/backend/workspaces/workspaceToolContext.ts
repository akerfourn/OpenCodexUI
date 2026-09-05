import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexRequest, OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";

/** Resolves an explicitly chosen workspace without interpreting its path on the host. */
export async function requireToolWorkspace(
  repository: OpenCodexCacheRepository | null,
  workspaceId: string,
  projectId?: string
): Promise<OpenCodexProjectWorkspace & { sourceId: string }> {
  if (repository === null) {
    throw new Error("Workspace tools require persistent project storage.");
  }
  const workspace = await repository.workspaces.get(workspaceId);
  if (workspace === null || workspace.sourceId === null || workspace.removedAt !== null) {
    throw new Error("Workspace is unavailable or has no execution source.");
  }
  if (projectId !== undefined && workspace.projectId !== projectId) {
    throw new Error("Workspace does not belong to the requested project.");
  }
  return { ...workspace, sourceId: workspace.sourceId };
}

/** Resolves optional workspace identities before dispatching physical tool requests. */
export async function resolveWorkspaceToolRequest(
  repository: OpenCodexCacheRepository | null,
  request: OpenCodexRequest
): Promise<OpenCodexRequest> {
  if (!("workspaceId" in request) || request.workspaceId === undefined
    || request.type === "turn.start" || request.type === "threads.workspace.select"
    || request.type === "projectWorkspaces.execution.reconcile") {
    return request;
  }
  const projectId = "projectId" in request ? request.projectId : undefined;
  const workspace = await requireToolWorkspace(repository, request.workspaceId, projectId);
  if ("sourceId" in request && request.sourceId != null && request.sourceId !== workspace.sourceId) {
    throw new Error("Requested source does not own this workspace.");
  }
  if ("projectPath" in request && request.projectPath != null
    && normalizeProjectPath(request.projectPath) !== normalizeProjectPath(workspace.path)) {
    throw new Error("Requested path does not match the workspace; refresh the project.");
  }
  if (request.type === "projectCommands.run") {
    const command = await repository!.getProjectCommand(request.commandId);
    if (command.projectId !== workspace.projectId) {
      throw new Error("Command does not belong to the workspace project.");
    }
  }
  if ("projectPath" in request || request.type === "system.openLink") {
    return { ...request, projectPath: workspace.path, sourceId: workspace.sourceId };
  }
  return request;
}

/** Keeps legacy facade argument lists unchanged when no workspace is selected. */
export function optionalWorkspaceArgument(workspaceId: string | undefined): [] | [string] {
  return workspaceId === undefined ? [] : [workspaceId];
}
