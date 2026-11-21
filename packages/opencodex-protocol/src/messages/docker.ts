/** Docker CLI and daemon availability reported by the desktop host. */
export type OpenCodexDockerAvailability =
  | {
      available: true;
      clientVersion: string;
      serverVersion: string;
      serverApiVersion: string;
    }
  | {
      available: false;
      message: string;
      reason?: OpenCodexDockerUnavailableReason;
      diagnostics?: OpenCodexDockerFailureDiagnostics;
    };

/** Optional Docker dependencies have a visible state rather than a repeated application error. */
export type OpenCodexDockerUnavailableReason =
  | "cli-missing" | "compose-missing" | "engine-unreachable" | "permission-denied" | "unknown";

/** Safe failure context; command output, scripts and environment values are excluded. */
export interface OpenCodexDockerFailureDiagnostics {
  operation: string;
  exitCode?: number | null;
  code?: string | number;
}

/** Display-safe summary of one container in the host Docker context. */
export interface OpenCodexDockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
}

/** Complete bounded state used by the Home Docker section. */
export interface OpenCodexDockerHostSnapshot {
  availability: OpenCodexDockerAvailability;
  containers: OpenCodexDockerContainer[];
}

/** Bounded stdout and stderr logs read for one Docker container. */
export interface OpenCodexDockerContainerLogs {
  containerId: string;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

/** Finite aggregate state used to summarize one Compose service. */
export type OpenCodexDockerComposeServiceState =
  | "running"
  | "unhealthy"
  | "partial"
  | "stopped"
  | "missing"
  | "unknown";

/** Published port exposed by one Compose service container. */
export interface OpenCodexDockerComposePublisher {
  url: string;
  targetPort: number;
  publishedPort: number;
  protocol: string;
}

/** Safe, display-oriented summary of one Compose service container. */
export interface OpenCodexDockerComposeContainer {
  name: string;
  state: string;
  health: string;
  exitCode: number;
  publishers: OpenCodexDockerComposePublisher[];
}

/** Configured Compose service and its currently visible containers. */
export interface OpenCodexDockerComposeService {
  name: string;
  state: OpenCodexDockerComposeServiceState;
  containers: OpenCodexDockerComposeContainer[];
}

/** Bounded Compose project snapshot scoped to one source filesystem. */
export interface OpenCodexDockerComposeSnapshot {
  projectPath: string;
  sourceId: string;
  composeFile: string | null;
  /** Direct workspace candidates; one explicit file is used for every Docker call. */
  composeFiles?: string[];
  /** No automatic fallback when a remembered file disappears. */
  selectionIssue?: "required" | "missing" | null;
  errorMessage: string | null;
  /** Unavailable optional tooling does not populate errorMessage. */
  availability?: OpenCodexDockerAvailability;
  /** Preserves the failing check without exposing resolved Compose configuration. */
  diagnostics?: OpenCodexDockerFailureDiagnostics;
  services: OpenCodexDockerComposeService[];
}

/** Bounded stdout and stderr logs read for one Compose service. */
export interface OpenCodexDockerComposeLogs {
  serviceName: string;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}
