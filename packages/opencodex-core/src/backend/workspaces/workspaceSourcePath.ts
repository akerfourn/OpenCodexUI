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
