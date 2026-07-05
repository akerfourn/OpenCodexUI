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

/** Filter applied to plugin installation state. */
export type PluginInstallFilter = "all" | "installed" | "available";

/**
 * Stores the experimental plugin marketplace state for one selected source.
 */
export class PluginsStore implements RootChildStore {
  /** Source currently used to query plugin marketplaces. */
  selectedSourceId: string | null = null;
  /** Marketplace payloads returned by Codex. */
  marketplaces: OpenCodexPluginMarketplace[] = [];
  /** Plugin ids featured by marketplaces. */
  featuredPluginIds: string[] = [];
  /** Categories returned by marketplaces. */
  categories: string[] = [];
  /** Non-fatal marketplace loading errors. */
  loadErrors: string[] = [];
  /** Fuzzy search term applied to plugins. */
  searchTerm = "";
  /** Selected category filter. */
  selectedCategory = "";
  /** Selected install-state filter. */
  installFilter: PluginInstallFilter = "all";
  /** Detail currently opened in the plugin modal. */
  selectedPluginDetail: OpenCodexPluginDetail | null = null;
  /** Whether the plugin list is loading. */
  isLoading = false;
  /** Whether plugin details are loading. */
  isLoadingDetail = false;
  /** Last plugin operation error shown by the UI. */
  errorMessage: string | null = null;
  /** Plugin ids currently being installed or uninstalled. */
  private busyPluginIds: string[] = [];

  /**
   * Creates the plugins store.
   *
   * @param root Root store used for backend requests and source readiness.
   */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<PluginsStore, "root">(this, { root: false }, { autoBind: true });
  }

  /**
   * This store currently has no event-driven state.
   *
   * @param event Backend event.
   */
  handleEvent(_event: OpenCodexEvent): void {
    return;
  }

  /** Flat plugin list across all loaded marketplaces. */
  get plugins(): OpenCodexPluginSummary[] {
    return this.marketplaces.flatMap((marketplace) => marketplace.plugins);
  }

  /** Plugins after category, install-state, and fuzzy-search filters. */
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

  /**
   * Selects the default source unless a valid source is already selected.
   *
   * @param sources Available sources.
   * @param defaultSourceId Default source id from settings.
   */
  selectDefaultSource(sources: OpenCodexSource[], defaultSourceId: string | null): void {
    const fallbackSourceId = defaultSourceId ?? sources[0]?.id ?? null;
    const selectedSourceExists = this.selectedSourceId !== null &&
      sources.some((source) => source.id === this.selectedSourceId);

    if (this.selectedSourceId !== null && selectedSourceExists) {
      return;
    }

    this.setSelectedSourceId(fallbackSourceId);
  }

  /**
   * Changes the source used by the plugin page.
   *
   * @param sourceId Source identifier.
   */
  setSelectedSourceId(sourceId: string | null): void {
    if (this.selectedSourceId === sourceId) {
      return;
    }

    this.selectedSourceId = sourceId;
    this.clearPluginData();

    if (sourceId !== null && this.root.sourcesStore.isSourceReady(sourceId)) {
      void this.load();
    }
  }

  /**
   * Updates the plugin search term.
   *
   * @param searchTerm Search text.
   */
  setSearchTerm(searchTerm: string): void {
    this.searchTerm = searchTerm;
  }

  /**
   * Updates the selected plugin category.
   *
   * @param category Category name.
   */
  setSelectedCategory(category: string): void {
    this.selectedCategory = category;
  }

  /**
   * Updates the plugin install-state filter.
   *
   * @param filter Install filter.
   */
  setInstallFilter(filter: PluginInstallFilter): void {
    this.installFilter = filter;
  }

  /**
   * Checks whether a plugin mutation is in flight.
   *
   * @param pluginId Plugin identifier.
   * @returns Whether the plugin is busy.
   */
  isPluginBusy(pluginId: string): boolean {
    return this.busyPluginIds.includes(pluginId);
  }

  /**
   * Loads plugin marketplaces for the selected source.
   *
   * @returns Promise resolved when loading completes.
   */
  async load(): Promise<void> {
    if (
      this.selectedSourceId === null ||
      !this.root.sourcesStore.isSourceReady(this.selectedSourceId)
    ) {
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

  /**
   * Loads and opens plugin detail.
   *
   * @param plugin Plugin summary.
   * @returns Promise resolved when the detail request completes.
   */
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

  /**
   * Closes the selected plugin detail.
   */
  closePluginDetail(): void {
    this.selectedPluginDetail = null;
  }

  /**
   * Installs a marketplace plugin into the selected source.
   *
   * @param plugin Plugin summary.
   * @returns Promise resolved when installation completes.
   */
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

  /**
   * Uninstalls a plugin from the selected source.
   *
   * @param plugin Plugin summary.
   * @returns Promise resolved when uninstallation completes.
   */
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

  /**
   * Refreshes the open detail when it belongs to the mutated plugin.
   *
   * @param plugin Plugin summary.
   * @returns Promise resolved when the detail has refreshed.
   */
  private async refreshSelectedDetail(plugin: OpenCodexPluginSummary): Promise<void> {
    if (this.selectedPluginDetail?.summary.id !== plugin.id) {
      return;
    }

    await this.openPlugin(plugin);
  }

  /**
   * Applies a marketplace list result.
   *
   * @param result Plugin list result.
   */
  private applyListResult(result: OpenCodexPluginListResult): void {
    this.marketplaces = result.marketplaces;
    this.featuredPluginIds = result.featuredPluginIds;
    this.categories = result.categories;
    this.loadErrors = result.loadErrors;

    if (this.selectedCategory.length > 0 && !result.categories.includes(this.selectedCategory)) {
      this.selectedCategory = "";
    }
  }

  /**
   * Checks category and install-state filters for one plugin.
   *
   * @param plugin Plugin summary.
   * @returns Whether the plugin passes filters.
   */
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

  /**
   * Clears source-specific plugin state.
   */
  private clearPluginData(): void {
    this.marketplaces = [];
    this.featuredPluginIds = [];
    this.categories = [];
    this.loadErrors = [];
    this.selectedPluginDetail = null;
    this.errorMessage = null;
  }

  /**
   * Marks a plugin as having an in-flight mutation.
   *
   * @param pluginId Plugin identifier.
   */
  private markPluginBusy(pluginId: string): void {
    if (!this.busyPluginIds.includes(pluginId)) {
      this.busyPluginIds = [...this.busyPluginIds, pluginId];
    }
  }

  /**
   * Clears a plugin busy marker.
   *
   * @param pluginId Plugin identifier.
   */
  private unmarkPluginBusy(pluginId: string): void {
    this.busyPluginIds = this.busyPluginIds.filter((entry) => entry !== pluginId);
  }
}

/**
 * Sorts plugins with featured and installed entries first.
 *
 * @param left First plugin.
 * @param right Second plugin.
 * @returns Sort comparison.
 */
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

/**
 * Converts unknown errors into displayable plugin error text.
 *
 * @param error Unknown caught error.
 * @returns Error message.
 */
function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
