/**
 * Maps cached projects.
 */
import type { CachedProject, CachedSource } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";

/**
 * Converts a cached project row into the protocol project DTO.
 *
 * @param project Cached project row.
 * @returns Protocol project.
 */
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

/**
 * Determines whether the Electron host can validate paths for a source.
 *
 * @param source Cached source.
 * @returns True when source paths live on the host filesystem.
 */
export function shouldValidateProjectPathOnHost(source: CachedSource): boolean {
  return source.kind === "local";
}
