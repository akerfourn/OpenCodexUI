import path from "node:path";
import type { SpawnOptionsWithoutStdio } from "node:child_process";
import { windowsJobNative } from "./windowsJobNative.js";

/** Locates the Windows-provided PowerShell without depending on user profile commands. */
export function windowsPowerShellPath(): string {
  return path.win32.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/** Wraps trusted launcher code separately from user data; no temporary executable or extra dependency. */
export function windowsResourceLaunch(
  commandLine: string | null,
  priority: "normal" | "low" | "idle" = "normal",
  cpuLimitPercent: number | null = null
): { command: string; args: string[]; options: SpawnOptionsWithoutStdio } {
  // Never reference PowerShell's $input: the host would consume the app-server's stdin as pipeline objects.
  const script = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  Add-Type -IgnoreWarnings -WarningAction SilentlyContinue -TypeDefinition @'
${windowsJobNative}
'@
  $payload = $env:OPENCODEX_RESOURCE_LAUNCH | ConvertFrom-Json
  [Environment]::SetEnvironmentVariable('OPENCODEX_RESOURCE_LAUNCH', $null, 'Process')
  if ($null -eq $payload.commandLine) { [OpenCodexResourceJob]::Probe(); exit 0 }
  $code = [OpenCodexResourceJob]::Run($payload.commandLine, [uint32]$payload.priority, [uint32]$payload.cpuRate)
  exit $code
} catch {
  [Console]::Error.WriteLine('Unable to apply Codex resource limits: ' + $_.Exception.ToString())
  exit 1
}`;
  let priorityClass = 0x20;
  if (priority === "low") priorityClass = 0x4000;
  if (priority === "idle") priorityClass = 0x40;
  return {
    command: windowsPowerShellPath(),
    args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-OutputFormat", "Text",
      "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
    options: { windowsHide: true, env: { ...process.env, OPENCODEX_RESOURCE_LAUNCH: JSON.stringify({
      commandLine, priority: priorityClass, cpuRate: (cpuLimitPercent ?? 0) * 100
    }) } }
  };
}

/** Quotes native Windows argv using the CRT backslash/quote rules, including empty arguments. */
export function quoteWindowsArgument(value: string): string {
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`;
}

/** Preserves native argv; npm batch shims go through cmd.exe with explicit shell-safe arguments. */
export function windowsCommandLine(command: string, args: string[], shell: boolean): string {
  if (!shell) return [command, ...args].map(quoteWindowsArgument).join(" ");
  // Batch syntax expands these even inside quotes. Reject rather than execute a modified command.
  for (const value of [command, ...args]) {
    if (/["%!\r\n]/.test(value)) throw new Error("Unsupported quoting in the Codex batch command. Select codex.exe instead.");
  }
  const body = [command, ...args].map(value => `"${value}"`).join(" ");
  return `${quoteWindowsArgument(process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe")} /d /s /c "${body}"`;
}
