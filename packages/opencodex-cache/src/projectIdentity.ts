/**
 * Normalizes project paths and derives stable identifiers for cached project entries.
 */
import crypto from "node:crypto";
import path from "node:path";

export type ProjectIdentity = {
  id: string;
  sourceKey: string;
  path: string;
  defaultName: string;
};

/**
 * Builds a stable cache identity for a source-owned project path.
 *
 * @param value Raw project path provided by the caller.
 * @param sourceId Source that owns the project, or `null` for orphan projects.
 * @returns Normalized project identity, or `null` when the input path is empty.
 */
export function createProjectIdentity(value: string, sourceId: string | null = null): ProjectIdentity | null {
  const normalizedPath = normalizeProjectPath(value);

  if (normalizedPath === null) {
    return null;
  }

  const sourceKey = createProjectSourceKey(sourceId);

  return {
    id: createProjectId(normalizedPath, sourceKey),
    sourceKey,
    path: normalizedPath,
    defaultName: readDefaultProjectName(normalizedPath)
  };
}

/**
 * Normalizes a project path while preserving Windows path semantics when needed.
 *
 * @param value Raw path value to normalize.
 * @returns Normalized absolute path, or `null` when the input is empty.
 */
export function normalizeProjectPath(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim() ?? "";

  if (trimmedValue.length === 0) {
    return null;
  }

  if (trimmedValue.startsWith("/")) {
    return normalizeUnixPath(trimmedValue);
  }

  if (isWindowsPath(trimmedValue)) {
    return path.win32.normalize(trimmedValue);
  }

  return path.resolve(trimmedValue);
}

/**
 * Creates a stable identifier from a normalized project path.
 *
 * @param projectPath Normalized project path.
 * @returns SHA-256 identifier used as the project primary key.
 */
function createProjectId(projectPath: string, sourceKey: string): string {
  return crypto
    .createHash("sha256")
    .update(createProjectKey(projectPath, sourceKey))
    .digest("hex");
}

/**
 * Creates the canonical string used to hash a project path.
 *
 * @param projectPath Normalized project path.
 * @param sourceKey Stable source discriminator.
 * @returns Canonical path string used as the hash input.
 */
function createProjectKey(projectPath: string, sourceKey: string): string {
  const normalizedSourceKey = sourceKey.length > 0 ? sourceKey : "orphan";
  const normalizedProjectPath = normalizeProjectPathForKey(projectPath);

  return `${normalizedSourceKey}:${normalizedProjectPath}`;
}

/**
 * Creates the stable source discriminator used by project identities.
 *
 * @param sourceId Source identifier, or `null` for orphan projects.
 * @returns Stable source key.
 */
export function createProjectSourceKey(sourceId: string | null): string {
  return sourceId ?? "orphan";
}

/**
 * Normalizes a path for identity hashing.
 *
 * @param projectPath Normalized project path.
 * @returns Canonical path string used as the hash input.
 */
function normalizeProjectPathForKey(projectPath: string): string {
  if (isWindowsPath(projectPath)) {
    return projectPath.replaceAll("\\", "/").toLowerCase();
  }

  return projectPath;
}

/**
 * Derives the default display name for a project from its path.
 *
 * @param projectPath Normalized project path.
 * @returns Basename of the project path, or the full path when no basename exists.
 */
function readDefaultProjectName(projectPath: string): string {
  const baseName = isWindowsPath(projectPath)
    ? path.win32.basename(projectPath)
    : path.posix.basename(projectPath);

  return baseName.length > 0 ? baseName : projectPath;
}

/**
 * Detects whether a path follows Windows path conventions.
 *
 * @param value Path value to inspect.
 * @returns `true` when the value looks like a Windows drive or UNC path.
 */
function isWindowsPath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

/**
 * Normalizes Unix paths while accepting both slash styles.
 *
 * @param value Unix path value.
 * @returns Normalized POSIX path.
 */
function normalizeUnixPath(value: string): string {
  return path.posix.normalize(value.replaceAll("\\", "/"));
}
