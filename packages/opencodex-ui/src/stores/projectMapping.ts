import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";

/**
 * Resolves the source used for a new project-open request.
 *
 * @param selectedSourceId Source currently selected on Home.
 * @param defaultSourceId Configured default source.
 * @param firstSourceId First available source fallback.
 * @returns Source identifier, or `null` when none is available.
 */
export function resolveProjectOpenSourceId(
  selectedSourceId: string | null | undefined,
  defaultSourceId: string | null | undefined,
  firstSourceId: string | null | undefined
): string | null {
  return selectedSourceId ?? defaultSourceId ?? firstSourceId ?? null;
}

/**
 * Creates local project metadata when only a path is available.
 *
 * @param projectPath Project path.
 * @param projectName Optional project display name.
 * @param sourceId Optional source identifier.
 * @returns Client-side project metadata.
 */
export function createClientProject(
  projectPath: string,
  projectName: string | null,
  sourceId: string | null
): OpenCodexProject {
  const now = new Date().toISOString();
  const safePath = projectPath.trim().length > 0 ? projectPath.trim() : "unknown";
  const defaultName = projectName ?? readProjectName(safePath);

  return {
    id: `client:${sourceId ?? "orphan"}:${safePath}`,
    sourceId,
    path: safePath,
    defaultName,
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
 * Reads the default project name from a filesystem-like path.
 *
 * @param projectPath Project path.
 * @returns Last path segment or the original path.
 */
function readProjectName(projectPath: string): string {
  const segments = projectPath.split(/[\\/]/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? projectPath;
}
