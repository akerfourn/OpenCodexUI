import { spawn } from "node:child_process";

import { resolveCodexCommand } from "./process";
import { DEFAULT_CODEX_REQUEST_TIMEOUT_MS, type ProcessFactory, type ProcessLike } from "./types";

/** Places the Rust stdio relay inside the source's existing launch policy. */
export function createRustCodexProcessFactory(
  daemonPath: string,
  launch: ProcessFactory = spawnHiddenProcess,
  requestTimeoutMs = DEFAULT_CODEX_REQUEST_TIMEOUT_MS
): ProcessFactory {
  return (command, args) => {
    const resolved = resolveCodexCommand(command, args);
    return launch(daemonPath, [
      "--codex-stdio",
      String(requestTimeoutMs),
      resolved.command,
      ...resolved.args
    ]);
  };
}

/** Opens private pipes for the relay without creating a desktop console window. */
function spawnHiddenProcess(command: string, args: string[]): ProcessLike {
  return spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
}
