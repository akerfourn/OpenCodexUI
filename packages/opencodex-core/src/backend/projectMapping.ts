/**
 * Maps cached projects.
 */
import type { CachedProject, CachedSource } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";

export function toOpenCodexProject(project: CachedProject): OpenCodexProject {
  return {
    id: project.id,
    sourceId: project.sourceId,
    path: project.path,
    defaultName: project.defaultName,
    displayName: project.displayName,
    isHidden: project.isHidden,
    preferences: project.preferences,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastSeenAt: project.lastSeenAt,
    editedAt: project.editedAt
  };
}

export function shouldValidateProjectPathOnHost(source: CachedSource): boolean {
  return source.settings.commandMode === "auto";
}
