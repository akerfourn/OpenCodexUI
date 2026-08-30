import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

import type {
  DockerCommandExecutor,
  DockerCommandHandle,
  DockerCommandObserver,
  DockerCommandRequest,
  DockerCommandResult
} from "./command.js";

const DEFAULT_OUTPUT_BYTES_CAP = 2_000_000;

/** Options applied to every command executed on the local host. */
export interface LocalDockerCommandExecutorOptions {
  /** Environment inherited by spawned commands. Defaults to the current process environment. */
  env?: NodeJS.ProcessEnv;
}

/** Runs Docker without a shell on Windows, macOS, and Linux. */
export class LocalDockerCommandExecutor implements DockerCommandExecutor {
  /** Base environment inherited by child processes. */
  private readonly env: NodeJS.ProcessEnv;

  /** Creates a local command executor. */
  constructor(options: LocalDockerCommandExecutorOptions = {}) {
    this.env = { ...(options.env ?? process.env) };
  }

  /** Runs a bounded command and captures its output. */
  async run(request: DockerCommandRequest): Promise<DockerCommandResult> {
    return await this.start(request).completion;
  }

  /** Starts a long-lived command and forwards output fragments. */
  stream(
    request: DockerCommandRequest,
    observer: DockerCommandObserver = {}
  ): DockerCommandHandle {
    return this.start(request, observer);
  }

  /** Starts one child process and manages capture, timeout, and cancellation. */
  private start(
    request: DockerCommandRequest,
    observer: DockerCommandObserver = {}
  ): DockerCommandHandle {
    const child = spawn(request.command, [...request.args], {
      cwd: request.cwd,
      env: mergeEnvironment(this.env, request.env),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const stdout = new BoundedOutput(request.outputBytesCap ?? DEFAULT_OUTPUT_BYTES_CAP);
    const stderr = new BoundedOutput(request.outputBytesCap ?? DEFAULT_OUTPUT_BYTES_CAP);
    let timeout: NodeJS.Timeout | undefined;
    let didTimeout = false;

    child.stdout.on("data", (chunk: Buffer) => {
      stdout.append(chunk);
      observer.onStdout?.(chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.append(chunk);
      observer.onStderr?.(chunk.toString("utf8"));
    });

    if (request.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        didTimeout = true;
        child.kill();
      }, request.timeoutMs);
    }

    const completion = observeCompletion(child, stdout, stderr).then((result) => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }

      if (didTimeout) {
        throw new Error(`Docker command timed out after ${request.timeoutMs} ms.`);
      }

      return result;
    }, (error: unknown) => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }

      throw error;
    });

    return {
      completion,
      stop: () => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill();
        }
      }
    };
  }
}

/** Retains a UTF-8 process stream up to a fixed byte count. */
class BoundedOutput {
  /** Captured buffers within the configured cap. */
  private readonly chunks: Buffer[] = [];
  /** Number of retained bytes. */
  private retainedBytes = 0;
  /** Whether at least one byte was discarded. */
  private didTruncate = false;

  /** Creates a bounded output accumulator. */
  constructor(private readonly bytesCap: number) {
    if (!Number.isSafeInteger(bytesCap) || bytesCap < 0) {
      throw new Error("Docker outputBytesCap must be a non-negative integer.");
    }
  }

  /** Appends as much of one output buffer as the cap permits. */
  append(chunk: Buffer): void {
    const remainingBytes = this.bytesCap - this.retainedBytes;

    if (remainingBytes <= 0) {
      this.didTruncate = this.didTruncate || chunk.length > 0;
      return;
    }

    const retainedChunk = chunk.subarray(0, remainingBytes);
    this.chunks.push(retainedChunk);
    this.retainedBytes += retainedChunk.length;
    this.didTruncate = this.didTruncate || retainedChunk.length < chunk.length;
  }

  /** Returns captured UTF-8 text. */
  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }

  /** Returns whether output exceeded the configured cap. */
  truncated(): boolean {
    return this.didTruncate;
  }
}

/** Resolves the final output of one spawned process. */
function observeCompletion(
  child: ChildProcessByStdio<null, Readable, Readable>,
  stdout: BoundedOutput,
  stderr: BoundedOutput
): Promise<DockerCommandResult> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stdout: stdout.text(),
        stderr: stderr.text(),
        stdoutTruncated: stdout.truncated(),
        stderrTruncated: stderr.truncated()
      });
    });
  });
}

/** Applies explicit environment overrides without leaking undefined values to spawn. */
function mergeEnvironment(
  baseEnvironment: NodeJS.ProcessEnv,
  overrides: Readonly<Record<string, string | undefined>> | undefined
): NodeJS.ProcessEnv {
  const environment = { ...baseEnvironment };

  for (const [name, value] of Object.entries(overrides ?? {})) {
    if (value === undefined) {
      delete environment[name];
    } else {
      environment[name] = value;
    }
  }

  return environment;
}
