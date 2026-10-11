import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Finds a host prompt in packaged resources, the repository root, then the launch directory.
 * Uses the repository-root candidate as the fallback when no file exists.
 */
export function resolveCommitPromptPath(
  fileName: string,
  resourcesPath: string | undefined,
  workingDirectory: string
): string {
  const packagedResourcesPath = resourcesPath === undefined
    ? null
    : path.join(resourcesPath, fileName);

  const candidates = [
    packagedResourcesPath,
    path.resolve(workingDirectory, "..", "..", fileName),
    path.resolve(workingDirectory, fileName)
  ].filter((candidate): candidate is string => candidate !== null);

  return candidates.find((candidate) => existsSync(candidate))
    ?? path.resolve(workingDirectory, "..", "..", fileName);
}
