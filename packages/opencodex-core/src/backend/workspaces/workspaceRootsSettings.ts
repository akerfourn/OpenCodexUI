import type { OpenCodexWorkspaceRoot } from "@open-codex-ui/opencodex-protocol";
import { normalizeWorkspaceSourcePath } from "./workspaceSourcePath.js";

/** Validates storage preferences without contacting a source or changing existing workspaces. */
export function normalizeWorkspaceRoots(roots: OpenCodexWorkspaceRoot[]): OpenCodexWorkspaceRoot[] {
  if (!Array.isArray(roots) || roots.length > 100) throw new Error("Workspace storage requires at most 100 roots.");
  const ids = new Set<string>();
  const defaults = new Map<string, number>();
  const paths = new Set<string>();
  const normalized = roots.map((root) => {
    if (root === null || typeof root !== "object" || typeof root.id !== "string"
      || !/^[a-zA-Z0-9_-]{1,100}$/u.test(root.id) || ids.has(root.id)
      || typeof root.sourceId !== "string" || root.sourceId.length === 0
      || typeof root.label !== "string" || root.label.trim().length === 0 || root.label.trim().length > 100
      || typeof root.path !== "string" || typeof root.isDefault !== "boolean") {
      throw new Error("Workspace storage requires unique identities, a source, a label and an absolute path.");
    }
    const path = normalizeWorkspaceSourcePath(root.path);
    const pathKey = JSON.stringify([root.sourceId, path]);
    if (paths.has(pathKey)) throw new Error("This workspace storage path is already configured for this source.");
    paths.add(pathKey);
    ids.add(root.id);
    defaults.set(root.sourceId, (defaults.get(root.sourceId) ?? 0) + Number(root.isDefault));
    return { id: root.id, sourceId: root.sourceId, label: root.label.trim(), path, isDefault: root.isDefault };
  });
  if ([...defaults.values()].some((count) => count !== 1)) {
    throw new Error("Each configured source requires exactly one default workspace storage root.");
  }
  return normalized;
}
