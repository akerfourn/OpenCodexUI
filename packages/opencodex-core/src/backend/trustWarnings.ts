/**
 * Parses Codex trust warnings emitted on stderr.
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

function readTrustedProjectPath(message: string): string | null {
  const match = /add\s+(.+?)\s+as a trusted project in\s+.+?config\.toml/s.exec(message);
  return match?.[1]?.trim() ?? null;
}

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

