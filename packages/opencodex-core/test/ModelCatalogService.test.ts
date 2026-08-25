import type {
  CachedModelCatalog,
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexModel
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { fallbackModels } from "../src/backend/shared/codexReaders";
import { ModelCatalogService } from "../src/backend/support/ModelCatalogService";

describe("ModelCatalogService", () => {
  it("should return and persist fresh models after requesting the canonical source", async () => {
    const source = createSource("canonical-source");
    const freshModel = createModel("fresh-model");
    const request = vi.fn(async () => ({ data: [{ model: freshModel.id }] }));
    const saveModelCatalog = vi.fn(async () => undefined);
    const client = createClient(request);
    const resolveSource = vi.fn(async () => source);
    const ensureClient = vi.fn(async () => client);
    const emit = vi.fn<(event: OpenCodexEvent) => void>();
    const service = new ModelCatalogService({
      cacheRepository: createRepository({ saveModelCatalog }),
      projects: { resolveSource },
      clients: { ensureClient },
      events: { emit }
    });

    await expect(service.listModels("requested-source")).resolves.toEqual([freshModel]);

    expect(resolveSource).toHaveBeenCalledWith("requested-source");
    expect(ensureClient).toHaveBeenCalledWith(source.id);
    expect(request).toHaveBeenCalledWith("model/list", { limit: 100 });
    expect(saveModelCatalog).toHaveBeenCalledWith(source.id, JSON.stringify([freshModel]));
    expect(emit).toHaveBeenCalledWith({ type: "models.updated", models: [freshModel] });
  });

  it("should emit cached models before refreshing them with Codex", async () => {
    const source = createSource("canonical-source");
    const cachedModel = createModel("cached-model");
    const freshModel = createModel("fresh-model");
    const operations: string[] = [];
    const request = vi.fn(async () => {
      operations.push("rpc");
      return { data: [{ model: freshModel.id }] };
    });
    const saveModelCatalog = vi.fn(async () => {
      operations.push("save");
    });
    const client = createClient(request);
    const service = new ModelCatalogService({
      cacheRepository: createRepository({
        getModelCatalog: vi.fn(async () => {
          operations.push("cache-read");
          return createCatalog([cachedModel]);
        }),
        saveModelCatalog
      }),
      projects: { resolveSource: vi.fn(async () => source) },
      clients: { ensureClient: vi.fn(async () => {
        operations.push("ensure");
        return client;
      }) },
      events: { emit: (event) => {
        operations.push(event.models[0]?.id === cachedModel.id ? "cached-event" : "fresh-event");
      } }
    });

    await expect(service.listModels(null)).resolves.toEqual([freshModel]);
    expect(operations).toEqual([
      "cache-read",
      "cached-event",
      "ensure",
      "rpc",
      "save",
      "fresh-event"
    ]);
  });

  it("should return cached models when Codex returns an empty list", async () => {
    const source = createSource("source-1");
    const cachedModel = createModel("cached-model");
    const emit = vi.fn<(event: OpenCodexEvent) => void>();
    const service = new ModelCatalogService({
      cacheRepository: createRepository({
        getModelCatalog: vi.fn(async () => createCatalog([cachedModel]))
      }),
      projects: { resolveSource: vi.fn(async () => source) },
      clients: { ensureClient: vi.fn(async () => createClient(vi.fn(async () => ({ data: [] })))) },
      events: { emit }
    });

    await expect(service.listModels(source.id)).resolves.toEqual([cachedModel]);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ type: "models.updated", models: [cachedModel] });
  });

  it("should return cached models when Codex model listing fails", async () => {
    const source = createSource("source-1");
    const cachedModel = createModel("cached-model");
    const rpcError = new Error("app server unavailable");
    const logger = vi.fn<(message: string) => void>();
    const emit = vi.fn<(event: OpenCodexEvent) => void>();
    const service = new ModelCatalogService({
      cacheRepository: createRepository({
        getModelCatalog: vi.fn(async () => createCatalog([cachedModel]))
      }),
      projects: { resolveSource: vi.fn(async () => source) },
      clients: { ensureClient: vi.fn(async () => createClient(vi.fn(async () => {
        throw rpcError;
      }))) },
      events: { emit },
      logger
    });

    await expect(service.listModels(source.id)).resolves.toEqual([cachedModel]);
    expect(logger).toHaveBeenCalledWith(`model/list unavailable: ${String(rpcError)}`);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ type: "models.updated", models: [cachedModel] });
  });

  it("should use the fallback when the cache is disabled and Codex returns no models", async () => {
    const source = createSource("source-1");
    const emit = vi.fn<(event: OpenCodexEvent) => void>();
    const service = new ModelCatalogService({
      cacheRepository: null,
      projects: { resolveSource: vi.fn(async () => source) },
      clients: { ensureClient: vi.fn(async () => createClient(vi.fn(async () => ({ data: [] })))) },
      events: { emit }
    });

    await expect(service.listModels(null)).resolves.toEqual(fallbackModels());
    expect(emit).toHaveBeenCalledWith({ type: "models.updated", models: fallbackModels() });
  });

  it.each([
    ["invalid JSON", "{invalid", undefined],
    ["empty JSON", "", undefined],
    ["cache read error", null, new Error("cache read failed")]
  ] as const)("should log and ignore %s cache data", async (_label, modelsJson, readError) => {
    const source = createSource("source-1");
    const logger = vi.fn<(message: string) => void>();
    const getModelCatalog = readError === undefined
      ? vi.fn(async () => createCatalogJson(modelsJson))
      : vi.fn(async (): Promise<CachedModelCatalog> => {
        throw readError;
      });
    const service = new ModelCatalogService({
      cacheRepository: createRepository({ getModelCatalog }),
      projects: { resolveSource: vi.fn(async () => source) },
      clients: { ensureClient: vi.fn(async () => createClient(vi.fn(async () => ({ data: [] })))) },
      events: { emit: vi.fn() },
      logger
    });

    await expect(service.listModels(source.id)).resolves.toEqual(fallbackModels());

    const expectedError = readError ?? readJsonError(modelsJson ?? "");
    expect(logger).toHaveBeenCalledWith(
      `model catalog cache unavailable: ${String(expectedError)}`
    );
  });

  it("should return fresh models when saving the catalog fails", async () => {
    const source = createSource("source-1");
    const freshModel = createModel("fresh-model");
    const saveError = new Error("cache write failed");
    const logger = vi.fn<(message: string) => void>();
    const saveModelCatalog = vi.fn(async () => {
      throw saveError;
    });
    const service = new ModelCatalogService({
      cacheRepository: createRepository({ saveModelCatalog }),
      projects: { resolveSource: vi.fn(async () => source) },
      clients: { ensureClient: vi.fn(async () => createClient(vi.fn(async () => ({
        data: [{ model: freshModel.id }]
      })))) },
      events: { emit: vi.fn() },
      logger
    });

    await expect(service.listModels(source.id)).resolves.toEqual([freshModel]);
    expect(logger).toHaveBeenCalledWith(`model catalog cache write unavailable: ${String(saveError)}`);
  });

  it("should use the resolved canonical source id for cache and client operations", async () => {
    const source = createSource("canonical-source");
    const request = vi.fn(async () => ({ data: [] }));
    const getModelCatalog = vi.fn(async () => null);
    const ensureClient = vi.fn(async () => createClient(request));
    const service = new ModelCatalogService({
      cacheRepository: createRepository({ getModelCatalog }),
      projects: { resolveSource: vi.fn(async () => source) },
      clients: { ensureClient },
      events: { emit: vi.fn() }
    });

    await service.listModels("source-alias");

    expect(getModelCatalog).toHaveBeenCalledWith(source.id);
    expect(ensureClient).toHaveBeenCalledWith(source.id);
  });

  it("should propagate source resolution failures before entering the fallback flow", async () => {
    const resolveError = new Error("source resolution failed");
    const resolveSource = vi.fn(async () => {
      throw resolveError;
    });
    const ensureClient = vi.fn();
    const logger = vi.fn<(message: string) => void>();
    const service = new ModelCatalogService({
      cacheRepository: createRepository(),
      projects: { resolveSource },
      clients: { ensureClient },
      events: { emit: vi.fn() },
      logger
    });

    await expect(service.listModels(null)).rejects.toBe(resolveError);
    expect(ensureClient).not.toHaveBeenCalled();
    expect(logger).not.toHaveBeenCalled();
  });
});

