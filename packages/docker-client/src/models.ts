/** Docker client and daemon versions visible to the selected CLI context. */
export interface DockerVersion {
  clientVersion: string;
  serverVersion: string;
  serverApiVersion: string;
}

/** Result of probing the Docker CLI and its selected daemon. */
export type DockerAvailability =
  | { available: true; version: DockerVersion }
  | { available: false; message: string };

/** Summary of one container visible to the Docker daemon. */
export interface DockerContainerSummary {
  id: string;
  name: string;
  image: string;
  command: string;
  state: string;
  status: string;
  ports: string;
  createdAt: string;
  runningFor: string;
  labels: string;
}

/** Options for listing global Docker containers. */
export interface DockerContainerListOptions {
  /** Includes stopped containers. Defaults to true. */
  all?: boolean;
}

/** Options for reading or following Docker logs. */
export interface DockerLogOptions {
  /** Number of trailing lines, or all available lines. */
  tail?: number | "all";
  /** Docker timestamp or relative duration from which logs are returned. */
  since?: string;
  /** Includes Docker timestamps in each line. */
  timestamps?: boolean;
}

/** Captured container or Compose service logs. */
export interface DockerLogOutput {
  stdout: string;
  stderr: string;
}

/** Published port reported for one Compose container. */
export interface DockerComposePort {
  url: string;
  targetPort: number;
  publishedPort: number;
  protocol: string;
}

/** One runtime container belonging to a Compose service. */
export interface DockerComposeContainer {
  id: string;
  name: string;
  command: string;
  project: string;
  service: string;
  state: string;
  health: string;
  exitCode: number;
  publishers: DockerComposePort[];
}

/** Configured Compose service with its zero or more runtime containers. */
export interface DockerComposeService {
  name: string;
  containers: DockerComposeContainer[];
}

/** Selects a Compose project without changing its configuration. */
export interface DockerComposeOptions {
  /** Directory from which Compose resolves its project and environment. */
  projectPath: string;
  /** Explicit Compose files, resolved relative to projectPath when relative. */
  files?: readonly string[];
  /** Optional Compose project name. */
  projectName?: string;
  /** Optional Compose profiles to enable. */
  profiles?: readonly string[];
}

/** Controls starting existing Compose containers. */
export interface DockerComposeStartOptions {
  /** Waits until selected services are running or healthy. */
  wait?: boolean;
  /** Maximum wait duration in seconds. */
  waitTimeoutSeconds?: number;
}

/** Controls creating or starting Compose services through `up`. */
export interface DockerComposeUpOptions extends DockerComposeStartOptions {
  /** Builds images before starting services. */
  build?: boolean;
}

/** Controls graceful service shutdown. */
export interface DockerComposeStopOptions {
  /** Shutdown timeout in seconds. */
  timeoutSeconds?: number;
}
