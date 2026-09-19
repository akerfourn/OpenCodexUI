import { execFile } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const ELEVATION_HELPERS = ["gksudo", "kdesudo", "pkexec", "beesu"];
// Keep electron-updater's dependency-repair fallback, with the filename as data.
const INSTALL_SCRIPT = 'dpkg -i "$1" || apt-get install -f -y';

/** Waits asynchronously for the existing Debian installer and its privilege prompt. */
export async function installDebPackage(file: string, applicationName: string): Promise<void> {
  const { helper, executable } = await findElevationHelper();
  const command = ["/bin/bash", "-c", INSTALL_SCRIPT, "opencodex-update", file];
  let args: string[];
  if (helper === "pkexec") {
    args = ["--disable-internal-agent", ...command];
  } else {
    const shellCommand = command.map(quoteShellArgument).join(" ");
    if (helper === "kdesudo") {
      args = ["--comment", `${applicationName} would like to update`, "-c", shellCommand];
    } else if (helper === "gksudo") {
      args = ["--message", `${applicationName} would like to update`, shellCommand];
    } else {
      args = [shellCommand];
    }
  }
  // No timeout: interrupting a package manager could leave an incomplete installation.
  await executeFile(executable, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
}

/** Resolves the same elevation helpers supported by electron-updater, without blocking. */
async function findElevationHelper(): Promise<{ helper: string; executable: string }> {
  for (const helper of ELEVATION_HELPERS) {
    try {
      const result = await executeFile("which", [helper], { encoding: "utf8" });
      const executable = result.stdout.trim();
      if (executable.length > 0) return { helper, executable };
    } catch (error) {
      const code = (error as { code?: string | number }).code;
      if (code !== "ENOENT" && code !== 1) throw error;
    }
  }
  throw new Error("No supported privilege helper is available to install the update.");
}

/** Protects paths passed through legacy helpers that accept a shell command string. */
function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
