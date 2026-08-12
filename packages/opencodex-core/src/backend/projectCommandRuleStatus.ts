import path from "node:path";

import type {
  CachedProject,
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectCommandRuleStatus } from "@open-codex-ui/opencodex-protocol";

const managedRulesFileName = "opencodex-ui.rules";

/**
 * Returns the generated rules file path for a local project.
 *
 * @param projectPath Project path.
 * @returns Managed rules file path.
 */
export function getRulesFilePath(projectPath: string): string {
  return path.join(projectPath, ".codex", "rules", managedRulesFileName);
}

/**
 * Checks whether a source can be handled by the first local-only integration.
 *
 * @param source Codex source.
 * @returns Whether source-side local filesystem and command access are available.
 */
export function isSupportedSource(source: CachedSource): boolean {
  if (source.kind === "local") {
    return true;
  }

  return source.kind === "custom" && source.settings.hasLocalAccess;
}

/**
 * Creates an unsupported status without starting a Codex client.
 *
 * @param project Cached project.
 * @param desiredHash Desired generated file hash.
 * @param fileState Persisted file state.
 * @returns Unsupported status.
 */
export function createUnsupportedStatus(
  project: CachedProject,
  desiredHash: string,
  fileState: Awaited<ReturnType<OpenCodexCacheRepository["getProjectCommandRuleFileState"]>>
): OpenCodexProjectCommandRuleStatus {
  return {
    projectId: project.id,
    sourceId: project.sourceId,
    filePath: null,
    fileStatus: "unsupported",
    generatedHash: fileState?.generatedHash ?? null,
    currentHash: null,
    desiredHash,
    isSupported: false,
    runtimeState: "ready",
    runtimeMessage: null
  };
}

/**
 * Resolves whether the generated file is synchronized or needs attention.
 *
 * @param generatedHash Last hash written by OpenCodexUI.
 * @param currentHash Hash currently present on disk.
 * @param desiredHash Hash produced from current SQLite rules.
 * @param fileState Persisted file state.
 * @returns File synchronization status.
 */
export function resolveFileStatus(
  generatedHash: string | null,
  currentHash: string | null,
  desiredHash: string,
  fileState: Awaited<ReturnType<OpenCodexCacheRepository["getProjectCommandRuleFileState"]>>
): OpenCodexProjectCommandRuleStatus["fileStatus"] {
  if (currentHash !== null && currentHash === desiredHash) {
    return "synchronized";
  }

  if (currentHash !== null && (
    (generatedHash !== null && currentHash !== generatedHash) ||
    (fileState === null && currentHash !== desiredHash)
  )) {
    return "external";
  }

  if (currentHash === null && generatedHash === null) {
    return "notGenerated";
  }

  return "pending";
}
