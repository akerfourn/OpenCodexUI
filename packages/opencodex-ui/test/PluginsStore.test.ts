import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  OpenCodexPluginSummary,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

import { PluginsStore } from "../src/stores/app/PluginsStore";
import type { RootStore } from "../src/stores/RootStore";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("PluginsStore bounded loading", () => {
  it("should load only installed state when a source is selected", async () => {
    const request = vi.fn(async () => createInstalledResult("source-a"));
    const store = createStore(request);

    store.setSelectedSourceId("source-a");

    await vi.waitFor(() => {
      expect(store.hasLoadedInstalled).toBe(true);
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      type: "plugins.installed",
      sourceId: "source-a"
    });
    expect(store.hasLoadedCatalog).toBe(false);
  });

  it("should request explicit catalog pages with a fixed upper page size", async () => {
    const request = vi.fn(async (value: OpenCodexRequest) => {
      if (value.type === "plugins.installed") {
        return createInstalledResult(value.sourceId);
      }

      return {
        sourceId: "source-a",
        plugins: createPlugins(50),
        nextCursor: "cursor-50",
        loadErrors: []
      };
    });
    const store = createStore(request);
    store.setSelectedSourceId("source-a");
    await vi.waitFor(() => expect(store.hasLoadedInstalled).toBe(true));

    await store.loadCatalog();

    expect(request).toHaveBeenLastCalledWith({
      type: "plugins.search",
      sourceId: "source-a",
      searchTerm: "",
      cursor: null,
      limit: 50
    });
    expect(store.catalogPlugins).toHaveLength(50);
    expect(store.hasMoreCatalogPlugins).toBe(true);
  });

  it("should never retain more than 200 catalog rows in the renderer", async () => {
    let page = 0;
    const request = vi.fn(async (value: OpenCodexRequest) => {
      if (value.type === "plugins.installed") {
        return createInstalledResult(value.sourceId);
      }

      const pageStart = page * 50;
      page += 1;
      return {
        sourceId: "source-a",
        plugins: createPlugins(50, pageStart),
        nextCursor: `cursor-${page * 50}`,
        loadErrors: []
      };
    });
    const store = createStore(request);
    store.setSelectedSourceId("source-a");
    await vi.waitFor(() => expect(store.hasLoadedInstalled).toBe(true));

    await store.loadCatalog();
    await store.loadMoreCatalogPlugins();
    await store.loadMoreCatalogPlugins();
    await store.loadMoreCatalogPlugins();
    await store.loadMoreCatalogPlugins();

    expect(store.catalogPlugins).toHaveLength(200);
    expect(store.visiblePlugins).toHaveLength(200);
    expect(store.hasMoreCatalogPlugins).toBe(false);
    expect(store.hasReachedCatalogDisplayLimit).toBe(true);
    expect(page).toBe(4);
  });

  it("should ignore installed responses from a previously selected source", async () => {
    const sourceA = createDeferred<unknown>();
    const sourceB = createDeferred<unknown>();
    const request = vi.fn((value: OpenCodexRequest) => (
      value.type === "plugins.installed" && value.sourceId === "source-a"
        ? sourceA.promise
        : sourceB.promise
    ));
    const store = createStore(request);

    store.setSelectedSourceId("source-a");
    store.setSelectedSourceId("source-b");
    sourceB.resolve({
      sourceId: "source-b",
      plugins: [createPlugin(2)],
      loadErrors: []
    });
    await vi.waitFor(() => expect(store.installedPlugins[0]?.id).toBe("plugin-2"));

    sourceA.resolve({
      sourceId: "source-a",
      plugins: [createPlugin(1)],
      loadErrors: []
    });
    await Promise.resolve();

    expect(store.selectedSourceId).toBe("source-b");
    expect(store.installedPlugins[0]?.id).toBe("plugin-2");
  });

  it("should debounce catalog searches and keep only the latest term", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (value: OpenCodexRequest) => {
      if (value.type === "plugins.installed") {
        return createInstalledResult(value.sourceId);
      }

      return { sourceId: "source-a", plugins: [], nextCursor: null, loadErrors: [] };
    });
    const store = createStore(request);
    store.setSelectedSourceId("source-a");
    await vi.runAllTimersAsync();
    await store.loadCatalog();
    request.mockClear();

    store.setSearchTerm("git");
    store.setSearchTerm("github");
    await vi.advanceTimersByTimeAsync(300);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      type: "plugins.search",
      searchTerm: "github",
      cursor: null,
      limit: 50
    }));
  });

  it("should keep explicit remote refresh separate from bounded list requests", async () => {
    const request = vi.fn(async (value: OpenCodexRequest) => {
      if (value.type === "plugins.installed") {
        return createInstalledResult(value.sourceId);
      }

      if (value.type === "plugins.refresh") {
        return { ok: true, loadErrors: ["refresh warning"] };
      }

      return { sourceId: "source-a", plugins: [], nextCursor: null, loadErrors: [] };
    });
    const store = createStore(request);
    store.setSelectedSourceId("source-a");
    await vi.waitFor(() => expect(store.hasLoadedInstalled).toBe(true));
    request.mockClear();

    await store.refreshCatalog();

    expect(request.mock.calls.map(([value]) => value.type).sort()).toEqual([
      "plugins.installed",
      "plugins.refresh",
      "plugins.search"
    ]);
    expect(request.mock.calls.some(([value]) => value.type === "plugins.list")).toBe(false);
    expect(store.loadErrors).toEqual(["refresh warning"]);
  });

  it("should isolate matching plugin mutations across source changes", async () => {
    const installA = createDeferred<unknown>();
    const installB = createDeferred<unknown>();
    const request = vi.fn(async (value: OpenCodexRequest) => {
      if (value.type === "plugins.install") {
        return await (value.sourceId === "source-a" ? installA.promise : installB.promise);
      }

      if (value.type === "plugins.installed") {
        return createInstalledResult(value.sourceId);
      }

      return { sourceId: value.sourceId, plugins: [], nextCursor: null, loadErrors: [] };
    });
    const store = createStore(request);
    const plugin = createPlugin(1);
    store.setSelectedSourceId("source-a");
    await vi.waitFor(() => expect(store.hasLoadedInstalled).toBe(true));

    const sourceAInstall = store.installPlugin(plugin);
    store.setSelectedSourceId("source-b");
    await vi.waitFor(() => expect(store.hasLoadedInstalled).toBe(true));
    const sourceBInstall = store.installPlugin(plugin);

    installA.resolve({ ok: true });
    await sourceAInstall;
    expect(store.isPluginBusy(plugin.id)).toBe(true);

    installB.resolve({ ok: true });
    await sourceBInstall;
    expect(store.isPluginBusy(plugin.id)).toBe(false);
  });
});

