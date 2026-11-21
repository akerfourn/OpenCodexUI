import { DockerCommandError } from "./errors.js";
import type { DockerAvailability, DockerFailureDiagnostics, DockerUnavailableReason } from "./models.js";

const engineConnectionFailures = [
  /cannot connect to the docker daemon/i,
  /is the docker daemon running/i,
  /error during connect/i,
  /failed to connect to (?:the )?docker/i,
  /connection refused/i
];
const missingComposeFailures = [
  /['"]?compose['"]? is not a docker command/i,
  /unknown command:?\s+(?:docker\s+)?["']?compose\b/i,
  /docker: ['"]compose['"] is not/i
];

/** Classifies setup failures without copying command output, environment values or credentials. */
export function describeDockerFailure(
  error: unknown, operation: string
): Extract<DockerAvailability, { available: false }> & { reason: DockerUnavailableReason } {
  const diagnostics = dockerFailureDiagnostics(error, operation);
  const message = error instanceof Error ? error.message : "";
  let reason: DockerUnavailableReason = "unknown";
  if (diagnostics.code === "ENOENT" || /failed to spawn process: program not found/i.test(message)) {
    reason = "cli-missing";
  } else if (diagnostics.code === "EACCES" || diagnostics.code === "EPERM" || /permission denied|access is denied/i.test(message)) {
    reason = "permission-denied";
  } else if (engineConnectionFailures.some(pattern => pattern.test(message))) {
    reason = "engine-unreachable";
  } else if (missingComposeFailures.some(pattern => pattern.test(message))) {
    reason = "compose-missing";
  }
  return { available: false, reason, message: messages[reason], diagnostics };
}

/** Retains structured exit information while excluding potentially sensitive command output. */
export function dockerFailureDiagnostics(error: unknown, operation: string): DockerFailureDiagnostics {
  const diagnostics: DockerFailureDiagnostics = { operation };
  if (error instanceof DockerCommandError) diagnostics.exitCode = error.result.exitCode;
  if (typeof error === "object" && error !== null && "code" in error
    && (typeof error.code === "string" || typeof error.code === "number")) diagnostics.code = error.code;
  return diagnostics;
}

/** Stable messages avoid journaling raw stderr from optional dependency checks. */
const messages: Record<DockerUnavailableReason, string> = {
  "cli-missing": "Docker executable was not found in this environment.",
  "compose-missing": "The Docker Compose plugin is unavailable.",
  "engine-unreachable": "The Docker engine is unreachable in the selected context.",
  "permission-denied": "Access to Docker was denied.",
  unknown: "Docker availability could not be established."
};
