import {
  DockerClient,
  DockerCommandError,
  DockerResponseError,
  type DockerComposeContainer as ClientDockerComposeContainer,
  type DockerComposeClient,
  type DockerComposeService as ClientDockerComposeService
} from "@open-codex-ui/docker-client";
import type {
  OpenCodexDockerComposeContainer,
  OpenCodexDockerComposeLogs,
  OpenCodexDockerComposeService,
  OpenCodexDockerComposeServiceState,
  OpenCodexDockerComposeSnapshot
} from "@open-codex-ui/opencodex-protocol";

import {
  SourceDockerCommandExecutor,
  type SourceDockerProcessClient
} from "./SourceDockerCommandExecutor.js";
import type { ClientPort } from "../runtime/runtimePorts.js";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";

const COMPOSE_FILE_NAMES = [
  "compose.yaml",
  "compose.yml",
  "docker-compose.yaml",
  "docker-compose.yml"
] as const;
const DEFAULT_LOG_TAIL = 200;
const MAX_LOG_TAIL = 2_000;
const MAX_LOG_CHARACTERS_PER_STREAM = 250_000;

/** Dependencies used by source-owned Docker Compose operations. */
export type DockerComposeServiceOptions = {
  /** Resolves the app-server that owns the requested source filesystem. */
  clients: Pick<ClientPort, "ensureClient">;
};

/** Lists and controls Docker Compose services in a source-owned project. */
export class DockerComposeService {
  /** Creates a Compose service over source-scoped app-server clients. */
  constructor(private readonly options: DockerComposeServiceOptions) {}

  /** Reads a bounded Compose snapshot without invoking Docker when no file exists. */
  async readSnapshot(projectPath: string, sourceId: string): Promise<OpenCodexDockerComposeSnapshot> {
    requireProjectInput(projectPath, sourceId);
    let client: SourceDockerFilesystemClient;

    try {
      client = await this.options.clients.ensureClient(sourceId);
    } catch (error: unknown) {
      return createErrorSnapshot(projectPath, sourceId, null, "snapshot", error);
    }

    let composeFile: string | null;
    try {
      composeFile = await findComposeFile(client, projectPath);
    } catch (error: unknown) {
      return createErrorSnapshot(projectPath, sourceId, null, "snapshot", error);
    }

    if (composeFile === null) {
      return {
        projectPath,
        sourceId,
        composeFile: null,
        errorMessage: null,
        services: []
      };
    }

    try {
      const services = await createComposeClient(client, projectPath).services.list();
      return {
        projectPath,
        sourceId,
        composeFile,
        errorMessage: null,
        services: services.map(mapComposeService)
      };
    } catch (error: unknown) {
      return createErrorSnapshot(projectPath, sourceId, composeFile, "snapshot", error);
    }
  }

  /** Creates or starts one configured Compose service. */
  async up(projectPath: string, sourceId: string, serviceName: string): Promise<{ ok: true }> {
    await this.runServiceAction(projectPath, sourceId, serviceName, "up");
    return { ok: true };
  }

  /** Stops one configured Compose service without removing its container. */
  async stop(projectPath: string, sourceId: string, serviceName: string): Promise<{ ok: true }> {
    await this.runServiceAction(projectPath, sourceId, serviceName, "stop");
    return { ok: true };
  }

  /** Restarts one configured Compose service. */
  async restart(projectPath: string, sourceId: string, serviceName: string): Promise<{ ok: true }> {
    await this.runServiceAction(projectPath, sourceId, serviceName, "restart");
    return { ok: true };
  }

  /** Reads a bounded tail of one Compose service's logs. */
  async readLogs(
    projectPath: string,
    sourceId: string,
    serviceName: string,
    tail = DEFAULT_LOG_TAIL
  ): Promise<OpenCodexDockerComposeLogs> {
    requireProjectInput(projectPath, sourceId);
    requireServiceName(serviceName);
    requireLogTail(tail);
    try {
      const client = await this.requireComposeClient(projectPath, sourceId);
      const logs = await client.services.logs([serviceName], { tail });
      const stdout = boundText(logs.stdout, MAX_LOG_CHARACTERS_PER_STREAM);
      const stderr = boundText(logs.stderr, MAX_LOG_CHARACTERS_PER_STREAM);

      return {
        serviceName,
        stdout: stdout.text,
        stderr: stderr.text,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated
      };
    } catch (error: unknown) {
      throw createSafeComposeError("logs", error);
    }
  }

