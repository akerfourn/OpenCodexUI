import type { v2 } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexPluginDetail,
  OpenCodexInstalledPluginListResult,
  OpenCodexPluginCatalogRefreshResult,
  OpenCodexPluginInstallResult,
  OpenCodexPluginListResult,
  OpenCodexPluginSearchResult,
  OpenCodexPluginSummary
} from "@open-codex-ui/opencodex-protocol";

import {
  mapInstalledPluginListResponse,
  mapPluginApp,
  mapPluginDetail,
  mapPluginListResponse,
  mapPluginSearchResponse
} from "./pluginMapping.js";
import type { ClientPort } from "../runtime/runtimePorts.js";

/** Dependencies used by the plugin service. */
type PluginServiceOptions = {
  /** Codex client lifecycle operations used by plugin requests. */
  clients: Pick<ClientPort, "ensureClient">;
};

type PluginTarget = {
  sourceId: string | null;
  marketplaceName: string;
  marketplacePath: string | null;
  pluginName: string;
};

const DEFAULT_SEARCH_LIMIT = 50;
const MAX_CACHED_CATALOGS = 3;
const MAX_SEARCH_LIMIT = 100;

type CachedPluginCatalog = {
  plugins: OpenCodexPluginSummary[];
  loadErrors: string[];
};

/**
 * Coordinates plugin marketplace calls through Codex app-server.
 */
export class PluginService {
  /** Sorted catalogs retained in the backend so only bounded pages cross IPC. */
  private readonly catalogCache = new Map<string | null, CachedPluginCatalog>();

  /**
   * Creates a plugin service.
   *
   * @param options Codex client resolver.
   */
  constructor(private readonly options: PluginServiceOptions) {}

  /**
   * Lists plugins visible from one Codex source.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   * @returns Plugin marketplaces exposed by Codex.
   */
  async list(sourceId: string | null): Promise<OpenCodexPluginListResult> {
    const client = await this.options.clients.ensureClient(sourceId);
    const response = await client.request<v2.PluginListResponse>("plugin/list", {});
    const result = mapPluginListResponse(response, sourceId);

    this.cacheCatalog(sourceId, result);
    return result;
  }

  /**
   * Lists only installed plugins for one source.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   * @returns Installed plugins without loading the entire catalog in the UI.
   */
  async installed(sourceId: string | null): Promise<OpenCodexInstalledPluginListResult> {
    const client = await this.options.clients.ensureClient(sourceId);
    const response = await client.request<v2.PluginInstalledResponse>("plugin/installed", {});

    return mapInstalledPluginListResponse(response, sourceId);
  }

  /**
   * Searches the catalog through Codex's bounded cursor API.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   * @param searchTerm Search text; an empty value browses the catalog.
   * @param cursor Optional continuation cursor.
   * @param limit Requested page size.
   * @returns One bounded plugin page.
   */
  async search(
    sourceId: string | null,
    searchTerm: string,
    cursor: string | null = null,
    limit: number = DEFAULT_SEARCH_LIMIT
  ): Promise<OpenCodexPluginSearchResult> {
    const normalizedLimit = normalizeSearchLimit(limit);

    if (searchTerm.trim().length === 0) {
      return await this.browse(sourceId, cursor, normalizedLimit);
    }

    const client = await this.options.clients.ensureClient(sourceId);
    const response = await client.request<v2.PluginSearchResponse>("plugin/search", {
      searchTerm,
      cursor,
      limit: normalizedLimit
    });

    return mapPluginSearchResponse(response, sourceId);
  }

  /**
   * Explicitly refreshes Codex's remote catalog without forwarding it to the renderer.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   * @returns Refresh outcome and non-fatal marketplace errors.
   */
  async refresh(sourceId: string | null): Promise<OpenCodexPluginCatalogRefreshResult> {
    const client = await this.options.clients.ensureClient(sourceId);
    const response = await client.request<v2.PluginListResponse>("plugin/list", {
      forceRefetch: true
    });
    const result = mapPluginListResponse(response, sourceId);

    this.cacheCatalog(sourceId, result);

    return {
      ok: true,
      loadErrors: result.loadErrors
    };
  }

  /**
   * Reads detailed metadata for one plugin.
   *
   * @param target Plugin identity in a marketplace.
   * @returns Plugin detail.
   */
  async read(target: PluginTarget): Promise<OpenCodexPluginDetail> {
    const client = await this.options.clients.ensureClient(target.sourceId);
    const response = await client.request<v2.PluginReadResponse>("plugin/read", {
      ...createMarketplaceParams(target),
      pluginName: target.pluginName
    });

    return mapPluginDetail(response.plugin);
  }

