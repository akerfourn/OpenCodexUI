import type { v2 } from "@open-codex-ui/codex-rpc";
import { describe, expect, it, vi } from "vitest";

import { PluginService } from "../src/backend/support/PluginService";

describe("PluginService bounded catalog access", () => {
  it("should keep a full browse catalog in the backend and return bounded pages", async () => {
    const request = vi.fn(async (method: string) => {
      expect(method).toBe("plugin/list");
      return createPluginListResponse(120);
    });
    const service = createService(request);

    const firstPage = await service.search("source-a", "", null, 50);
    const secondPage = await service.search("source-a", "", firstPage.nextCursor, 50);

    expect(firstPage.plugins).toHaveLength(50);
    expect(firstPage.nextCursor).toBe("browse:50");
    expect(secondPage.plugins).toHaveLength(50);
    expect(secondPage.nextCursor).toBe("browse:100");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("should delegate non-empty searches to the cursor-based Codex endpoint", async () => {
    const request = vi.fn(async (method: string, params: unknown) => {
      expect(method).toBe("plugin/search");
      expect(params).toEqual({ searchTerm: "github", cursor: null, limit: 25 });

      return {
        data: [{
          plugin: createPluginSummary(1),
          marketplaceName: "official",
          marketplacePath: null
        }],
        nextCursor: "remote-cursor"
      } satisfies v2.PluginSearchResponse;
    });
    const service = createService(request);

    const result = await service.search("source-a", "github", null, 25);

    expect(result.plugins).toHaveLength(1);
    expect(result.nextCursor).toBe("remote-cursor");
  });

  it("should force a remote refresh without returning its full catalog", async () => {
    const response = createPluginListResponse(120);
    response.marketplaceLoadErrors = [{ message: "one marketplace failed" }];
    const request = vi.fn(async (_method: string, params: unknown) => {
      expect(params).toEqual({ forceRefetch: true });
      return response;
    });
    const service = createService(request);

    const result = await service.refresh("source-a");

    expect(result).toEqual({ ok: true, loadErrors: ["one marketplace failed"] });
    expect(result).not.toHaveProperty("marketplaces");

    await service.search("source-a", "", null, 50);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("should load installed plugins through the lightweight Codex endpoint", async () => {
    const response = createPluginListResponse(1);
    const request = vi.fn(async (method: string, params: unknown) => {
      expect(method).toBe("plugin/installed");
      expect(params).toEqual({});
      return {
        marketplaces: response.marketplaces,
        marketplaceLoadErrors: []
      } satisfies v2.PluginInstalledResponse;
    });
    const service = createService(request);

    const result = await service.installed("source-a");

    expect(result.sourceId).toBe("source-a");
    expect(result.plugins).toHaveLength(1);
  });
});

/** Creates a plugin service over one deterministic fake app-server client. */
function createService(request: ReturnType<typeof vi.fn>): PluginService {
  return new PluginService({
    clients: {
      ensureClient: vi.fn(async () => ({ request }))
    }
  });
}

/** Creates a full catalog response with a deterministic number of plugins. */
function createPluginListResponse(pluginCount: number): v2.PluginListResponse {
  return {
    featuredPluginIds: [],
    marketplaceLoadErrors: [],
    marketplaces: [{
      name: "official",
      path: null,
      interface: { displayName: "Official" },
      plugins: Array.from({ length: pluginCount }, (_, index) => createPluginSummary(index))
    }]
  };
}

/** Creates the subset of a generated plugin summary consumed by mapping code. */
function createPluginSummary(index: number): v2.PluginSummary {
  return {
    id: `plugin-${index}`,
    name: `plugin-${String(index).padStart(4, "0")}`,
    source: { type: "remote" },
    installed: false,
    enabled: true,
    installPolicy: "AVAILABLE",
    authPolicy: "ON_USE",
    availability: "AVAILABLE",
    keywords: [],
    interface: null
  } as v2.PluginSummary;
}
