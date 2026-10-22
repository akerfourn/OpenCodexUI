import path from "node:path";

/** Normalizes supported source-native absolute paths without resolving them on the host. */
export function normalizeWorkspaceSourcePath(value: string): string {
  if (value !== value.trim() || /[\0\r\n]/u.test(value)) {
    throw new Error("Workspace requires a normalized absolute source path.");
  }
  if (value.startsWith("/")) {
    return path.posix.normalize(value);
  }
  if (/^[a-zA-Z]:[\\/]/u.test(value) || /^\\\\[^\\/]+[\\/][^\\/]+/u.test(value)) {
    return path.win32.normalize(value);
  }
  throw new Error("Workspace requires an absolute path in its source.");
}

/** Compares normalized source paths with native Windows case and separator semantics. */
export function workspaceSourcePathsEqual(left: string, right: string): boolean {
  const a = normalizeWorkspaceSourcePath(left);
  const b = normalizeWorkspaceSourcePath(right);
  if (a.startsWith("/")) return a === b;
  return a.toLowerCase() === b.toLowerCase();
}

/** Distinguishes source-side absence from access failures, including localized Windows errors. */
export function isMissingWorkspacePathError(error: unknown, sourcePath: string): boolean {
  if (!(error instanceof Error)) return false;
  if (/no such file|\b(file|path)\b.*\bnot found\b|cannot find the (?:file|path) specified|\bENOENT\b|\(os error 2\)/iu
    .test(error.message)) return true;
  return !sourcePath.startsWith("/") && /\(os error 3\)/u.test(error.message);
}
