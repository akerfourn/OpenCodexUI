import { DockerResponseError } from "./errors.js";
import type {
  DockerComposeContainer,
  DockerComposePort,
  DockerContainerSummary,
  DockerVersion
} from "./models.js";

/** Parses the stable subset of `docker version` selected by the client template. */
export function parseDockerVersion(output: string): DockerVersion {
  const value = parseJsonObject(output, "version");

  return {
    clientVersion: readString(value, "clientVersion", "version"),
    serverVersion: readString(value, "serverVersion", "version"),
    serverApiVersion: readString(value, "serverApiVersion", "version")
  };
}

/** Parses JSON Lines emitted by `docker container ls`. */
export function parseDockerContainers(output: string): DockerContainerSummary[] {
  return parseJsonLines(output, "container list").map((value) => ({
    id: readString(value, "ID", "container list"),
    name: readString(value, "Names", "container list"),
    image: readString(value, "Image", "container list"),
    command: readOptionalString(value, "Command"),
    state: readString(value, "State", "container list"),
    status: readOptionalString(value, "Status"),
    ports: readOptionalString(value, "Ports"),
    createdAt: readOptionalString(value, "CreatedAt"),
    runningFor: readOptionalString(value, "RunningFor"),
    labels: readOptionalString(value, "Labels")
  }));
}

/** Parses JSON Lines emitted by `docker compose ps`. */
export function parseDockerComposeContainers(output: string): DockerComposeContainer[] {
  return parseJsonLines(output, "Compose service list").map((value) => ({
    id: readString(value, "ID", "Compose service list"),
    name: readString(value, "Name", "Compose service list"),
    command: readOptionalString(value, "Command"),
    project: readString(value, "Project", "Compose service list"),
    service: readString(value, "Service", "Compose service list"),
    state: readString(value, "State", "Compose service list"),
    health: readOptionalString(value, "Health"),
    exitCode: readNumber(value, "ExitCode", "Compose service list"),
    publishers: readPublishers(value.Publishers)
  }));
}

/** Parses one service name per line while rejecting empty names. */
export function parseDockerComposeServiceNames(output: string): string[] {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Parses either JSON Lines or an array returned by Docker formatters. */
function parseJsonLines(output: string, operation: string): Record<string, unknown>[] {
  const normalized = output.trim();

  if (normalized.length === 0) {
    return [];
  }

  if (normalized.startsWith("[")) {
    const parsed = parseJson(normalized, operation);

    if (!Array.isArray(parsed)) {
      throw new DockerResponseError(operation, "expected a JSON array");
    }

    return parsed.map((entry) => requireRecord(entry, operation));
  }

  return normalized
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => requireRecord(parseJson(line, operation), operation));
}

/** Parses one JSON object. */
function parseJsonObject(output: string, operation: string): Record<string, unknown> {
  return requireRecord(parseJson(output, operation), operation);
}

/** Parses JSON and maps syntax errors to a Docker-specific response error. */
function parseJson(output: string, operation: string): unknown {
  try {
    return JSON.parse(output) as unknown;
  } catch {
    throw new DockerResponseError(operation, "malformed JSON");
  }
}

/** Requires a plain JSON object. */
function requireRecord(value: unknown, operation: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DockerResponseError(operation, "expected a JSON object");
  }

  return value as Record<string, unknown>;
}

/** Reads a required string property. */
function readString(
  value: Record<string, unknown>,
  key: string,
  operation: string
): string {
  const property = value[key];

  if (typeof property !== "string") {
    throw new DockerResponseError(operation, `expected string property ${key}`);
  }

  return property;
}

/** Reads an optional string property using an empty display value when absent. */
function readOptionalString(value: Record<string, unknown>, key: string): string {
  const property = value[key];
  return typeof property === "string" ? property : "";
}

/** Reads a required numeric property. */
function readNumber(
  value: Record<string, unknown>,
  key: string,
  operation: string
): number {
  const property = value[key];

  if (typeof property !== "number") {
    throw new DockerResponseError(operation, `expected numeric property ${key}`);
  }

  return property;
}

/** Normalizes optional Compose publisher records. */
function readPublishers(value: unknown): DockerComposePort[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new DockerResponseError("Compose service list", "expected Publishers array");
  }

  return value.map((entry) => {
    const publisher = requireRecord(entry, "Compose service list");

    return {
      url: readString(publisher, "URL", "Compose service list"),
      targetPort: readNumber(publisher, "TargetPort", "Compose service list"),
      publishedPort: readNumber(publisher, "PublishedPort", "Compose service list"),
      protocol: readString(publisher, "Protocol", "Compose service list")
    };
  });
}