  /** Executes one action after confirming the source-owned Compose file exists. */
  private async runServiceAction(
    projectPath: string,
    sourceId: string,
    serviceName: string,
    action: "up" | "stop" | "restart"
  ): Promise<void> {
    requireProjectInput(projectPath, sourceId);
    requireServiceName(serviceName);
    try {
      const client = await this.requireComposeClient(projectPath, sourceId);

      if (action === "up") {
        await client.services.up([serviceName]);
      } else if (action === "stop") {
        await client.services.stop([serviceName]);
      } else {
        await client.services.restart([serviceName]);
      }
    } catch (error: unknown) {
      throw createSafeComposeError(action, error);
    }
  }

  /** Resolves a source client and rejects when the project has no Compose file. */
  private async requireComposeClient(
    projectPath: string,
    sourceId: string
  ): Promise<DockerComposeClient> {
    const sourceClient = await this.options.clients.ensureClient(sourceId);
    const composeFile = await findComposeFile(sourceClient, projectPath);

    if (composeFile === null) {
      throw new Error("No Docker Compose file found.");
    }

    return createComposeClient(sourceClient, projectPath);
  }
}

/** Maps low-level Compose data to the stable renderer protocol. */
export function mapComposeService(service: ClientDockerComposeService): OpenCodexDockerComposeService {
  return {
    name: service.name,
    state: aggregateComposeServiceState(service.containers),
    containers: service.containers.map(mapComposeContainer)
  };
}

/** Computes one finite state from all currently visible service containers. */
export function aggregateComposeServiceState(
  containers: readonly ClientDockerComposeContainer[]
): OpenCodexDockerComposeServiceState {
  if (containers.length === 0) {
    return "missing";
  }

  const runningContainers = containers.filter(isRunningContainer);
  const stoppedContainers = containers.filter(isStoppedContainer);

  if (runningContainers.some(isUnhealthyRunningContainer)) {
    return "unhealthy";
  }

  if (stoppedContainers.length === containers.length) {
    return "stopped";
  }

  const hasUnknownState = containers.some((container) => {
    return !isRunningContainer(container) && !isStoppedContainer(container);
  });

  if (hasUnknownState) {
    return runningContainers.length > 0 || stoppedContainers.length > 0 ? "partial" : "unknown";
  }

  if (runningContainers.length === containers.length && runningContainers.every(hasHealthyRuntime)) {
    return "running";
  }

  return "partial";
}

/** Maps one low-level container while deliberately excluding labels and mounts. */
function mapComposeContainer(container: ClientDockerComposeContainer): OpenCodexDockerComposeContainer {
  return {
    name: container.name,
    state: container.state,
    health: container.health,
    exitCode: container.exitCode,
    publishers: container.publishers.map((publisher) => ({
      url: publisher.url,
      targetPort: publisher.targetPort,
      publishedPort: publisher.publishedPort,
      protocol: publisher.protocol
    }))
  };
}

/** Creates a Docker client whose process calls stay inside one source. */
function createComposeClient(sourceClient: SourceDockerProcessClient, projectPath: string): DockerComposeClient {
  return new DockerClient({
    executor: new SourceDockerCommandExecutor(sourceClient)
  }).compose({ projectPath });
}

/** Finds the first standard Compose file through the source filesystem API. */
async function findComposeFile(
  client: SourceDockerFilesystemClient,
  projectPath: string
): Promise<string | null> {
  for (const fileName of COMPOSE_FILE_NAMES) {
    try {
      const metadata = await client.getMetadata(joinSourcePath(projectPath, fileName));
      if (metadata.isFile) {
        return fileName;
      }
    } catch (error: unknown) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }
  }

  return null;
}

/** Joins a source-local project path and filename without changing path style. */
function joinSourcePath(projectPath: string, fileName: string): string {
  if (projectPath.endsWith("/") || projectPath.endsWith("\\")) {
    return `${projectPath}${fileName}`;
  }

  return `${projectPath}${projectPath.includes("\\") && !projectPath.includes("/") ? "\\" : "/"}${fileName}`;
}

