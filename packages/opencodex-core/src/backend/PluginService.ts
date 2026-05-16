import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexPluginDetail,
  OpenCodexPluginInstallResult,
  OpenCodexPluginListResult
} from "@open-codex-ui/opencodex-protocol";

import {
  mapPluginApp,
  mapPluginDetail,
  mapPluginListResponse
} from "./pluginMapping.js";

type PluginServiceOptions = {
  ensureClient(sourceId: string | null): Promise<CodexAppServerClient>;
};

type PluginTarget = {
  sourceId: string | null;
  marketplaceName: string;
  marketplacePath: string | null;
  pluginName: string;
};

export class PluginService {
  constructor(private readonly options: PluginServiceOptions) {}

  /**
   * Lists plugins visible from one Codex source.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   * @returns Plugin marketplaces exposed by Codex.
   */
  async list(sourceId: string | null): Promise<OpenCodexPluginListResult> {
    const client = await this.options.ensureClient(sourceId);
    const response = await client.request<v2.PluginListResponse>("plugin/list", {});

    return mapPluginListResponse(response, sourceId);
  }

  /**
   * Reads detailed metadata for one plugin.
   *
   * @param target Plugin identity in a marketplace.
   * @returns Plugin detail.
   */
  async read(target: PluginTarget): Promise<OpenCodexPluginDetail> {
    const client = await this.options.ensureClient(target.sourceId);
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
    const client = await this.options.ensureClient(target.sourceId);
    const response = await client.request<v2.PluginInstallResponse>("plugin/install", {
      ...createMarketplaceParams(target),
      pluginName: target.pluginName
    });

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
    const client = await this.options.ensureClient(sourceId);
    await client.request<v2.PluginUninstallResponse>("plugin/uninstall", { pluginId });

    return { ok: true };
  }
}

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
