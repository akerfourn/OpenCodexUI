import type {
  OpenCodexDockerContainerLogs,
  OpenCodexDockerHostSnapshot
} from "@open-codex-ui/opencodex-protocol";

import type { DockerHostService } from "../../docker/DockerHostService.js";

/** Exposes host Docker operations through the stable backend runtime API. */
export class DockerApi {
  /** Creates a Docker API backed by the host service. */
  constructor(private readonly service: DockerHostService) {}

  /** Reads Docker availability and existing containers. */
  async readSnapshot(): Promise<OpenCodexDockerHostSnapshot> {
    return await this.service.readSnapshot();
  }

  /** Starts an existing container. */
  async start(containerId: string): Promise<{ ok: true }> {
    return await this.service.start(containerId);
  }

  /** Stops a running container without removing it. */
  async stop(containerId: string): Promise<{ ok: true }> {
    return await this.service.stop(containerId);
  }

  /** Restarts an existing container. */
  async restart(containerId: string): Promise<{ ok: true }> {
    return await this.service.restart(containerId);
  }

  /** Reads a bounded tail of one container's logs. */
  async readLogs(containerId: string, tail?: number): Promise<OpenCodexDockerContainerLogs> {
    return await this.service.readLogs(containerId, tail);
  }
}
