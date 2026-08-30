import type { DockerCommandRequest, DockerCommandResult } from "./command.js";

/** Reports a Docker CLI command that completed unsuccessfully. */
export class DockerCommandError extends Error {
  /** Command request that failed. */
  readonly request: DockerCommandRequest;
  /** Captured failed process result. */
  readonly result: DockerCommandResult;

  /** Creates an actionable Docker command failure. */
  constructor(request: DockerCommandRequest, result: DockerCommandResult) {
    super(createDockerCommandErrorMessage(request, result));
    this.name = "DockerCommandError";
    this.request = request;
    this.result = result;
  }
}

/** Reports malformed structured output returned by Docker. */
export class DockerResponseError extends Error {
  /** Creates a malformed-response error for one Docker operation. */
  constructor(operation: string, detail: string) {
    super(`Docker returned an invalid response for ${operation}: ${detail}`);
    this.name = "DockerResponseError";
  }
}

/** Builds a concise command failure without exposing environment variables. */
function createDockerCommandErrorMessage(
  request: DockerCommandRequest,
  result: DockerCommandResult
): string {
  const output = [result.stderr, result.stdout]
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  const exitDescription = result.exitCode === null
    ? `signal ${result.signal ?? "unknown"}`
    : `code ${result.exitCode}`;
  const command = [request.command, ...request.args].join(" ");

  if (output === undefined) {
    return `Docker command failed with ${exitDescription}: ${command}`;
  }

  return `Docker command failed with ${exitDescription}: ${output}`;
}
