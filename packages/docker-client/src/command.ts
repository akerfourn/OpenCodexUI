/** Describes one process invocation without relying on a shell. */
export interface DockerCommandRequest {
  /** Executable to invoke. */
  command: string;
  /** Individual arguments passed to the executable. */
  args: readonly string[];
  /** Optional working directory. */
  cwd?: string;
  /** Optional environment overrides. Undefined values remove inherited entries. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Optional execution timeout. Omit it for an unbounded streaming command. */
  timeoutMs?: number;
  /** Maximum number of bytes retained per output stream. */
  outputBytesCap?: number;
}

/** Captures the completed process result. */
export interface DockerCommandResult {
  /** Process exit code, or null when terminated by a signal. */
  exitCode: number | null;
  /** Signal that terminated the process, when applicable. */
  signal: NodeJS.Signals | null;
  /** Captured standard output. */
  stdout: string;
  /** Captured standard error. */
  stderr: string;
  /** Whether retained standard output exceeded its configured cap. */
  stdoutTruncated: boolean;
  /** Whether retained standard error exceeded its configured cap. */
  stderrTruncated: boolean;
}

/** Receives output emitted by a streaming Docker command. */
export interface DockerCommandObserver {
  /** Receives one standard-output fragment. */
  onStdout?(chunk: string): void;
  /** Receives one standard-error fragment. */
  onStderr?(chunk: string): void;
}

/** Controls one streaming Docker command. */
export interface DockerCommandHandle {
  /** Resolves when the process exits and rejects when it cannot be started. */
  readonly completion: Promise<DockerCommandResult>;
  /** Stops following the command without affecting the managed Docker resource. */
  stop(): void;
}

/** Executes Docker CLI commands locally or through a future remote transport. */
export interface DockerCommandExecutor {
  /** Runs a bounded command and captures its output. */
  run(request: DockerCommandRequest): Promise<DockerCommandResult>;
  /** Starts a command whose output may remain open, such as log following. */
  stream(
    request: DockerCommandRequest,
    observer?: DockerCommandObserver
  ): DockerCommandHandle;
}
