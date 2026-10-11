import fs from "node:fs/promises";
import path from "node:path";

/**
 * Resolves a user-provided host project path and checks that it is a directory.
 * Creates missing directories only when requested; other filesystem errors propagate.
 */
export async function ensureProjectDirectory(projectPath: string, createIfMissing: boolean): Promise<string> {
  const trimmedPath = projectPath.trim();

  if (trimmedPath.length === 0) {
    throw new Error("Project path is required.");
  }

  const resolvedPath = path.resolve(trimmedPath);

  try {
    const stats = await fs.stat(resolvedPath);

    if (!stats.isDirectory()) {
      throw new Error(`Project path is not a directory: ${resolvedPath}`);
    }

    return resolvedPath;
  } catch (error) {
    if (isMissingPathError(error) && createIfMissing) {
      await fs.mkdir(resolvedPath, { recursive: true });
      return resolvedPath;
    }

    throw error;
  }
}

/** Identifies ENOENT errors that permit the requested directory creation. */
function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
