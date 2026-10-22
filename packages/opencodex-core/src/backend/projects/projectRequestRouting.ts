import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexBackendRuntime } from "../../OpenCodexBackendRuntime.js";
import { optionalWorkspaceArgument } from "../workspaces/workspaceToolContext.js";

/** Protocol requests owned by the project catalogue, group tree and workspace selection. */
export type ProjectRequest = Extract<OpenCodexRequest, {
  type: `projects.${string}` | `projectGroups.${string}` | `projectWorkspaces.${string}` |
    "threads.workspace.select" | "threads.workspace.reconcile";
}>;

/** Runtime facades used by project routing after shared workspace-context resolution. */
export interface ProjectRequestRuntime {
  automation: OpenCodexBackendRuntime["automation"];
  projects: OpenCodexBackendRuntime["projects"];
  workspaces: OpenCodexBackendRuntime["workspaces"];
  workspaceLocks: OpenCodexBackendRuntime["workspaceLocks"];
  workspaceMoves: OpenCodexBackendRuntime["workspaceMoves"];
  workspaceRelocations: OpenCodexBackendRuntime["workspaceRelocations"];
  workspaceRemovals: OpenCodexBackendRuntime["workspaceRemovals"];
  groups: OpenCodexBackendRuntime["groups"];
  context: OpenCodexBackendRuntime["context"];
  settings: Pick<OpenCodexBackendRuntime["settings"], "get">;
}

/** Selects the project domain without consuming other thread or project-tool requests. */
export function isProjectRequest(request: OpenCodexRequest): request is ProjectRequest {
  return request.type.startsWith("projects.") ||
    request.type.startsWith("projectGroups.") ||
    request.type.startsWith("projectWorkspaces.") ||
    request.type === "threads.workspace.select" ||
    request.type === "threads.workspace.reconcile";
}

/** Dispatches a resolved project request; responses and errors retain the facade's behavior. */
export async function routeProjectRequest(runtime: ProjectRequestRuntime, request: ProjectRequest): Promise<unknown> {
  switch (request.type) {
    case "projectWorkspaces.prepare":
      return runtime.automation.commands.prepareWorkspace(request.input);
    case "projectWorkspaces.lock.read":
      if (runtime.workspaceLocks === null) throw new Error("Workspace locks require persistent project storage.");
      return runtime.workspaceLocks.read(request.projectId, request.workspaceId, request.sourceId);
    case "projectWorkspaces.lock.update":
      if (runtime.workspaceLocks === null) throw new Error("Workspace locks require persistent project storage.");
      return runtime.workspaceLocks.update(request.input);
    case "projectWorkspaces.move":
      if (runtime.workspaceMoves === null) throw new Error("Workspace movement requires persistent storage.");
      return runtime.workspaceMoves.move(request.input);
    case "projectWorkspaces.moves.list":
      if (runtime.workspaceMoves === null) return [];
      return runtime.workspaceMoves.pending(request.projectId);
    case "projectWorkspaces.moves.reconcile":
      if (runtime.workspaceMoves === null) throw new Error("Workspace movement requires persistent storage.");
      return runtime.workspaceMoves.reconcile(request.moveId);
    case "projectWorkspaces.relocate":
      if (runtime.workspaceRelocations === null) throw new Error("Workspace relocation requires persistent storage.");
      return runtime.workspaceRelocations.relocate(request.projectId, request.workspaceId, request.sourceId,
        request.destinationPath, request.confirmIdentity);
    case "projectWorkspaces.remove":
      if (runtime.workspaceRemovals === null) throw new Error("Workspace removal requires persistent storage.");
      return runtime.workspaceRemovals.remove(request.projectId, request.workspaceId, request.sourceId);
    case "projectWorkspaces.removals.list":
      if (runtime.workspaceRemovals === null) return [];
      return runtime.workspaceRemovals.pending(request.projectId);
    case "projectWorkspaces.removals.reconcile":
      if (runtime.workspaceRemovals === null) throw new Error("Workspace removal requires persistent storage.");
      return runtime.workspaceRemovals.reconcile(request.removalId);
    case "projects.list":
      return runtime.projects.list();
    case "projectWorkspaces.discover":
      return runtime.workspaces.discover(request.projectId, request.sourceId);
    case "projectWorkspaces.create":
      return runtime.workspaces.create(request.input);
    case "projectWorkspaces.creations.list":
      return runtime.workspaces.pendingCreations(request.projectId);
    case "projectWorkspaces.creations.reconcile":
      return runtime.workspaces.reconcileCreation(request.creationId);
    case "projectWorkspaces.rename":
      return runtime.workspaces.rename(request.projectId, request.workspaceId, request.name);
    case "projectWorkspaces.workStatus.update":
      return runtime.workspaces.setWorkStatus(request.input);
    case "projectWorkspaces.list":
      return runtime.workspaces.list(request.projectId);
    case "projectWorkspaces.activity":
      return runtime.workspaces.activity(request.projectId);
    case "projectWorkspaces.execution.reconcile":
      return runtime.workspaces.reconcileWorkspace(request.workspaceId);
    case "threads.workspace.select":
      return runtime.workspaces.select(request.threadId, request.workspaceId);
    case "threads.workspace.reconcile":
      return runtime.workspaces.reconcile(request.threadId);
    case "projects.open":
      return runtime.projects.open(
        request.projectPath,
        request.sourceId === undefined ? runtime.settings.get().defaultSourceId : request.sourceId,
        request.createIfMissing === true
      );
    case "projects.statistics.read":
      return runtime.projects.readStatistics(request.projectPath, request.sourceId);
    case "projects.pickDirectory":
      return runtime.projects.pickDirectory(
        request.mode,
        request.sourceId === undefined ? runtime.settings.get().defaultSourceId : request.sourceId
      );
    case "projects.setHidden":
      return runtime.projects.setHidden(request.projectId, request.isHidden);
    case "projects.displayName.update":
      return runtime.projects.setDisplayName(request.projectId, request.displayName);
    case "projects.preferences.update":
      return runtime.projects.updatePreferences(request.projectId, request.patch);
    case "projects.context.sync":
      return runtime.context.sync(request.projectId, ...optionalWorkspaceArgument(request.workspaceId));
    case "projects.context.pickFolder":
      return runtime.context.pickFolder();
    case "projects.delete":
      return runtime.projects.delete(request.projectId);
    case "projectGroups.list":
      return runtime.groups.list();
    case "projectGroups.create":
      return runtime.groups.create(
        request.name,
        request.parentGroupId ?? null,
        request.color ?? "blue"
      );
    case "projectGroups.update":
      return runtime.groups.update(request.groupId, request.patch);
    case "projectGroups.delete":
      return runtime.groups.delete(request.groupId);
    case "projectGroups.assignProject":
      return runtime.groups.assignProject(request.projectId, request.groupId);
  }
}