  /**
   * Installs one plugin through Codex.
   *
   * @param target Plugin identity in a marketplace.
   * @returns Installation metadata.
   */
  async install(target: PluginTarget): Promise<OpenCodexPluginInstallResult> {
    const client = await this.options.clients.ensureClient(target.sourceId);
    const response = await client.request<v2.PluginInstallResponse>("plugin/install", {
      ...createMarketplaceParams(target),
      pluginName: target.pluginName
    });

    this.catalogCache.delete(target.sourceId);

    return {
      ok: true,
      authPolicy: response.authPolicy,
      appsNeedingAuth: response.appsNeedingAuth.map(mapPluginApp)
    };
  }

  /**
   * Uninstalls one plugin through Codex.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   * @param pluginId Installed plugin identifier.
   * @returns Success result.
   */
  async uninstall(sourceId: string | null, pluginId: string): Promise<{ ok: true }> {
    const client = await this.options.clients.ensureClient(sourceId);
    await client.request<v2.PluginUninstallResponse>("plugin/uninstall", { pluginId });
    this.catalogCache.delete(sourceId);

    return { ok: true };
  }

  /**
   * Reads one page from a backend-only full catalog cache.
   *
   * @param sourceId Source owning the catalog.
   * @param cursor Backend browse cursor.
   * @param limit Bounded page size.
   * @returns One page safe to transfer through IPC.
   */
  private async browse(
    sourceId: string | null,
    cursor: string | null,
    limit: number
  ): Promise<OpenCodexPluginSearchResult> {
    let cachedCatalog = this.catalogCache.get(sourceId);

    if (cachedCatalog === undefined) {
      const catalog = await this.list(sourceId);
      cachedCatalog = this.catalogCache.get(sourceId) ?? createCachedCatalog(catalog);
    }

    const offset = readBrowseOffset(cursor);
    const nextOffset = Math.min(cachedCatalog.plugins.length, offset + limit);

    return {
      sourceId,
      plugins: cachedCatalog.plugins.slice(offset, nextOffset),
      nextCursor: nextOffset < cachedCatalog.plugins.length ? `browse:${nextOffset}` : null,
      loadErrors: cachedCatalog.loadErrors
    };
  }

  /** Retains a bounded number of source catalogs in least-recently-written order. */
  private cacheCatalog(sourceId: string | null, catalog: OpenCodexPluginListResult): void {
    this.catalogCache.delete(sourceId);
    this.catalogCache.set(sourceId, createCachedCatalog(catalog));

    while (this.catalogCache.size > MAX_CACHED_CATALOGS) {
      const oldestSourceId = this.catalogCache.keys().next().value;

      if (oldestSourceId === undefined) {
        return;
      }

      this.catalogCache.delete(oldestSourceId);
    }
  }
}

/**
 * Creates the marketplace selector expected by Codex plugin methods.
 *
 * @param target Plugin target selected by the UI.
 * @returns Marketplace params using either local path or remote name.
 */
function createMarketplaceParams(target: PluginTarget) {
  if (target.marketplacePath !== null) {
    return {
      marketplacePath: target.marketplacePath,
      remoteMarketplaceName: null
    };
  }

  return {
    marketplacePath: null,
    remoteMarketplaceName: target.marketplaceName
  };
}

/**
 * Bounds a caller-provided search page size.
 *
 * @param limit Requested result count.
 * @returns Safe integer page size accepted by Codex.
 */
function normalizeSearchLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_SEARCH_LIMIT;
  }

  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.trunc(limit)));
}

/** Reads a backend browse offset without trusting a renderer-provided cursor. */
function readBrowseOffset(cursor: string | null): number {
  if (cursor === null || !/^browse:\d+$/.test(cursor)) {
    return 0;
  }

  const offset = Number.parseInt(cursor.slice("browse:".length), 10);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

/** Sorts backend catalog entries before slicing a deterministic browse page. */
function comparePlugins(left: OpenCodexPluginSummary, right: OpenCodexPluginSummary): number {
  if (left.isFeatured !== right.isFeatured) {
    return left.isFeatured ? -1 : 1;
  }

  if (left.installed !== right.installed) {
    return left.installed ? -1 : 1;
  }

  return left.displayName.localeCompare(right.displayName);
}

/** Flattens and sorts a full catalog once before it enters the backend cache. */
function createCachedCatalog(catalog: OpenCodexPluginListResult): CachedPluginCatalog {
  return {
    plugins: catalog.marketplaces
      .flatMap((marketplace) => marketplace.plugins)
      .sort(comparePlugins),
    loadErrors: catalog.loadErrors
  };
}
