import path from "node:path";
import { resolveCodexCommand, type ResolvedCodexCommand } from "@open-codex-ui/codex-rpc";
import type { OpenCodexSource } from "@open-codex-ui/opencodex-protocol";
import { isStandaloneCodexPath } from "./codexUpdatePaths.js";
import type { CodexUpdateProcessRunner } from "./codexUpdateProcess.js";

interface WslLaunch {
  command: string;
  launcherArgs: string[];
  codexArgs: string[];
}

const PROBE_TIMEOUT_MS = 5_000;
const PROBE_SCRIPT = [
  "set -eu",
  'requested="$1"',
  'case "$requested" in "~/"*) requested="$HOME/${requested#??}" ;; esac',
  'selected=$(command -v "$requested")',
  '[ -f "$selected" ] && [ -x "$selected" ]',
  'canonical=$(readlink -f -- "$selected")',
  'printf \'%s\\0%s\\0%s\\0\' "$selected" "$canonical" "${WSL_DISTRO_NAME:-}"'
].join("\n");

/** Resolves a direct typed or custom WSL source without inspecting Linux paths on the Windows host. */
export function getWslLaunch(source: OpenCodexSource): WslLaunch | null {
  if (source.kind === "wsl") {
    const launcherArgs: string[] = [];
    if (source.settings.distro !== null) {
      if (source.settings.distro.length === 0 || source.settings.distro.startsWith("-")) return null;
      launcherArgs.push("--distribution", source.settings.distro);
    }
    let nativeCommand = source.settings.codexCommand.trim();
    if (nativeCommand.length === 0) nativeCommand = "codex";
    const codexArgs = resolveCodexCommand(`wsl.exe ${nativeCommand}`, []).args;
    return validateLaunch({ command: "wsl.exe", launcherArgs, codexArgs });
  }
  if (source.kind !== "custom" || source.settings.command === null) return null;
  const resolved = resolveCodexCommand(source.settings.command, []);
  const executable = path.win32.basename(resolved.command).toLowerCase();
  if (executable !== "wsl.exe" && executable !== "wsl") return null;
  const launcherArgs: string[] = [];
  let index = 0;
  while (index < resolved.args.length) {
    const argument = resolved.args[index]!;
    if (argument === "--" || argument === "--exec" || argument === "-e") {
      index += 1;
      break;
    }
    if (["--distribution", "-d", "--user", "-u", "--cd"].includes(argument)) {
      const value = resolved.args[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("-")) return null;
      launcherArgs.push(argument, value);
      index += 2;
      continue;
    }
    if (argument.startsWith("-")) return null;
    break;
  }
  return validateLaunch({ command: resolved.command, launcherArgs, codexArgs: resolved.args.slice(index) });
}

/** Probes only the selected distro/user, resolves symlinks there, and pins updates to the detected distribution. */
export async function resolveWslCodexUpdate(
  launch: WslLaunch,
  run: CodexUpdateProcessRunner
): Promise<ResolvedCodexCommand | null> {
  const result = await run({ command: launch.command,
    args: [...launch.launcherArgs, "--exec", "sh", "-c", PROBE_SCRIPT, "opencodex-update-probe", launch.codexArgs[0]!],
    shell: false }, PROBE_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    throw new Error(`Cannot detect the WSL Codex installation. ${result.stderr || result.stdout}`.trim());
  }
  const fields = result.stdout.split("\0");
  if (fields.length !== 4 || fields[3] !== "") throw new Error("Invalid WSL installation detection response.");
  const [selected, canonical, distro] = fields as [string, string, string, string];
  if (!isNativeLinuxPath(selected) || !isNativeLinuxPath(canonical)) return null;
  if (!isStandaloneCodexPath(canonical)) return null;
  const launcherArgs = [...launch.launcherArgs];
  if (!launcherArgs.includes("--distribution") && !launcherArgs.includes("-d")) {
    if (distro.length === 0 || /[\r\n]/.test(distro)) throw new Error("WSL did not identify the selected distribution.");
    launcherArgs.push("--distribution", distro);
  }
  return { command: launch.command,
    args: [...launcherArgs, "--exec", selected, ...launch.codexArgs.slice(1), "update"], shell: false };
}

/** Accepts direct executables and arguments; shell wrappers naturally fail standalone detection. */
function validateLaunch(launch: WslLaunch): WslLaunch | null {
  const executable = launch.codexArgs[0];
  if (executable === undefined || executable.startsWith("-") || launch.codexArgs.includes("app-server")) return null;
  if ([...launch.launcherArgs, ...launch.codexArgs].some(argument => /[\0\r\n]/.test(argument))) return null;
  return launch;
}

/** Rejects Windows interop executables instead of treating their Windows install as Linux standalone. */
function isNativeLinuxPath(value: string): boolean {
  return value.startsWith("/") && !/^\/mnt\/[a-z]\//i.test(value)
    && !/\.(exe|cmd|bat|ps1)$/i.test(value) && !/[\r\n]/.test(value);
}
