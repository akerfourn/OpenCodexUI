import { spawn } from "node:child_process";
import type { ProcessLike } from "./types";
import { CodexProcessError } from "./types";

/** Closes the source's stdin first, then bounds shutdown and terminates only its owned process. */
export async function stopCodexProcess(child: ProcessLike): Promise<void> {
  let closed = false;
  const exited = new Promise<void>(resolve => {
    child.once("close", () => {
      closed = true;
      resolve();
    });
  });
  child.stdin.end();
  if (await waitForExit(exited, 1_000)) return;
  if (process.platform === "win32" && child.pid !== undefined) {
    await terminateWindowsTree(child.pid, () => closed);
  } else {
    child.kill("SIGTERM");
  }
  if (await waitForExit(exited, 1_000)) return;
  child.kill("SIGKILL");
  if (!await waitForExit(exited, 1_000)) {
    throw new CodexProcessError("Codex process exit could not be confirmed.");
  }
}

/** Bounds exit waits without leaving a timer behind after an early process close. */
async function waitForExit(exited: Promise<void>, milliseconds: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      exited.then(() => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), milliseconds); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Stops launchers and their descendants by the PID returned by our own spawn, never by name. */
async function terminateWindowsTree(pid: number, hasExited: () => boolean): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true, stdio: "ignore", timeout: 2_000
    });
    killer.once("error", reject);
    killer.once("close", code => {
      if (code === 0 || hasExited()) {
        resolve();
      } else {
        reject(new CodexProcessError(`Unable to terminate the owned Codex process (exit ${code}).`));
      }
    });
  });
}
