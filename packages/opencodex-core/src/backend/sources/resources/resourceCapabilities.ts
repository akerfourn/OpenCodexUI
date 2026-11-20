import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SourceResourceCapabilities, SourceResourceSettings } from "@open-codex-ui/opencodex-protocol";
import { validateSourceResources } from "@open-codex-ui/opencodex-protocol";
import { windowsResourceLaunch } from "./windowsResourceLauncher.js";

const execute = promisify(execFile);

/** Verifies the effective v2 quota inside the probe scope, rather than trusting accepted unit properties. */
const quotaProbe = `const fs = require('node:fs');
const path = require('node:path');
const line = fs.readFileSync('/proc/self/cgroup', 'utf8').split('\\n').find(value => value.startsWith('0::'));
if (line === undefined || line.includes('..')) process.exit(1);
const value = fs.readFileSync(path.join('/sys/fs/cgroup', line.slice(3), 'cpu.max'), 'utf8').trim().split(/\\s+/);
if (!(Number(value[0]) > 0) || Number(value[0]) !== Number(value[1])) process.exit(1);`;

/** Probe output is discarded; unavailable optional OS facilities are capabilities, not application errors. */
type ResourceProbe = (command: string, args: string[], env?: NodeJS.ProcessEnv) => Promise<void>;

/** Bounds host probes and never invokes a shell or reads PowerShell profiles. */
async function probeCommand(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  await execute(command, args, { env, timeout: 5_000, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 64 * 1024 });
}

/** Tests enforcement, including a working user manager and CPU controller on Linux. */
export async function detectSourceResourceCapabilities(
  platform: NodeJS.Platform = process.platform,
  probe: ResourceProbe = probeCommand
): Promise<SourceResourceCapabilities> {
  if (platform === "win32") {
    const launch = windowsResourceLaunch(null);
    try {
      await probe(launch.command, launch.args, launch.options.env);
      return { priority: true, cpuLimit: true, cpuLimitUnavailableReason: null };
    } catch {
      return { priority: false, cpuLimit: false, cpuLimitUnavailableReason: "windowsUnavailable" };
    }
  }
  if (platform !== "linux" && platform !== "darwin") {
    return { priority: false, cpuLimit: false, cpuLimitUnavailableReason: "platformUnsupported" };
  }
  const [priority, cpuLimit] = await Promise.allSettled([
    probe("/usr/bin/nice", ["-n", "0", "/usr/bin/true"]),
    platform === "linux"
      ? probe("systemd-run", ["--user", "--scope", "--quiet", "--collect", "--expand-environment=no",
        "--property=CPUQuota=100%", "--", process.execPath, "-e", quotaProbe], { ...process.env, ELECTRON_RUN_AS_NODE: "1" })
      : Promise.reject(new Error("No native CPU group quota adapter on this platform."))
  ]);
  let reason: SourceResourceCapabilities["cpuLimitUnavailableReason"] = null;
  if (cpuLimit.status === "rejected") reason = "platformUnsupported";
  if (cpuLimit.status === "rejected" && platform === "linux") reason = "systemdUnavailable";
  return { priority: priority.status === "fulfilled", cpuLimit: cpuLimit.status === "fulfilled", cpuLimitUnavailableReason: reason };
}

/** Lazily caches optional host discovery; opening Home or reading sources never spawns probes. */
let capabilities: Promise<SourceResourceCapabilities> | undefined;

/** Shares a single host probe between resource settings and concurrent source starts. */
export function readSourceResourceCapabilities(): Promise<SourceResourceCapabilities> {
  capabilities ??= detectSourceResourceCapabilities();
  return capabilities;
}

/** Validates before persistence and before launch, preventing silently unenforced policies. */
export async function requireSourceResourceSupport(kind: string, resources: SourceResourceSettings | undefined): Promise<void> {
  if (resources === undefined) return;
  if (kind !== "local") throw new Error("Resource controls are supported only for local sources.");
  validateSourceResources(resources);
  if (resources.priority === "normal" && resources.cpuLimitPercent === null) return;
  const supported = await readSourceResourceCapabilities();
  if (resources.priority !== "normal" && !supported.priority) {
    throw new Error("Process priority control is unavailable on this host. Reset the source resource settings.");
  }
  if (resources.cpuLimitPercent !== null && !supported.cpuLimit) {
    throw new Error("CPU limits are unavailable on this host. Reset the source resource settings or restore the required OS facilities.");
  }
}
