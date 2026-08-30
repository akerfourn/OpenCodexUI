import type { CodexAppServerClient, Disposable } from "@open-codex-ui/codex-rpc";
import type {
  DockerCommandExecutor,
  DockerCommandHandle,
  DockerCommandObserver,
  DockerCommandRequest,
  DockerCommandResult
} from "@open-codex-ui/docker-client";

const DEFAULT_OUTPUT_BYTES_CAP = 2_000_000;
const DEFAULT_TIMEOUT_MS = 30_000;
let nextProcessHandle = 0;

/** Minimal source client surface required to spawn a Docker process. */
export type SourceDockerProcessClient = Pick<CodexAppServerClient, "request" | "onNotification">;

/** Executes Docker through the source-owned app-server process API. */
export class SourceDockerCommandExecutor implements DockerCommandExecutor {
  /** Creates an executor bound to one source app-server client. */
  constructor(private readonly client: SourceDockerProcessClient) {}

  /** Runs a bounded Docker command and collects its process result. */
  async run(request: DockerCommandRequest): Promise<DockerCommandResult> {
    return await this.start(request).completion;
  }

  /** Streaming Docker commands are intentionally not needed by Compose UI actions. */
  stream(_request: DockerCommandRequest, _observer?: DockerCommandObserver): DockerCommandHandle {
    throw new Error("Streaming Docker commands are not supported by the source executor.");
  }

  /** Starts one source-owned process and waits for its exit notification. */
  private start(request: DockerCommandRequest): DockerCommandHandle {
    const processHandle = this.createProcessHandle();
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const outputBytesCap = request.outputBytesCap ?? DEFAULT_OUTPUT_BYTES_CAP;
    requireTimeout(timeoutMs);
    requireOutputBytesCap(outputBytesCap);

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let didFinish = false;
    let timeout: NodeJS.Timeout | undefined;
    let notificationSubscription: Disposable | undefined;
    let resolveCompletion!: (result: DockerCommandResult) => void;
    let rejectCompletion!: (error: Error) => void;

    const completion = new Promise<DockerCommandResult>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });

    const finish = (result: DockerCommandResult | Error): void => {
      if (didFinish) {
        return;
      }

      didFinish = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      notificationSubscription?.dispose();

      if (result instanceof Error) {
        rejectCompletion(result);
      } else {
        resolveCompletion(result);
      }
    };

    notificationSubscription = this.client.onNotification((notification) => {
      if (notification.method === "process/outputDelta") {
        const params = readProcessOutputDelta(notification.params);

        if (params === null || params.processHandle !== processHandle) {
          return;
        }

        const output = decodeBase64(params.deltaBase64);
        if (params.stream === "stdout") {
          stdout += output;
          stdoutTruncated ||= params.capReached;
        } else {
          stderr += output;
          stderrTruncated ||= params.capReached;
        }
        return;
      }

      if (notification.method !== "process/exited") {
        return;
      }

      const params = readProcessExited(notification.params);
      if (params === null || params.processHandle !== processHandle) {
        return;
      }

      finish({
        exitCode: params.exitCode,
        signal: null,
        stdout: params.stdout.length > 0 ? params.stdout : stdout,
        stderr: params.stderr.length > 0 ? params.stderr : stderr,
        stdoutTruncated: stdoutTruncated || params.stdoutCapReached,
        stderrTruncated: stderrTruncated || params.stderrCapReached
      });
    });

    timeout = setTimeout(() => {
      void this.kill(processHandle);
      finish(new Error(`Docker command timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    const spawnParams: Record<string, unknown> = {
      command: [request.command, ...request.args],
      processHandle,
      cwd: request.cwd,
      streamStdoutStderr: false,
      outputBytesCap,
      timeoutMs
    };

    if (request.env !== undefined) {
      spawnParams.env = mapEnvironment(request.env);
    }

    void this.client.request("process/spawn", spawnParams).catch((error: unknown) => {
      finish(error instanceof Error ? error : new Error(String(error)));
    });

    return {
      completion,
      stop: () => {
        void this.kill(processHandle);
        finish(new Error("Docker command stopped."));
      }
    };
  }

  /** Generates a connection-scoped process handle that is safe to reuse after exit. */
  private createProcessHandle(): string {
    nextProcessHandle += 1;
    return `open-codex-docker-${nextProcessHandle}`;
  }

  /** Requests termination of one spawned source process. */
  private async kill(processHandle: string): Promise<void> {
    try {
      await this.client.request("process/kill", { processHandle });
    } catch {
      // The process may have exited before the kill request reached the source.
    }
  }
}

/** Validates the finite timeout passed to the source process API. */
function requireTimeout(timeoutMs: number): void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("Docker command timeout must be a positive integer.");
  }
}

/** Validates the finite output cap accepted by the source process API. */
function requireOutputBytesCap(outputBytesCap: number): void {
  if (!Number.isSafeInteger(outputBytesCap) || outputBytesCap < 0) {
    throw new Error("Docker command outputBytesCap must be a non-negative integer.");
  }
}

/** Converts Docker environment overrides to the app-server's nullable shape. */
function mapEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(environment).map(([name, value]) => [name, value ?? null])
  );
}

/** Parses one process output notification without trusting transport payloads. */
function readProcessOutputDelta(value: unknown): {
  processHandle: string;
  stream: "stdout" | "stderr";
  deltaBase64: string;
  capReached: boolean;
} | null {
  if (!isRecord(value)
    || typeof value.processHandle !== "string"
    || (value.stream !== "stdout" && value.stream !== "stderr")
    || typeof value.deltaBase64 !== "string"
    || typeof value.capReached !== "boolean") {
    return null;
  }

  return {
    processHandle: value.processHandle,
    stream: value.stream,
    deltaBase64: value.deltaBase64,
    capReached: value.capReached
  };
}

/** Parses one process exit notification without trusting transport payloads. */
function readProcessExited(value: unknown): {
  processHandle: string;
  exitCode: number;
  stdout: string;
  stdoutCapReached: boolean;
  stderr: string;
  stderrCapReached: boolean;
} | null {
  if (!isRecord(value)
    || typeof value.processHandle !== "string"
    || typeof value.exitCode !== "number"
    || typeof value.stdout !== "string"
    || typeof value.stdoutCapReached !== "boolean"
    || typeof value.stderr !== "string"
    || typeof value.stderrCapReached !== "boolean") {
    return null;
  }

  return {
    processHandle: value.processHandle,
    exitCode: value.exitCode,
    stdout: value.stdout,
    stdoutCapReached: value.stdoutCapReached,
    stderr: value.stderr,
    stderrCapReached: value.stderrCapReached
  };
}

/** Decodes one streamed output fragment emitted by process/spawn. */
function decodeBase64(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

/** Checks whether a transport payload is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
