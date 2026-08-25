/**
 * Creates an OS-appropriate shell command for a configured task.
 *
 * @param command User-configured command.
 * @param projectPath Project working directory.
 * @returns Executable and arguments.
 */
export function createShellCommand(command: string, projectPath: string): string[] {
  const trimmedCommand = command.trim();

  if (trimmedCommand.length === 0) {
    throw new Error("Command is required.");
  }

  if (isWindowsPath(projectPath)) {
    return ["cmd.exe", "/d", "/s", "/c", trimmedCommand];
  }

  return ["sh", "-lc", trimmedCommand];
}

/**
 * Detects Windows-style project paths.
 *
 * @param value Path candidate.
 * @returns Whether the path is Windows-style.
 */
export function isWindowsPath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

/**
 * Sanitizes an identifier for safe log-directory usage.
 *
 * @param value Raw path segment.
 * @returns Filesystem-safe segment.
 */
export function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
