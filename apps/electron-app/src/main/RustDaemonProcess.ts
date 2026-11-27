import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

const STARTUP_TIMEOUT_MS = 5_000;
const STOP_TIMEOUT_MS = 1_000;

/** Exit information used to distinguish a graceful stop from a forced one. */
type DaemonExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
  error: Error | null;
};

/** Owns the private stdio connection and lifetime of one daemon process. */
export class RustDaemonProcess {
  /** Child with private input and output pipes and diagnostic stderr. */
  private readonly child: ChildProcessByStdio<Writable, Readable, null>;
  /** Resolves after the child and its pipes have closed, including after a spawn failure. */
  private readonly exited: Promise<DaemonExit>;
  /** The startup health check runs once per process. */
  private readonly ready: Promise<void>;
  /** Shares shutdown between startup cleanup, application close, and updates. */
  private stopPromise: Promise<DaemonExit> | null = null;

  /** Starts an executable at the path chosen by the Electron main process. */
  constructor(executablePath: string) {
    this.child = spawn(executablePath, [], { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });

    let processError: Error | null = null;
    this.child.on("error", (error) => { processError = error; });
    this.child.stdin.on("error", (error) => { processError ??= error; });
    this.child.stdout.on("error", (error) => { processError ??= error; });
    this.exited = new Promise((resolve) => {
      this.child.once("close", (code, signal) => resolve({ code, signal, error: processError }));
    });
    this.ready = this.ping();
  }

  /** Waits for the daemon to acknowledge the startup health check. */
  waitUntilReady(): Promise<void> {
    return this.ready;
  }

  /** Closes the input pipe and waits for the process to stop. */
  dispose(): Promise<DaemonExit> {
    this.stopPromise ??= this.stop();
    return this.stopPromise;
  }

  /** Reads one line from the private response pipe within the startup deadline. */
  private async ping(): Promise<void> {
    const output = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    const response = new Promise<string>((resolve, reject) => {
      output.once("line", resolve);
      output.once("error", reject);
      this.child.stdin.write("ping\n", (error) => {
        if (error) reject(error);
      });
    });
    const prematureExit = this.exited.then(({ code, signal, error }) => {
      throw new Error(`Rust daemon exited before replying (code ${code}, signal ${signal}).`, { cause: error });
    });

    try {
      const line = await waitWithin(Promise.race([response, prematureExit]), STARTUP_TIMEOUT_MS);
      if (line === undefined) throw new Error("Rust daemon did not answer the startup ping in time.");
      if (line !== "pong") throw new Error("Rust daemon returned an invalid startup response.");
    } finally {
      output.close();
      this.child.stdout.resume();
    }
  }

  /** Gives the daemon time to exit on EOF before terminating a stuck child. */
  private async stop(): Promise<DaemonExit> {
    this.child.stdin.end();
    const exit = await waitWithin(this.exited, STOP_TIMEOUT_MS);
    if (exit !== undefined) return exit;

    this.child.kill("SIGKILL");
    const forcedExit = await waitWithin(this.exited, STOP_TIMEOUT_MS);
    if (forcedExit === undefined) throw new Error("Rust daemon did not exit after termination.");
    return forcedExit;
  }
}

/** Bounds an IPC wait and releases its timer when the operation completes first. */
async function waitWithin<T>(operation: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), timeoutMs);
    });
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
