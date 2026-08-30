import type {
  DockerCommandExecutor,
  DockerCommandHandle,
  DockerCommandObserver,
  DockerCommandRequest
} from "./command.js";
import { runChecked, streamChecked } from "./execution.js";
import type {
  DockerContainerListOptions,
  DockerContainerSummary,
  DockerLogOptions,
  DockerLogOutput
} from "./models.js";
import { parseDockerContainers } from "./parsing.js";

/** Manages existing containers in the active Docker context. */
export class DockerContainersClient {
  /** Creates a global container client. */
  constructor(
    private readonly executor: DockerCommandExecutor,
    private readonly command: string
  ) {}

  /** Lists containers using Docker's JSON Lines format. */
  async list(options: DockerContainerListOptions = {}): Promise<DockerContainerSummary[]> {
    const args = ["container", "ls", "--no-trunc", "--format", "json"];

    if (options.all !== false) {
      args.splice(2, 0, "--all");
    }

    const result = await runChecked(this.executor, {
      command: this.command,
      args,
      timeoutMs: 15_000
    });

    return parseDockerContainers(result.stdout);
  }

  /** Starts an existing container. */
  async start(containerId: string): Promise<void> {
    await this.runAction("start", containerId);
  }

  /** Stops a running container without removing it. */
  async stop(containerId: string): Promise<void> {
    await this.runAction("stop", containerId);
  }

  /** Restarts an existing container. */
  async restart(containerId: string): Promise<void> {
    await this.runAction("restart", containerId);
  }

  /** Reads a bounded snapshot of one container's logs. */
  async logs(containerId: string, options: DockerLogOptions = {}): Promise<DockerLogOutput> {
    const request = this.createLogsRequest(containerId, options, false);
    const result = await runChecked(this.executor, request);

    return { stdout: result.stdout, stderr: result.stderr };
  }

  /** Follows one container's logs until stopped or the command exits. */
  followLogs(
    containerId: string,
    options: DockerLogOptions = {},
    observer: DockerCommandObserver = {}
  ): DockerCommandHandle {
    return streamChecked(
      this.executor,
      this.createLogsRequest(containerId, options, true),
      observer
    );
  }

  /** Executes one non-destructive lifecycle action on an existing container. */
  private async runAction(action: "start" | "stop" | "restart", containerId: string): Promise<void> {
    requirePositionalIdentifier(containerId, "containerId");
    await runChecked(this.executor, {
      command: this.command,
      args: ["container", action, containerId],
      timeoutMs: 60_000
    });
  }

  /** Builds one bounded or following container-log request. */
  private createLogsRequest(
    containerId: string,
    options: DockerLogOptions,
    follow: boolean
  ): DockerCommandRequest {
    requirePositionalIdentifier(containerId, "containerId");
    const args = ["container", "logs", ...createLogArguments(options)];

    if (follow) {
      args.push("--follow");
    }

    args.push(containerId);

    return {
      command: this.command,
      args,
      timeoutMs: follow ? undefined : 30_000
    };
  }
}

/** Converts safe log options to individual Docker CLI arguments. */
export function createLogArguments(options: DockerLogOptions): string[] {
  const args: string[] = [];

  if (options.tail !== undefined) {
    if (options.tail !== "all") {
      requireNonNegativeInteger(options.tail, "tail");
    }
    args.push("--tail", String(options.tail));
  }

  if (options.since !== undefined) {
    requireIdentifier(options.since, "since");
    args.push("--since", options.since);
  }

  if (options.timestamps === true) {
    args.push("--timestamps");
  }

  return args;
}

/** Requires a non-empty identifier passed as one CLI argument. */
export function requireIdentifier(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty.`);
  }
}

/** Requires a non-empty positional value that cannot be parsed as another CLI option. */
export function requirePositionalIdentifier(value: string, name: string): void {
  requireIdentifier(value, name);

  if (value.startsWith("-")) {
    throw new Error(`${name} must not start with a hyphen.`);
  }
}

/** Requires a safe non-negative integer CLI option. */
export function requireNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
}
