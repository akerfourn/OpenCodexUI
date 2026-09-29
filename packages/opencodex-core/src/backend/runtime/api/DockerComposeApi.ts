import type {
  OpenCodexDockerComposeLogs,
  OpenCodexDockerComposeSnapshot
} from "@open-codex-ui/opencodex-protocol";

import type { DockerComposeService } from "../../docker/DockerComposeService.js";

/** Exposes source-scoped Docker Compose operations through the runtime API. */
export class DockerComposeApi {
  /** Creates a Compose API backed by the source-aware service. */
  constructor(private readonly service: DockerComposeService) {}

  /** Reads configured services and their bounded runtime state. */
  async readSnapshot(projectPath: string, sourceId: string, workspaceId?: string, composeFile?: string): Promise<OpenCodexDockerComposeSnapshot> {
    return await this.service.readSnapshot(projectPath, sourceId, workspaceId, composeFile);
  }

  /** Creates or starts one Compose service. */
  async up(projectPath: string, sourceId: string, serviceName: string, workspaceId?: string, composeFile?: string): Promise<{ ok: true }> {
    return await this.service.up(projectPath, sourceId, serviceName, workspaceId, composeFile);
  }

  /** Stops one Compose service without removing its container. */
  async stop(projectPath: string, sourceId: string, serviceName: string, workspaceId?: string, composeFile?: string): Promise<{ ok: true }> {
    return await this.service.stop(projectPath, sourceId, serviceName, workspaceId, composeFile);
  }

  /** Restarts one Compose service. */
  async restart(projectPath: string, sourceId: string, serviceName: string, workspaceId?: string, composeFile?: string): Promise<{ ok: true }> {
    return await this.service.restart(projectPath, sourceId, serviceName, workspaceId, composeFile);
  }

  /** Reads a bounded tail of one Compose service's logs. */
  async readLogs(
    projectPath: string,
    sourceId: string,
    serviceName: string,
    tail?: number,
    workspaceId?: string,
    composeFile?: string
  ): Promise<OpenCodexDockerComposeLogs> {
    return await this.service.readLogs(projectPath, sourceId, serviceName, tail, workspaceId, composeFile);
  }
}
