/**
 * Parses Codex trust warnings emitted on stderr.
 *
 * @param message Raw stderr message.
 * @param fallbackProjectPath Project path to use when Codex omits it.
 * @returns Parsed warning metadata, or `null` when the message is unrelated.
 */
export function parseProjectTrustWarning(
  message: string,
  fallbackProjectPath: string | null
): { projectPath: string; disabledFolders: string[] } | null {
  if (!message.includes("Project-local config, hooks, and exec policies are disabled")) {
    return null;
  }

  const projectPath = readTrustedProjectPath(message) ?? fallbackProjectPath;

  if (projectPath === null || projectPath.trim().length === 0) {
    return null;
  }

  return {
    projectPath,
    disabledFolders: readDisabledProjectFolders(message)
  };
}

/**
 * Extracts the project path mentioned in a trust warning.
 *
 * @param message Raw warning message.
 * @returns Project path, or `null` when absent.
 */
function readTrustedProjectPath(message: string): string | null {
  const match = /add\s+(.+?)\s+as a trusted project in\s+.+?config\.toml/s.exec(message);
  return match?.[1]?.trim() ?? null;
}

/**
 * Extracts disabled project-local configuration folders from a warning.
 *
 * @param message Raw warning message.
 * @returns Folder paths listed by Codex.
 */
function readDisabledProjectFolders(message: string): string[] {
  const folders: string[] = [];
  const folderPattern = /^\s*\d+\.\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = folderPattern.exec(message)) !== null) {
    const folder = match[1]?.trim() ?? "";

    if (folder.length > 0) {
      folders.push(folder);
    }
  }

  return folders;
}
