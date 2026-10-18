import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { SourceInstanceRequest, SourceInstanceSnapshot } from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexClientPool } from "../runtime/OpenCodexClientPool.js";
import type { ProjectSourcePort } from "../runtime/runtimePorts.js";

/** Exposes only this application's owned source processes, never arbitrary host process identifiers. */
export class SourceInstancesService {
  /** Source lookup validates every mutation independently of the UI's active selection. */
  constructor(
    private readonly sources: Pick<ProjectSourcePort, "resolveRequestedSource">,
    private readonly pool: Pick<OpenCodexClientPool, "readState" | "startClient" | "stopClient" | "restartClient">,
    private readonly cache: Pick<OpenCodexCacheRepository, "listSources"> | null
  ) {}

  /** Lists in-memory states without triggering source detection, initialization or account reads. */
  async list(): Promise<SourceInstanceSnapshot[]> {
    const sources = await this.cache?.listSources() ?? [];
    return sources.map(source => this.pool.readState(source.id));
  }

  /** Runs an explicit control action; force must be a real boolean supplied by the confirmation flow. */
  async execute(request: SourceInstanceRequest): Promise<SourceInstanceSnapshot[] | SourceInstanceSnapshot> {
    if (request.type === "sourceInstances.list") return await this.list();
    if (typeof request.sourceId !== "string" || request.sourceId.trim().length === 0) {
      throw new Error("An explicit Codex source is required.");
    }
    const source = await this.sources.resolveRequestedSource(request.sourceId);
    if (source.id !== request.sourceId) throw new Error("The requested source is unavailable.");
    if (request.type === "sourceInstances.start") {
      await this.pool.startClient(source.id);
    } else {
      if (typeof request.force !== "boolean") throw new Error("Forced interruption requires explicit confirmation.");
      if (request.type === "sourceInstances.stop") {
        await this.pool.stopClient(source.id, request.force);
      } else {
        await this.pool.restartClient(source.id, request.force);
      }
    }
    return this.pool.readState(source.id);
  }
}
