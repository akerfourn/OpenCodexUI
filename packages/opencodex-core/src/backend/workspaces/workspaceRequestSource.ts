import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { readObject } from "../../mapping.js";
import { isInsideWorkspace } from "./WorkspaceRemovalRuntime.js";

/** Resolves request activity without trusting host paths or a global active selection. */
export async function workspaceRequestSource(repository: OpenCodexCacheRepository | null,
  request: OpenCodexRequest, debugSourceId: string | null,
  defaultSourceId: string | null): Promise<string | null> {
  const record = readObject(request);
  if (request.type === "debug") return debugSourceId;
  for (const value of [record, readObject(record.target), readObject(record.input), readObject(record.action)]) {
    if (typeof value.sourceId === "string") return value.sourceId;
    if (typeof value.workspaceId === "string" && repository !== null) {
      const workspace = await repository.workspaces.get(value.workspaceId);
      if (workspace?.sourceId != null) return workspace.sourceId;
    }
    if (typeof value.threadId === "string" && repository !== null) {
      const workspace = await repository.workspaces.getForThread(value.threadId);
      if (workspace?.sourceId != null) return workspace.sourceId;
    }
  }
  // Legacy path-based APIs already use the configured default when no owner can be resolved.
  if ("sourceId" in record || "projectPath" in record) return defaultSourceId;
  return null;
}

/** Protects legacy tool calls that provide a physical path without a workspace identifier. */
export async function requireLegacyWorkspaceAvailable(repository: OpenCodexCacheRepository | null,
  request: OpenCodexRequest, sourceId: string | null): Promise<void> {
  if (repository === null || sourceId === null || !("projectPath" in request)
    || typeof request.projectPath !== "string"
    || ("workspaceId" in request && typeof request.workspaceId === "string")) return;
  const projects = (await repository.listProjects()).filter(project => project.sourceId === sourceId);
  const projectPath = request.projectPath;
  for (const project of projects) {
    const workspaces = await repository.workspaces.list(project.id);
    const moves = await repository.workspaces.moves.list(project.id);
    if (moves.some(move => isInsideWorkspace(projectPath, move.workspacePath)
      || isInsideWorkspace(projectPath, move.destinationPath)
      || move.primarySnapshot?.members.some(member => isInsideWorkspace(projectPath, member.path)
        || isInsideWorkspace(projectPath, member.destinationPath))
      || move.primarySnapshot?.git?.checkouts.some(entry => isInsideWorkspace(projectPath, entry.path)
        || isInsideWorkspace(projectPath, entry.destinationPath)))) throw new Error("Workspace has a pending move.");
    const workspace = workspaces.find(item => sameSourcePath(item.path, projectPath) && item.removedAt === null)
      ?? workspaces.find(item => sameSourcePath(item.path, projectPath));
    if (workspace !== undefined && (workspace.removalPending === true || workspace.removedAt !== null)) {
      throw new Error("Workspace has been removed or has a pending removal.");
    }
  }
}

/** Recognizes equivalent Windows casing/separators without mixing filesystem path syntaxes. */
function sameSourcePath(left: string, right: string): boolean {
  if (left.startsWith("/") !== right.startsWith("/")) return false;
  return isInsideWorkspace(left, right) && isInsideWorkspace(right, left);
}
