import path from "node:path";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexWorkspaceCreateInput, OpenCodexWorkspaceCreation, OpenCodexWorkspaceRoot } from
  "@open-codex-ui/opencodex-protocol";
import { normalizeWorkspaceRoots } from "./workspaceRootsSettings.js";
import { normalizeWorkspaceSourcePath } from "./workspaceSourcePath.js";

/** Frozen physical creation target; workspace IDs never derive from paths. */
export interface WorkspaceStorageDestination {
  destinationPath: string;
  rootPath: string | null;
}

/** Resolves an explicit custom path or a configured root in the requested source only. */
export function resolveWorkspaceStorage(input: OpenCodexWorkspaceCreateInput, workspaceId: string,
  roots: OpenCodexWorkspaceRoot[]): WorkspaceStorageDestination {
  if (input.destinationPath !== undefined) {
    if (input.rootId !== undefined) throw new Error("Choose either a workspace storage root or a custom destination.");
    return { destinationPath: normalizeWorkspaceSourcePath(input.destinationPath), rootPath: null };
  }
  const root = normalizeWorkspaceRoots(roots).find((item) => item.sourceId === input.sourceId
    && (input.rootId === undefined ? item.isDefault : item.id === input.rootId));
  if (root === undefined) throw new Error("Configure a workspace storage root for this source or choose a custom path.");
  if (!/^[a-zA-Z0-9_-]+$/u.test(input.projectId) || !/^[a-zA-Z0-9_-]+$/u.test(workspaceId)) {
    throw new Error("Workspace storage requires path-safe project and workspace identifiers.");
  }
  const syntax = root.path.startsWith("/") ? path.posix : path.win32;
  return { rootPath: root.path, destinationPath: syntax.join(root.path, input.projectId, workspaceId) };
}

/** Creates only the automatic hierarchy, leaving the worktree leaf exclusively to Git. */
export async function prepareWorkspaceStorage(client: Pick<CodexAppServerClient, "getMetadata" | "createDirectory">,
  creation: OpenCodexWorkspaceCreation): Promise<void> {
  if (creation.rootPath === null || creation.rootPath === undefined) return;
  const syntax = creation.rootPath.startsWith("/") ? path.posix : path.win32;
  const expected = syntax.join(creation.rootPath, creation.projectId, creation.workspaceId);
  if (creation.destinationPath !== expected) throw new Error("Automatic workspace destination does not match its reserved identity.");
  let ancestor = creation.rootPath;
  for (;;) {
    const metadata = await client.getMetadata(ancestor);
    if (!metadata.isDirectory || metadata.isSymlink) throw new Error("Workspace storage and its ancestors must be existing directories without symbolic links.");
    const parent = syntax.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const projectDirectory = syntax.join(creation.rootPath, creation.projectId);
  await ensureStorageDirectory(client, projectDirectory);
}

/** Checks each hierarchy level before and after creation, refusing files and symbolic links. */
async function ensureStorageDirectory(client: Pick<CodexAppServerClient, "getMetadata" | "createDirectory">,
  directory: string): Promise<void> {
  try {
    const metadata = await client.getMetadata(directory);
    if (!metadata.isDirectory || metadata.isSymlink) throw new Error("Workspace storage hierarchy contains a file or symbolic link.");
    return;
  } catch (error) {
    if (!(error instanceof Error) || !/no such file|\b(file|path)\b.*\bnot found\b/iu.test(error.message)) throw error;
  }
  await client.createDirectory(directory);
  const metadata = await client.getMetadata(directory);
  if (!metadata.isDirectory || metadata.isSymlink) throw new Error("Created workspace storage directory is not a regular directory.");
}
