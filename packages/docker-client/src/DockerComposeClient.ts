import type {
  DockerCommandExecutor,
  DockerCommandHandle,
  DockerCommandObserver,
  DockerCommandRequest
} from "./command.js";
import {
  createLogArguments,
  requireIdentifier,
  requireNonNegativeInteger,
  requirePositionalIdentifier
} from "./DockerContainersClient.js";
import { runChecked, streamChecked } from "./execution.js";
import type {
  DockerComposeContainer,
  DockerComposeOptions,
  DockerComposeService,
  DockerComposeStartOptions,
  DockerComposeStopOptions,
  DockerComposeUpOptions,
  DockerLogOptions,
  DockerLogOutput
} from "./models.js";
import {
  parseDockerComposeContainers,
  parseDockerComposeServiceNames
} from "./parsing.js";

/** Provides service operations scoped to one existing Compose project. */
export class DockerComposeClient {
  /** Service-oriented facade for this Compose project. */
  readonly services: DockerComposeServicesClient;

  /** Creates one Compose project client. */
  constructor(
    executor: DockerCommandExecutor,
    command: string,
    options: DockerComposeOptions
  ) {
    const context = createComposeContext(command, options);
    this.services = new DockerComposeServicesClient(executor, context);
  }
}

/** Manages configured services and their runtime containers. */
export class DockerComposeServicesClient {
  /** Creates a service client bound to one Compose project. */
  constructor(
    private readonly executor: DockerCommandExecutor,
    private readonly context: DockerComposeContext
  ) {}

  /** Lists every configured service, including services with no container yet. */
  async list(): Promise<DockerComposeService[]> {
    const [serviceNames, containers] = await Promise.all([
      this.listConfiguredNames(),
      this.listContainers()
    ]);

    return serviceNames.map((name) => ({
      name,
      containers: containers.filter((container) => container.service === name)
    }));
  }

  /** Lists service names resolved from the effective Compose configuration. */
  async listConfiguredNames(): Promise<string[]> {
    const result = await runChecked(this.executor, this.request(["config", "--services"]));
    return parseDockerComposeServiceNames(result.stdout);
  }

  /** Lists existing Compose containers, including stopped instances. */
  async listContainers(): Promise<DockerComposeContainer[]> {
    const result = await runChecked(
      this.executor,
      this.request(["ps", "--all", "--no-trunc", "--format", "json"])
    );
    return parseDockerComposeContainers(result.stdout);
  }

  /** Starts existing containers without creating missing ones. */
  async start(
    serviceNames: readonly string[] = [],
    options: DockerComposeStartOptions = {}
  ): Promise<void> {
    const args = ["start"];
    appendWaitArguments(args, options);
    args.push(...validateServiceNames(serviceNames));
    await runChecked(this.executor, this.request(args, 60_000));
  }

  /** Creates missing containers when needed and starts selected services. */
  async up(
    serviceNames: readonly string[] = [],
    options: DockerComposeUpOptions = {}
  ): Promise<void> {
    const args = ["up", "--detach"];

    if (options.build === true) {
      args.push("--build");
    }

    appendWaitArguments(args, options);
    args.push(...validateServiceNames(serviceNames));
    await runChecked(this.executor, this.request(args, 300_000));
  }

  /** Stops selected services without removing their containers. */
  async stop(
    serviceNames: readonly string[] = [],
    options: DockerComposeStopOptions = {}
  ): Promise<void> {
    const args = ["stop"];

    if (options.timeoutSeconds !== undefined) {
      requireNonNegativeInteger(options.timeoutSeconds, "timeoutSeconds");
      args.push("--timeout", String(options.timeoutSeconds));
    }

    args.push(...validateServiceNames(serviceNames));
    await runChecked(this.executor, this.request(args, 120_000));
  }

  /** Restarts selected services without rebuilding their images. */
  async restart(serviceNames: readonly string[] = []): Promise<void> {
    await runChecked(
      this.executor,
      this.request(["restart", ...validateServiceNames(serviceNames)], 120_000)
    );
  }

  /** Reads a bounded snapshot of Compose logs. */
  async logs(
    serviceNames: readonly string[] = [],
    options: DockerLogOptions = {}
  ): Promise<DockerLogOutput> {
    const result = await runChecked(
      this.executor,
      this.createLogsRequest(serviceNames, options, false)
    );
    return { stdout: result.stdout, stderr: result.stderr };
  }

  /** Follows Compose logs until stopped or the command exits. */
  followLogs(
    serviceNames: readonly string[] = [],
    options: DockerLogOptions = {},
    observer: DockerCommandObserver = {}
  ): DockerCommandHandle {
    return streamChecked(
      this.executor,
      this.createLogsRequest(serviceNames, options, true),
      observer
    );
  }

  /** Builds one Compose command request using the project context. */
  private request(args: readonly string[], timeoutMs = 30_000): DockerCommandRequest {
    return {
      command: this.context.command,
      args: [...this.context.prefixArgs, ...args],
      cwd: this.context.projectPath,
      timeoutMs
    };
  }

  /** Builds one bounded or following Compose log request. */
  private createLogsRequest(
    serviceNames: readonly string[],
    options: DockerLogOptions,
    follow: boolean
  ): DockerCommandRequest {
    const args = ["logs", "--no-color", ...createLogArguments(options)];

    if (follow) {
      args.push("--follow");
    }

    args.push(...validateServiceNames(serviceNames));
    const request = this.request(args);
    return follow ? { ...request, timeoutMs: undefined } : request;
  }
}

/** Immutable CLI context for one Compose project. */
interface DockerComposeContext {
  command: string;
  projectPath: string;
  prefixArgs: string[];
}

/** Validates Compose selection and creates reusable global arguments. */
function createComposeContext(
  command: string,
  options: DockerComposeOptions
): DockerComposeContext {
  requireIdentifier(options.projectPath, "projectPath");
  const prefixArgs = ["compose"];

  for (const file of options.files ?? []) {
    requireIdentifier(file, "Compose file");
    prefixArgs.push("--file", file);
  }

  if (options.projectName !== undefined) {
    requireIdentifier(options.projectName, "projectName");
    prefixArgs.push("--project-name", options.projectName);
  }

  for (const profile of options.profiles ?? []) {
    requireIdentifier(profile, "Compose profile");
    prefixArgs.push("--profile", profile);
  }

  return { command, projectPath: options.projectPath, prefixArgs };
}

/** Validates service names while preserving their order. */
function validateServiceNames(serviceNames: readonly string[]): string[] {
  return serviceNames.map((serviceName) => {
    requirePositionalIdentifier(serviceName, "serviceName");
    return serviceName;
  });
}

/** Adds supported Compose health-wait options. */
function appendWaitArguments(
  args: string[],
  options: DockerComposeStartOptions
): void {
  if (options.waitTimeoutSeconds !== undefined) {
    requireNonNegativeInteger(options.waitTimeoutSeconds, "waitTimeoutSeconds");

    if (options.wait !== true) {
      throw new Error("waitTimeoutSeconds requires wait to be enabled.");
    }
  }

  if (options.wait === true) {
    args.push("--wait");
  }

  if (options.waitTimeoutSeconds !== undefined) {
    args.push("--wait-timeout", String(options.waitTimeoutSeconds));
  }
}
