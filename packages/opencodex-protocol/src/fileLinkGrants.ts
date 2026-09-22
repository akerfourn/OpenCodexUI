import type { OpenCodexFileGrant } from "./files";

/** Drops malformed persisted grants instead of treating them as authorizations. */
export function normalizeFileLinkGrants(value: unknown): OpenCodexFileGrant[] {
  if (!Array.isArray(value)) return [];
  const result: OpenCodexFileGrant[] = [];
  for (const candidate of value) {
    if (candidate === null || typeof candidate !== "object") continue;
    const keys = ["sourceId", "projectId", "workspaceId", "workspacePath", "destination"] as const;
    if (keys.some(key => typeof candidate[key] !== "string" || candidate[key].length === 0)) continue;
    if (!["denied", "readOnly", "readWrite"].includes(candidate.access)) continue;
    result.push({ sourceId: candidate.sourceId, projectId: candidate.projectId,
      workspaceId: candidate.workspaceId, workspacePath: candidate.workspacePath,
      destination: candidate.destination, access: candidate.access });
  }
  return result;
}
