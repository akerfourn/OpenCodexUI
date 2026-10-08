import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";

import { createShellCommand, isWindowsPath, type HostShellEnvironment } from "./projectCommandExecution.js";

/**
 * Selects PowerShell on the execution source, never from the Electron host.
 * Only a missing pwsh falls back to Windows PowerShell; user commands are never retried.
 * Keeps the default output cap for Windows sandbox compatibility.
 */
export async function resolveProjectCommandShell(
  client: Pick<CodexAppServerClient, "request">,
  command: string,
  projectPath: string,
  environment?: HostShellEnvironment
): Promise<string[]> {
  const shellCommand = createShellCommand(command, projectPath);
  if (!isWindowsPath(projectPath)) {
    return shellCommand;
  }

  const result = await client.request<v2.CommandExecResponse>("command/exec", {
    command: ["where.exe", "/q", "$PATH:pwsh.exe"],
    cwd: projectPath,
    timeoutMs: 5000,
    ...(environment === undefined ? {} : { env: environment })
  });

  if (result.exitCode === 0) {
    return createShellCommand(command, projectPath, "pwsh.exe");
  }
  if (result.exitCode === 1) {
    return shellCommand;
  }

  const details = result.stderr.trim() || `exit code ${result.exitCode}`;
  throw new Error(`Unable to detect PowerShell on this source: ${details}`);
}
