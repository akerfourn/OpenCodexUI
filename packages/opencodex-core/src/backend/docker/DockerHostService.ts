import type {
  DockerAvailability,
  DockerContainerSummary,
  DockerLogOutput
} from "@open-codex-ui/docker-client";
import type {
  OpenCodexDockerContainer,
  OpenCodexDockerContainerLogs,
  OpenCodexDockerHostSnapshot
} from "@open-codex-ui/opencodex-protocol";

const DEFAULT_LOG_TAIL = 200;
const MAX_LOG_TAIL = 2_000;
const MAX_LOG_CHARACTERS_PER_STREAM = 250_000;

/** Minimal Docker client surface required by host-level operations. */
export interface DockerHostClientPort {
  readonly system: {
    availability(): Promise<DockerAvailability>;
  };
  readonly containers: {
    list(): Promise<DockerContainerSummary[]>;
    start(containerId: string): Promise<void>;
    stop(containerId: string): Promise<void>;
    restart(containerId: string): Promise<void>;
    logs(containerId: string, options: { tail: number }): Promise<DockerLogOutput>;
  };
}

/** Reads and controls existing containers in the desktop host's Docker context. */
export class DockerHostService {
  /** Creates a host Docker service over the typed low-level client. */
  constructor(private readonly client: DockerHostClientPort) {}

  /** Reads Docker availability and all existing host containers. */
  async readSnapshot(): Promise<OpenCodexDockerHostSnapshot> {
    const availability = await this.client.system.availability();

    if (!availability.available) {
      return {
        availability: {
          available: false,
          message: availability.message
        },
        containers: []
      };
    }

    try {
      const containers = await this.client.containers.list();
      return {
        availability: {
          available: true,
          clientVersion: availability.version.clientVersion,
          serverVersion: availability.version.serverVersion,
          serverApiVersion: availability.version.serverApiVersion
        },
        containers: containers.map(mapDockerContainer)
      };
    } catch (error: unknown) {
      return {
        availability: {
          available: false,
          message: readErrorMessage(error)
        },
        containers: []
      };
    }
  }

  /** Starts an existing host container. */
  async start(containerId: string): Promise<{ ok: true }> {
    await this.client.containers.start(containerId);
    return { ok: true };
  }

  /** Stops a running host container without removing it. */
  async stop(containerId: string): Promise<{ ok: true }> {
    await this.client.containers.stop(containerId);
    return { ok: true };
  }

  /** Restarts an existing host container. */
  async restart(containerId: string): Promise<{ ok: true }> {
    await this.client.containers.restart(containerId);
    return { ok: true };
  }

  /** Reads a bounded tail of one container's stdout and stderr logs. */
  async readLogs(
    containerId: string,
    tail = DEFAULT_LOG_TAIL
  ): Promise<OpenCodexDockerContainerLogs> {
    requireLogTail(tail);
    const logs = await this.client.containers.logs(containerId, { tail });
    const stdout = boundText(logs.stdout, MAX_LOG_CHARACTERS_PER_STREAM);
    const stderr = boundText(logs.stderr, MAX_LOG_CHARACTERS_PER_STREAM);

    return {
      containerId,
      stdout: stdout.text,
      stderr: stderr.text,
      stdoutTruncated: stdout.truncated,
      stderrTruncated: stderr.truncated
    };
  }
}

/** Maps low-level Docker data to the stable renderer protocol. */
function mapDockerContainer(container: DockerContainerSummary): OpenCodexDockerContainer {
  return {
    id: container.id,
    name: container.name,
    image: container.image,
    state: container.state,
    status: container.status,
    ports: container.ports
  };
}

/** Restricts log-tail requests to a bounded positive range. */
function requireLogTail(tail: number): void {
  if (!Number.isSafeInteger(tail) || tail < 1 || tail > MAX_LOG_TAIL) {
    throw new Error(`Docker log tail must be between 1 and ${MAX_LOG_TAIL}.`);
  }
}

/** Bounds one structured-clone payload while recording truncation. */
function boundText(text: string, maxCharacters: number): { text: string; truncated: boolean } {
  if (text.length <= maxCharacters) {
    return { text, truncated: false };
  }

  return {
    text: text.slice(text.length - maxCharacters),
    truncated: true
  };
}

/** Normalizes unknown Docker failures for availability diagnostics. */
function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Docker is unavailable.";
}
