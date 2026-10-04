/** Environment values that may safely be forwarded to a host-local command. */
export type HostShellEnvironment = Readonly<Record<string, string>>;

/** Windows shells supported by configured project tasks. */
export type WindowsCommandShell = "pwsh.exe" | "powershell.exe";

const HOST_ENVIRONMENT_VARIABLES = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "CODEX_HOME",
  "OPENCODEX_CODEX_COMMAND"
] as const;

/**
 * Reads non-sensitive path and user-directory variables from the Electron host.
 *
 * @param environment Process environment to inspect.
 * @returns Environment values allowed for host-local project commands.
 */
export function readHostShellEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): HostShellEnvironment {
  const hostEnvironment: Record<string, string> = {};

  for (const variableName of HOST_ENVIRONMENT_VARIABLES) {
    const value = environment[variableName];

    if (value !== undefined && value.length > 0) {
      hostEnvironment[variableName] = value;
    }
  }

  return hostEnvironment;
}

/**
 * Creates an OS-appropriate shell command for a configured task.
 *
 * @param command User-configured command.
 * @param projectPath Project working directory.
 * @param windowsShell PowerShell executable selected on the command's source.
 * @returns Executable and arguments.
 */
export function createShellCommand(
  command: string,
  projectPath: string,
  windowsShell: WindowsCommandShell = "powershell.exe"
): string[] {
  const trimmedCommand = command.trim();

  if (trimmedCommand.length === 0) {
    throw new Error("Command is required.");
  }

  if (isWindowsPath(projectPath)) {
    return createPowerShellCommand(trimmedCommand, windowsShell);
  }

  return ["sh", "-lc", trimmedCommand];
}

/** Preserves script quoting/Unicode and reports native failures without masking PowerShell errors. */
function createPowerShellCommand(command: string, shell: WindowsCommandShell): string[] {
  const script = [
    command,
    "if (-not $?) {",
    "  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
    "  exit 1",
    "}",
    "exit 0"
  ].join("\n");

  return [
    shell, "-NoLogo", "-NoProfile", "-NonInteractive", "-OutputFormat", "Text",
    "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")
  ];
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
