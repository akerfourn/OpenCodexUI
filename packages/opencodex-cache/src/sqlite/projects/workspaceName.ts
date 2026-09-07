/** Validates display metadata independently of source-native paths and Git branch names. */
export function validateWorkspaceName(name: string): string {
  if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 100
    || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error("Workspace name must contain 1 to 100 characters without control characters.");
  }
  return name.trim();
}

/** Derives a legacy label using source syntax without interpreting the path on the host. */
export function defaultWorkspaceName(path: string): string {
  const name = path.replace(/[\\/]+$/u, "").split(/[\\/]/u).at(-1);
  if (name === undefined || name.length === 0) return path;
  return name;
}
