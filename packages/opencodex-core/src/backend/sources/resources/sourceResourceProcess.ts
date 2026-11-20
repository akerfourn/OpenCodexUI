import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { resolveCodexCommand, type ProcessFactory } from "@open-codex-ui/codex-rpc";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import type { SourceResourceSettings } from "@open-codex-ui/opencodex-protocol";
import { requireSourceResourceSupport } from "./resourceCapabilities.js";
import { windowsCommandLine, windowsResourceLaunch } from "./windowsResourceLauncher.js";

/** Launches a POSIX tree with inherited niceness and, on Linux, a collective cgroup CPU quota. */
export function posixResourceCommand(
  command: string,
  args: string[],
  resources: SourceResourceSettings,
  cpuCount: number = availableParallelism()
): { command: string; args: string[] } {
  let executable = command;
  let argumentsList = [...args];
  if (resources.priority !== "normal") {
    let increment = "10";
    if (resources.priority === "idle") increment = "19";
    argumentsList = ["-n", increment, executable, ...argumentsList];
    executable = "/usr/bin/nice";
  }
  if (resources.cpuLimitPercent !== null) {
    const groupProperties: string[] = [];
    // Niceness alone cannot lower an isolated cgroup's share relative to sibling groups.
    if (resources.priority === "low") groupProperties.push("--property=CPUWeight=25");
    if (resources.priority === "idle") groupProperties.push("--property=CPUWeight=1");
    argumentsList = ["--user", "--scope", "--quiet", "--collect", "--expand-environment=no",
      ...groupProperties, `--property=CPUQuota=${resources.cpuLimitPercent * cpuCount}%`, "--", executable, ...argumentsList];
    executable = "systemd-run";
  }
  return { command: executable, args: argumentsList };
}

/** Keeps default launches unchanged; a configured source must obtain enforcement before Codex starts. */
export async function createSourceResourceProcessFactory(source: CachedSource): Promise<ProcessFactory | undefined> {
  if (source.kind !== "local") return undefined;
  const resources = source.settings.resources;
  await requireSourceResourceSupport(source.kind, resources);
  if (resources === undefined || (resources.priority === "normal" && resources.cpuLimitPercent === null)) return undefined;
  const policy = { ...resources };
  return (command, args) => {
    const resolved = resolveCodexCommand(command, args);
    if (process.platform === "win32") {
      const launch = windowsResourceLaunch(windowsCommandLine(resolved.command, resolved.args, resolved.shell),
        policy.priority, policy.cpuLimitPercent);
      return spawn(launch.command, launch.args, { ...launch.options, stdio: ["pipe", "pipe", "pipe"] });
    }
    const launch = posixResourceCommand(resolved.command, resolved.args, policy);
    return spawn(launch.command, launch.args, { stdio: ["pipe", "pipe", "pipe"] });
  };
}
