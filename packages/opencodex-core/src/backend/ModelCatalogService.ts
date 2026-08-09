import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexModel } from "@open-codex-ui/opencodex-protocol";

import {
  fallbackModels,
  readModels
} from "./codexReaders.js";
import type { ClientPort, ProjectSourcePort, RuntimeEventPort } from "./runtime/runtimePorts.js";

/** Dependencies used by the source-scoped model catalog service. */
export type ModelCatalogServiceOptions = {
  /** Cache repository used to persist model metadata, or `null` when unavailable. */
  cacheRepository: OpenCodexCacheRepository | null;
  /** Resolves the requested source before source-scoped work begins. */
  projects: Pick<ProjectSourcePort, "resolveSource">;
  /** Ensures a started Codex client for a canonical source identifier. */
  clients: Pick<ClientPort, "ensureClient">;
  /** Emits model catalog updates to the UI transport. */
  events: Pick<RuntimeEventPort, "emit">;
  /** Writes best-effort diagnostics for cache and RPC failures. */
  logger?: (message: string) => void;
};

/** Coordinates cached and live model metadata for one Codex source. */
export class ModelCatalogService {
  /** Creates a model catalog service. */
  constructor(
    /** Source resolver, client, cache, event, and diagnostic dependencies. */
    private readonly options: ModelCatalogServiceOptions
  ) {}

  /**
   * Lists models from cache, Codex, or the stable local fallback.
   *
   * @param sourceId Requested source identifier, or `null` for the default source.
   * @returns Available model metadata.
   */
  async listModels(sourceId: string | null): Promise<OpenCodexModel[]> {
    const source = await this.options.projects.resolveSource(sourceId);
    const cachedModels = await this.readCachedModels(source.id);

    if (cachedModels.length > 0) {
      this.options.events.emit({ type: "models.updated", models: cachedModels });
    }

    try {
      const client = await this.options.clients.ensureClient(source.id);
      const response = await client.request("model/list", { limit: 100 });
      const models = readModels(response);

      if (models.length > 0) {
        await this.saveModelCatalog(source.id, models);
        this.options.events.emit({ type: "models.updated", models });
        return models;
      }

      if (cachedModels.length > 0) {
        return cachedModels;
      }

      const modelsFallback = fallbackModels();
      this.options.events.emit({ type: "models.updated", models: modelsFallback });
      return modelsFallback;
    } catch (error) {
      this.options.logger?.(`model/list unavailable: ${String(error)}`);

      if (cachedModels.length > 0) {
        return cachedModels;
      }

      const modelsFallback = fallbackModels();
      this.options.events.emit({ type: "models.updated", models: modelsFallback });
      return modelsFallback;
    }
  }

  /**
   * Reads and validates the cached model catalog for one source.
   *
   * @param sourceId Canonical source identifier.
   * @returns Cached models, or an empty list when unavailable or invalid.
   */
  private async readCachedModels(sourceId: string): Promise<OpenCodexModel[]> {
    if (this.options.cacheRepository === null) {
      return [];
    }

    try {
      const catalog = await this.options.cacheRepository.getModelCatalog(sourceId);

      if (catalog === null) {
        return [];
      }

      const models = JSON.parse(catalog.modelsJson) as unknown;
      return readModels({ data: models });
    } catch (error) {
      this.options.logger?.(`model catalog cache unavailable: ${String(error)}`);
      return [];
    }
  }

  /**
   * Persists a fresh model catalog without exposing cache failures to callers.
   *
   * @param sourceId Canonical source identifier.
   * @param models Fresh model metadata.
   * @returns Promise resolved after the best-effort write.
   */
  private async saveModelCatalog(sourceId: string, models: OpenCodexModel[]): Promise<void> {
    if (this.options.cacheRepository === null) {
      return;
    }

    try {
      await this.options.cacheRepository.saveModelCatalog(sourceId, JSON.stringify(models));
    } catch (error) {
      this.options.logger?.(`model catalog cache write unavailable: ${String(error)}`);
    }
  }
}
