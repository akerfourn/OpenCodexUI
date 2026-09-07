import { createHash } from "node:crypto";
import path from "node:path";
import type { WorkspaceTransitionRecord } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectContextFolder } from "@open-codex-ui/opencodex-protocol";
import { buildManagedPermissionProfile, type ManagedConfigBlockInput } from "../projects/projectContextConfig.js";

/** Builds a stable source/workspace/policy identity; labels and folder ordering do not change it. */
export function workspacePermissionInput(
  transition: WorkspaceTransitionRecord,
  folders: OpenCodexProjectContextFolder[]
): ManagedConfigBlockInput {
  const fromPath = normalizePermissionPath(transition.fromPath);
  const toPath = normalizePermissionPath(transition.toPath);
  if (pathsOverlap(fromPath, toPath)) {
    throw new Error("Workspace permission preparation requires separate, non-nested directories.");
  }
  const unique = new Map<string, ManagedConfigBlockInput["externalFolders"][number]>();
  for (const folder of folders) {
    if (!folder.enabled) {
      continue;
    }
    const folderPath = normalizePermissionPath(folder.path);
    if (pathsOverlap(folderPath, fromPath) || pathsOverlap(folderPath, toPath)) {
      throw new Error("Shared context overlaps a transitioning workspace; isolation cannot be established.");
    }
    const permission = folder.permission ?? "read";
    const envFilePermission = folder.envFilePermission ?? "deny";
    if (permission !== "read" && permission !== "write") {
      throw new Error("Unsupported shared-folder permission.");
    }
    if (!["read", "write", "deny"].includes(envFilePermission)
      || (permission === "read" && envFilePermission === "write")) {
      throw new Error("Environment-file permission exceeds the shared-folder policy.");
    }
    const normalized = { path: folderPath, permission, envFilePermission };
    const previous = unique.get(folderPath);
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(normalized)) {
      throw new Error("Conflicting permissions for the same shared folder.");
    }
    unique.set(folderPath, normalized);
  }
  const input: ManagedConfigBlockInput = {
    projectPath: toPath,
    externalFolders: [...unique.values()].sort(compareFolderPaths),
    profileId: "pending", restrictTemporaryDirectories: true, networkAccess: false
  };
  const digest = createHash("sha256").update(JSON.stringify({
    sourceId: transition.sourceId, workspaceId: transition.toWorkspaceId,
    profile: buildManagedPermissionProfile(input)
  })).digest("hex");
  input.profileId = `opencodex-workspace-${digest}`;
  return input;
}

/** Uses stable code-point ordering, independent of the host's locale. */
function compareFolderPaths(
  left: ManagedConfigBlockInput["externalFolders"][number], right: ManagedConfigBlockInput["externalFolders"][number]
): number {
  if (left.path < right.path) {
    return -1;
  }
  return left.path === right.path ? 0 : 1;
}

/** Supports source-local POSIX and native Windows paths without interpreting them on the host. */
export function normalizePermissionPath(value: string): string {
  if (value.trim() !== value || /[\u0000\r\n*?\[\]{}]/u.test(value)) {
    throw new Error("Workspace permission paths must be literal absolute paths.");
  }
  if (value.startsWith("/") && !value.startsWith("//")) {
    return path.posix.normalize(value);
  }
  if (/^[a-zA-Z]:[\\/]/u.test(value) || value.startsWith("\\\\")) {
    return path.win32.normalize(value);
  }
  throw new Error("Workspace permission paths must be absolute in their source filesystem.");
}

/** Rejects ancestor access that could re-authorize the old workspace, conservatively on Windows. */
function pathsOverlap(left: string, right: string): boolean {
  const windows = !left.startsWith("/");
  if (windows !== !right.startsWith("/")) {
    throw new Error("Shared context uses a different filesystem path format.");
  }
  const api = windows ? path.win32 : path.posix;
  const a = windows ? left.toLowerCase() : left;
  const b = windows ? right.toLowerCase() : right;
  return contains(api.relative(a, b), api.sep) || contains(api.relative(b, a), api.sep);
}

/** A relative child contains no parent traversal or drive-qualified absolute path. */
function contains(relative: string, separator: string): boolean {
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${separator}`)
    && !path.posix.isAbsolute(relative) && !path.win32.isAbsolute(relative));
}
