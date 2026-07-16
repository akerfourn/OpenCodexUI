/**
 * Provides native host actions for local project folders.
 */
import { shell } from "electron";
import { spawn } from "node:child_process";

type TerminalCommand = {
  command: string;
  args: string[];
};

/**
 * Opens a project folder with the operating system's default file manager.
 *
 * @param projectPath Absolute project folder path.
 * @returns Promise resolved after the host accepts the path.
 */
export async function openProjectFolder(projectPath: string): Promise<void> {
  const errorMessage = await shell.openPath(projectPath);

  if (errorMessage.length > 0) {
    throw new Error(`Unable to open project folder: ${errorMessage}`);
  }
}

/**
 * Opens a terminal window with the project folder as its working directory.
 *
 * @param projectPath Absolute project folder path.
 * @returns Promise resolved after a terminal process has been started.
 */
export async function openProjectTerminal(projectPath: string): Promise<void> {
  const terminalCommands = createTerminalCommands(projectPath);

  for (const terminalCommand of terminalCommands) {
    const started = await spawnDetachedProcess(
      terminalCommand.command,
      terminalCommand.args,
      projectPath
    );

    if (started) {
      return;
    }
  }

  throw new Error("No supported terminal application was found.");
}

/**
 * Builds platform-specific terminal commands ordered from preferred to fallback.
 *
 * @param projectPath Absolute project folder path.
 * @returns Candidate terminal commands.
 */
function createTerminalCommands(projectPath: string): TerminalCommand[] {
  const configuredTerminal = process.env.TERMINAL?.trim();
  const configuredCommands = configuredTerminal === undefined || configuredTerminal.length === 0
    ? []
    : [{ command: configuredTerminal, args: [] }];

  if (process.platform === "win32") {
    return [
      ...configuredCommands,
      { command: "wt.exe", args: ["-d", projectPath] },
      { command: process.env.ComSpec ?? "cmd.exe", args: ["/K"] }
    ];
  }

  if (process.platform === "darwin") {
    return [
      ...configuredCommands,
      createMacTerminalCommand(projectPath)
    ];
  }

  return [
    ...configuredCommands,
    { command: "x-terminal-emulator", args: [] },
    { command: "gnome-terminal", args: ["--working-directory", projectPath] },
    { command: "konsole", args: ["--workdir", projectPath] },
    { command: "xfce4-terminal", args: ["--working-directory", projectPath] },
    { command: "mate-terminal", args: ["--working-directory", projectPath] },
    { command: "kitty", args: ["--directory", projectPath] },
    { command: "alacritty", args: ["--working-directory", projectPath] }
  ];
}

/**
 * Creates an AppleScript command that opens the default macOS Terminal at a path.
 *
 * @param projectPath Absolute project folder path.
 * @returns Terminal command descriptor.
 */
function createMacTerminalCommand(projectPath: string): TerminalCommand {
  const shellPath = process.env.SHELL ?? "/bin/zsh";
  const shellCommand = `cd -- ${quotePosixArgument(projectPath)} && exec ${quotePosixArgument(shellPath)}`;
  const appleScript = `tell application "Terminal" to do script "${escapeAppleScriptString(shellCommand)}"`;

  return {
    command: "osascript",
    args: ["-e", appleScript]
  };
}

/**
 * Starts a detached process and reports whether the operating system accepted it.
 *
 * @param command Executable name or path.
 * @param args Executable arguments.
 * @param cwd Working directory for the new process.
 * @returns Whether the process emitted a successful spawn event.
 */
function spawnDetachedProcess(command: string, args: string[], cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });

    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

/**
 * Quotes one argument for a POSIX shell command.
 *
 * @param value Argument value.
 * @returns Safely single-quoted argument.
 */
function quotePosixArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Escapes a value for an AppleScript string literal.
 *
 * @param value String value.
 * @returns AppleScript-compatible string content.
 */
function escapeAppleScriptString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
