/**
 * Maps cached projects and validates source-local project paths.
 */
import { statSync } from "node:fs";

import type { CachedProject, CachedSource } from "@open-codex-ui/opencodex-cache";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";

export function toOpenCodexProject(project: CachedProject): OpenCodexProject {
  return {
    id: project.id,
    sourceId: project.sourceId,
    path: project.path,
    defaultName: project.defaultName,
    displayName: project.displayName,
    isHidden: project.isHidden,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastSeenAt: project.lastSeenAt,
    editedAt: project.editedAt
  };
}

export function shouldHideProjectPath(projectPath: string | null, source: CachedSource): boolean {
  if (!shouldValidateProjectPathOnHost(source)) {
    return false;
  }

  const normalizedProjectPath = normalizeProjectPath(projectPath);

  if (normalizedProjectPath === null) {
    return false;
  }

  try {
    return !statSync(normalizedProjectPath).isDirectory();
  } catch {
    return true;
  }
}

function shouldValidateProjectPathOnHost(source: CachedSource): boolean {
  return source.settings.commandMode === "auto";
}