/** Creates the root surface required by the plugin store. */
function createStore(request: RootStore["request"]): PluginsStore {
  return new PluginsStore({
    request,
    sourcesStore: {
      isSourceReady: vi.fn(() => true)
    }
  } as unknown as RootStore);
}

/** Creates one installed-only result. */
function createInstalledResult(sourceId: string | null) {
  return {
    sourceId,
    plugins: [],
    loadErrors: []
  };
}

/** Creates deterministic plugin summaries for bounded-page assertions. */
function createPlugins(count: number, start = 0): OpenCodexPluginSummary[] {
  return Array.from({ length: count }, (_, index) => createPlugin(start + index));
}

/** Creates one complete protocol plugin summary. */
function createPlugin(index: number): OpenCodexPluginSummary {
  return {
    id: `plugin-${index}`,
    name: `plugin-${index}`,
    marketplaceName: "official",
    marketplaceDisplayName: "Official",
    marketplacePath: null,
    displayName: `Plugin ${index}`,
    shortDescription: null,
    longDescription: null,
    developerName: null,
    category: null,
    capabilities: [],
    keywords: [],
    installed: false,
    enabled: true,
    installPolicy: "available",
    availability: "available",
    authPolicy: "ON_USE",
    sourceType: "remote",
    logoUrl: null,
    composerIconUrl: null,
    isFeatured: false
  };
}

/** Creates a manually resolvable promise for stale-response tests. */
function createDeferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}