/** Creates a minimal source object for source-resolution tests. */
function createSource(id: string): CachedSource {
  return { id } as CachedSource;
}

/** Creates the normalized model shape returned by the reader. */
function createModel(id: string): OpenCodexModel {
  return {
    id,
    model: id,
    displayName: id,
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    serviceTiers: []
  };
}

/** Creates a cache row from normalized models. */
function createCatalog(models: OpenCodexModel[]): CachedModelCatalog {
  return createCatalogJson(JSON.stringify(models));
}

/** Creates a cache row from serialized model metadata. */
function createCatalogJson(modelsJson: string): CachedModelCatalog {
  return {
    sourceId: "source-1",
    modelsJson,
    updatedAt: "2026-08-09T00:00:00.000Z"
  };
}

/** Creates a narrow fake repository for model catalog tests. */
function createRepository(
  overrides: Partial<Pick<OpenCodexCacheRepository, "getModelCatalog" | "saveModelCatalog">> = {}
): OpenCodexCacheRepository {
  return {
    getModelCatalog: overrides.getModelCatalog ?? (async () => null),
    saveModelCatalog: overrides.saveModelCatalog ?? (async () => undefined)
  } as OpenCodexCacheRepository;
}

/** Creates a fake Codex client with a controllable model-list request. */
function createClient(request: (...args: never[]) => Promise<unknown>): CodexAppServerClient {
  return { request } as unknown as CodexAppServerClient;
}

/** Reproduces the parser error used by the service for malformed cache JSON. */
function readJsonError(modelsJson: string): unknown {
  try {
    JSON.parse(modelsJson);
  } catch (error) {
    return error;
  }

  throw new Error("Expected malformed JSON test data.");
}
