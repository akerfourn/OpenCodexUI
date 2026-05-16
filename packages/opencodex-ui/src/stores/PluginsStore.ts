import Fuse from "fuse.js";
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexPluginDetail,
  OpenCodexPluginListResult,
  OpenCodexPluginMarketplace,
  OpenCodexPluginSummary,
  OpenCodexSource
} from "@open-codex-ui/opencodex-protocol";

import type { RootChildStore } from "./RootChildStore";
import type { RootStore } from "./RootStore";

export type PluginInstallFilter = "all" | "installed" | "available";

/**
 * Stores the experimental plugin marketplace state for one selected source.
 */
export class PluginsStore implements RootChildStore {
  selectedSourceId: string | null = null;
  marketplaces: OpenCodexPluginMarketplace[] = [];
  featuredPluginIds: string[] = [];
  categories: string[] = [];
  loadErrors: string[] = [];
  searchTerm = "";
  selectedCategory = "";
  installFilter: PluginInstallFilter = "all";
  selectedPluginDetail: OpenCodexPluginDetail | null = null;
  isLoading = false;
  isLoadingDetail = false;
  errorMessage: string | null = null;
  private busyPluginIds: string[] = [];

  constructor(private readonly root: RootStore) {
    makeAutoObservable<PluginsStore, "root">(this, { root: false }, { autoBind: true });
  }

  handleEvent(_event: OpenCodexEvent): void {
    return;
  }

  get plugins(): OpenCodexPluginSummary[] {
    return this.marketplaces.flatMap((marketplace) => marketplace.plugins);
  }

  get visiblePlugins(): OpenCodexPluginSummary[] {
    const filteredPlugins = this.plugins.filter((plugin) => this.matchesFilters(plugin));
    const normalizedSearchTerm = this.searchTerm.trim();

    if (normalizedSearchTerm.length === 0) {
      return [...filteredPlugins].sort(comparePlugins);
    }

    const fuse = new Fuse(filteredPlugins, {
      includeScore: true,
      keys: [
        { name: "displayName", weight: 0.5 },
        { name: "name", weight: 0.3 },
        { name: "shortDescription", weight: 0.2 },
        { name: "developerName", weight: 0.15 },
        { name: "keywords", weight: 0.15 }
      ],
      threshold: 0.38
    });

    return fuse.search(normalizedSearchTerm).map((result) => result.item);
  }

  selectDefaultSource(sources: OpenCodexSource[], defaultSourceId: string | null): void {
    const fallbackSourceId = defaultSourceId ?? sources[0]?.id ?? null;
    const selectedSourceExists = this.selectedSourceId !== null &&
      sources.some((source) => source.id === this.selectedSourceId);

    if (this.selectedSourceId !== null && selectedSourceExists) {
      return;
    }

    this.setSelectedSourceId(fallbackSourceId);
  }

  setSelectedSourceId(sourceId: string | null): void {
    if (this.selectedSourceId === sourceId) {
      return;
    }

    this.selectedSourceId = sourceId;
    this.clearPluginData();

    if (sourceId !== null) {
      void this.load();
    }
  }

  setSearchTerm(searchTerm: string): void {
    this.searchTerm = searchTerm;
  }

  setSelectedCategory(category: string): void {
    this.selectedCategory = category;
  }

  setInstallFilter(filter: PluginInstallFilter): void {
    this.installFilter = filter;
  }

  isPluginBusy(pluginId: string): boolean {
    return this.busyPluginIds.includes(pluginId);
  }

  async load(): Promise<void> {
    if (this.selectedSourceId === null) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    try {
      const result = await this.root.request<OpenCodexPluginListResult>({
        type: "plugins.list",
        sourceId: this.selectedSourceId
      });
      runInAction(() => {
        this.applyListResult(result);
      });
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async openPlugin(plugin: OpenCodexPluginSummary): Promise<void> {
    this.isLoadingDetail = true;
    this.errorMessage = null;

    try {
      const detail = await this.root.request<OpenCodexPluginDetail>({
        type: "plugins.read",
        sourceId: this.selectedSourceId,
        marketplaceName: plugin.marketplaceName,
        marketplacePath: plugin.marketplacePath,
        pluginName: plugin.name
      });
      runInAction(() => {
        this.selectedPluginDetail = detail;
      });
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isLoadingDetail = false;
      });
    }
  }

  closePluginDetail(): void {
    this.selectedPluginDetail = null;
  }

  async installPlugin(plugin: OpenCodexPluginSummary): Promise<void> {
    this.markPluginBusy(plugin.id);

    try {
      await this.root.request({
        type: "plugins.install",
        sourceId: this.selectedSourceId,
        marketplaceName: plugin.marketplaceName,
        marketplacePath: plugin.marketplacePath,
        pluginName: plugin.name
      });
      await this.load();
      await this.refreshSelectedDetail(plugin);
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.unmarkPluginBusy(plugin.id);
      });
    }
  }

  async uninstallPlugin(plugin: OpenCodexPluginSummary): Promise<void> {
    this.markPluginBusy(plugin.id);

    try {
      await this.root.request({
        type: "plugins.uninstall",
        sourceId: this.selectedSourceId,
        pluginId: plugin.id
      });
      await this.load();
      await this.refreshSelectedDetail(plugin);
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.unmarkPluginBusy(plugin.id);
      });
    }
  }

  private async refreshSelectedDetail(plugin: OpenCodexPluginSummary): Promise<void> {
    if (this.selectedPluginDetail?.summary.id !== plugin.id) {
      return;
    }

    await this.openPlugin(plugin);
  }

  private applyListResult(result: OpenCodexPluginListResult): void {
    this.marketplaces = result.marketplaces;
    this.featuredPluginIds = result.featuredPluginIds;
    this.categories = result.categories;
    this.loadErrors = result.loadErrors;

    if (this.selectedCategory.length > 0 && !result.categories.includes(this.selectedCategory)) {
      this.selectedCategory = "";
    }
  }

  private matchesFilters(plugin: OpenCodexPluginSummary): boolean {
    if (this.selectedCategory.length > 0 && plugin.category !== this.selectedCategory) {
      return false;
    }

    if (this.installFilter === "installed") {
      return plugin.installed;
    }

    if (this.installFilter === "available") {
      return !plugin.installed && plugin.installPolicy === "available";
    }

    return true;
  }

  private clearPluginData(): void {
    this.marketplaces = [];
    this.featuredPluginIds = [];
    this.categories = [];
    this.loadErrors = [];
    this.selectedPluginDetail = null;
    this.errorMessage = null;
  }

  private markPluginBusy(pluginId: string): void {
    if (!this.busyPluginIds.includes(pluginId)) {
      this.busyPluginIds = [...this.busyPluginIds, pluginId];
    }
  }

  private unmarkPluginBusy(pluginId: string): void {
    this.busyPluginIds = this.busyPluginIds.filter((entry) => entry !== pluginId);
  }
}

function comparePlugins(left: OpenCodexPluginSummary, right: OpenCodexPluginSummary): number {
  if (left.isFeatured && !right.isFeatured) {
    return -1;
  }

  if (!left.isFeatured && right.isFeatured) {
    return 1;
  }

  if (left.installed && !right.installed) {
    return -1;
  }

  if (!left.installed && right.installed) {
    return 1;
  }

  return left.displayName.localeCompare(right.displayName);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
