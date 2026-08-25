/**
 * Maps cached projects.
 */
import { createProjectIdentity } from "@open-codex-ui/opencodex-cache";
import type { CachedProject, CachedSource } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";

/** Normalized identity used by an uncached project snapshot. */
export type ProjectIdentity = NonNullable<ReturnType<typeof createProjectIdentity>>;

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
 * Creates a project DTO when the cache cannot persist it yet.
 *
 * @param projectIdentity Normalized project identity.
 * @param sourceId Source identifier, or `null`.
 * @returns Ephemeral project DTO.
 */
export function createUncachedProject(
  projectIdentity: ProjectIdentity,
  sourceId: string | null
): OpenCodexProject {
  const now = new Date().toISOString();

  return {
    id: projectIdentity.id,
    sourceId,
    path: projectIdentity.path,
    defaultName: projectIdentity.defaultName,
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    editedAt: now
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
