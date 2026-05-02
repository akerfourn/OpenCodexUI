import crypto from "node:crypto";
import path from "node:path";

export type ProjectIdentity = {
  id: string;
  path: string;
  defaultName: string;
};

export function createProjectIdentity(value: string): ProjectIdentity | null {
  const normalizedPath = normalizeProjectPath(value);

  if (normalizedPath === null) {
    return null;
  }

  return {
    id: createProjectId(normalizedPath),
    path: normalizedPath,
    defaultName: readDefaultProjectName(normalizedPath)
  };
}

export function normalizeProjectPath(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim() ?? "";

  if (trimmedValue.length === 0) {
    return null;
  }

  if (isWindowsPath(trimmedValue)) {
    return path.win32.normalize(trimmedValue);
  }

  return path.resolve(trimmedValue);
}

function createProjectId(projectPath: string): string {
  return crypto
    .createHash("sha256")
    .update(createProjectKey(projectPath))
    .digest("hex");
}

function createProjectKey(projectPath: string): string {
  if (isWindowsPath(projectPath)) {
    return projectPath.replaceAll("\\", "/").toLowerCase();
  }

  return projectPath;
}

function readDefaultProjectName(projectPath: string): string {
  const baseName = isWindowsPath(projectPath)
    ? path.win32.basename(projectPath)
    : path.basename(projectPath);

  return baseName.length > 0 ? baseName : projectPath;
}

function isWindowsPath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}