/** Checks whether one source filesystem failure means a path is absent. */
function isMissingPathError(error: unknown): boolean {
  if (hasMissingPathCode(error)) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  return [
    "enoent",
    "no such file",
    "does not exist",
    "not exist",
    "path not found",
    "cannot find the file specified"
  ]
    .some((marker) => normalizedMessage.includes(marker));
}

/** Recognizes common filesystem error codes from local and remote transports. */
function hasMissingPathCode(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  if (isMissingPathCode(error.code)) {
    return true;
  }

  return isRecord(error.data) && isMissingPathCode(error.data.code);
}

/** Checks a filesystem code without depending on one transport's error class. */
function isMissingPathCode(value: unknown): boolean {
  return value === "ENOENT" || value === "ENOTDIR" || value === 2 || value === 3;
}

/** Validates explicit source and project identifiers at the transport boundary. */
function requireProjectInput(projectPath: string, sourceId: string): void {
  if (projectPath.trim().length === 0) {
    throw new Error("Project path is required.");
  }

  if (sourceId.trim().length === 0) {
    throw new Error("Source id is required for Docker Compose operations.");
  }
}

/** Validates a service name before passing it to Docker Compose. */
function requireServiceName(serviceName: string): void {
  if (serviceName.trim().length === 0 || /[\0\r\n]/u.test(serviceName)) {
    throw new Error("Compose service name must not be empty.");
  }
}

/** Identifies terminal container states reported by Docker Compose. */
function isStoppedContainer(container: ClientDockerComposeContainer): boolean {
  return ["created", "exited", "dead", "stopped"].includes(container.state.toLowerCase());
}

/** Identifies containers currently executing their configured process. */
function isRunningContainer(container: ClientDockerComposeContainer): boolean {
  return container.state.toLowerCase() === "running";
}

/** Identifies an unhealthy container only while it is actively running. */
function isUnhealthyRunningContainer(container: ClientDockerComposeContainer): boolean {
  return isRunningContainer(container) && container.health.toLowerCase() === "unhealthy";
}

/** Accepts only empty or healthy health values for a fully running service. */
function hasHealthyRuntime(container: ClientDockerComposeContainer): boolean {
  const health = container.health.trim().toLowerCase();
  return health.length === 0 || health === "healthy";
}

/** Restricts log-tail requests to a bounded positive range. */
function requireLogTail(tail: number): void {
  if (!Number.isSafeInteger(tail) || tail < 1 || tail > MAX_LOG_TAIL) {
    throw new Error(`Docker Compose log tail must be between 1 and ${MAX_LOG_TAIL}.`);
  }
}

/** Bounds one stream while recording whether its leading content was dropped. */
function boundText(text: string, maxCharacters: number): { text: string; truncated: boolean } {
  if (text.length <= maxCharacters) {
    return { text, truncated: false };
  }

  return {
    text: text.slice(text.length - maxCharacters),
    truncated: true
  };
}

/** Returns a display-safe error snapshot. */
function createErrorSnapshot(
  projectPath: string,
  sourceId: string,
  composeFile: string | null,
  operation: ComposeOperation,
  error: unknown
): OpenCodexDockerComposeSnapshot {
  return {
    projectPath,
    sourceId,
    composeFile,
    errorMessage: createSafeComposeError(operation, error).message,
    services: []
  };
}

/** Identifies the public operation whose failures must be safe to display. */
type ComposeOperation = "snapshot" | "up" | "stop" | "restart" | "logs";

/** Replaces Docker errors with a bounded message that never contains output. */
function createSafeComposeError(operation: ComposeOperation, error: unknown): Error {
  if (error instanceof DockerCommandError) {
    const exitCode = error.result.exitCode;
    const suffix = typeof exitCode === "number" ? ` (exit code ${exitCode})` : "";
    return new Error(`Docker Compose ${operation} failed${suffix}.`);
  }

  if (error instanceof DockerResponseError) {
    return new Error(`Docker Compose ${operation} returned an invalid response.`);
  }

  return new Error(`Docker Compose ${operation} failed.`);
}

/** Checks whether a transport value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Source client surface needed to inspect files before invoking Docker. */
type SourceDockerFilesystemClient = SourceDockerProcessClient &
  Pick<CodexAppServerClient, "getMetadata">;
