import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { OpenCodexSettings, OpenCodexSourceKind } from "@open-codex-ui/opencodex-protocol";

interface WorkspaceRootSettings {
  /** Reads the current preferences after source initialization. */
  get(): OpenCodexSettings;
  /** Persists preferences before publishing them to the runtime. */
  update(patch: Partial<OpenCodexSettings>): Promise<OpenCodexSettings>;
}

/** Seeds local storage once, preserving configured locations and deliberate removal. */
export async function initializeDefaultWorkspaceRoot(
  userDataPath: string | undefined,
  sources: ReadonlyArray<{ id: string; kind: OpenCodexSourceKind }>,
  settings: WorkspaceRootSettings
): Promise<void> {
  const current = settings.get();
  if (userDataPath === undefined || current.defaultWorkspaceRootInitialized === true) return;

  const localSources = sources.filter((source) => source.kind === "local");
  const source = localSources.find((candidate) => candidate.id === current.defaultSourceId) ?? localSources[0];
  if (source === undefined) return;

  const roots = current.workspaceRoots ?? [];
  if (roots.some((root) => root.sourceId === source.id)) {
    await settings.update({ defaultWorkspaceRootInitialized: true });
    return;
  }

  const rootPath = path.join(userDataPath, "workspaces");
  await mkdir(rootPath, { recursive: true });
  let rootId = "app-data";
  let suffix = 1;
  while (roots.some((root) => root.id === rootId)) {
    rootId = `app-data-${suffix}`;
    suffix += 1;
  }
  await settings.update({
    workspaceRoots: [...roots, {
      id: rootId,
      sourceId: source.id,
      label: "OpenCodexUI",
      path: rootPath,
      isDefault: true
    }],
    defaultWorkspaceRootInitialized: true
  });
}
