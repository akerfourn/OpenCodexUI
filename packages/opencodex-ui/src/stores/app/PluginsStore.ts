import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexInstalledPluginListResult,
  OpenCodexPluginCatalogRefreshResult,
  OpenCodexPluginDetail,
  OpenCodexPluginSearchResult,
  OpenCodexPluginSummary,
  OpenCodexRequest,
  OpenCodexSource
} from "@open-codex-ui/opencodex-protocol";

import type { RootChildStore } from "../RootChildStore";
import type { RootStore } from "../RootStore";
import { PluginActionsStore } from "./PluginActionsStore";
import {
  combinePlugins,
  filterPlugins,
  readPluginCategories,
  readPluginErrorMessage
} from "./pluginStoreCollections";
import { PluginRequestTracker } from "./pluginRequestTracker";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 50;
const MAX_RENDERED_PLUGINS = 200;

/** Filter applied to plugin installation state. */
export type PluginInstallFilter = "all" | "installed" | "available";

/** Stores bounded plugin discovery state for one selected source. */
export class PluginsStore implements RootChildStore {
  /** Source currently used for plugin requests. */
  selectedSourceId: string | null = null;
  /** Plugins returned by the lightweight installed-only endpoint. */
  installedPlugins: OpenCodexPluginSummary[] = [];
  /** Bounded plugin pages returned by catalog search. */
  catalogPlugins: OpenCodexPluginSummary[] = [];
  /** Non-fatal marketplace loading errors. */
  loadErrors: string[] = [];
  /** Search term sent to Codex's paginated search endpoint. */
  searchTerm = "";
  /** Selected category among the currently loaded bounded results. */
  selectedCategory = "";
  /** Selected install-state filter. */
  installFilter: PluginInstallFilter = "all";
  /** Whether installed plugins have been loaded for the current source. */
  hasLoadedInstalled = false;
  /** Whether a first bounded catalog page has been loaded. */
  hasLoadedCatalog = false;
  /** Whether installed plugins are loading. */
  isLoadingInstalled = false;
  /** Whether a bounded catalog page is loading. */
  isLoadingCatalog = false;
  /** Whether an explicit remote catalog refresh is running. */
  isRefreshingCatalog = false;
  /** Last plugin operation error shown by the UI. */
  errorMessage: string | null = null;
  /** Cursor for the next bounded catalog page. */
  nextCursor: string | null = null;
  /** Non-observable request identity and debounce bookkeeping. */
  private readonly requests = new PluginRequestTracker();
  /** Detail and installation actions kept separate from catalog pagination. */
  private readonly actions: PluginActionsStore;

  /** Creates the plugins store. */
  constructor(private readonly root: RootStore) {
    this.actions = new PluginActionsStore({
      request: <TResponse>(request: OpenCodexRequest) => root.request<TResponse>(request),
      getSourceId: () => this.selectedSourceId,
      reloadLists: () => this.reloadListsAfterMutation(),
      reportError: (message) => this.setErrorMessage(message)
    });
    makeAutoObservable<PluginsStore, "root" | "requests" | "actions">(
      this,
      { root: false, requests: false, actions: false },
      { autoBind: true }
    );
  }

  /** This store currently has no event-driven state. */
  handleEvent(_event: OpenCodexEvent): void {
    return;
  }

  /** Deduplicated plugins from installed state and bounded search pages. */
  get plugins(): OpenCodexPluginSummary[] {
    return combinePlugins(this.installedPlugins, this.catalogPlugins);
  }

  /** Categories present in the bounded result set currently held by the UI. */
  get categories(): string[] {
    return readPluginCategories(this.plugins);
  }

  /** Plugins after local category and install-state presentation filters. */
  get visiblePlugins(): OpenCodexPluginSummary[] {
    return filterPlugins(this.plugins, this.installFilter, this.selectedCategory)
      .slice(0, MAX_RENDERED_PLUGINS);
  }

  /** Whether Codex advertised another bounded catalog page. */
  get hasMoreCatalogPlugins(): boolean {
    return this.nextCursor !== null && this.catalogPlugins.length < MAX_RENDERED_PLUGINS;
  }

  /** Whether the renderer bound was reached while more results remain. */
  get hasReachedCatalogDisplayLimit(): boolean {
    return this.nextCursor !== null && this.catalogPlugins.length >= MAX_RENDERED_PLUGINS;
  }

  /** Whether any non-detail plugin loading operation is active. */
  get isLoading(): boolean {
    return this.isLoadingInstalled || this.isLoadingCatalog || this.isRefreshingCatalog;
  }

  /** Detail currently opened in the plugin modal. */
  get selectedPluginDetail(): OpenCodexPluginDetail | null {
    return this.actions.selectedPluginDetail;
  }

  /** Whether plugin details are loading. */
  get isLoadingDetail(): boolean {
    return this.actions.isLoadingDetail;
  }

  /** Selects the default source unless a valid source is already selected. */
  selectDefaultSource(sources: OpenCodexSource[], defaultSourceId: string | null): void {
    const fallbackSourceId = defaultSourceId ?? sources[0]?.id ?? null;
    const selectedSourceExists = this.selectedSourceId !== null &&
      sources.some((source) => source.id === this.selectedSourceId);

    if (this.selectedSourceId !== null && selectedSourceExists) {
      return;
    }

    this.setSelectedSourceId(fallbackSourceId);
  }

  /** Changes the source and loads only its lightweight installed state. */
  setSelectedSourceId(sourceId: string | null): void {
    if (this.selectedSourceId === sourceId) {
      return;
    }

    this.requests.invalidateAll();
    this.selectedSourceId = sourceId;
    this.clearPluginData();

    if (this.isSourceReady(sourceId)) {
      void this.loadInstalled();
    }
  }

  /** Ensures installed plugins are loaded when a selected source becomes ready. */
  async ensureInstalledLoaded(): Promise<void> {
    if (this.hasLoadedInstalled || this.isLoadingInstalled) {
      return;
    }

    await this.loadInstalled();
  }

  /** Updates the search term and schedules a bounded server-side search. */
  setSearchTerm(searchTerm: string): void {
    this.searchTerm = searchTerm;

    if (this.hasLoadedCatalog) {
      this.requests.invalidateCatalog();
      this.isLoadingCatalog = false;
      this.nextCursor = null;
      this.scheduleCatalogSearch();
    }
  }

  /** Updates the selected plugin category. */
  setSelectedCategory(category: string): void {
    this.selectedCategory = category;
  }

  /** Updates the selected install-state filter. */
  setInstallFilter(filter: PluginInstallFilter): void {
    this.installFilter = filter;
  }

  /** Checks whether a plugin mutation is in flight. */
  isPluginBusy(pluginId: string): boolean {
    return this.actions.isPluginBusy(pluginId);
  }

  /** Loads installed plugins without requesting the complete remote catalog. */
  async loadInstalled(force = false): Promise<void> {
    const sourceId = this.selectedSourceId;

    if (!this.isSourceReady(sourceId) || (this.isLoadingInstalled && !force)) {
      return;
    }

    const requestId = this.requests.beginInstalled();
    this.isLoadingInstalled = true;
    this.errorMessage = null;

    try {
      const result = await this.root.request<OpenCodexInstalledPluginListResult>({
        type: "plugins.installed",
        sourceId
      });

      runInAction(() => {
        if (!this.requests.matchesInstalled(
          requestId,
          sourceId,
          this.selectedSourceId,
          result.sourceId
        )) {
          return;
        }

        this.installedPlugins = result.plugins;
        this.loadErrors = result.loadErrors;
        this.hasLoadedInstalled = true;
        this.resetUnavailableCategory();
      });
    } catch (error) {
      runInAction(() => {
        if (this.requests.isCurrentInstalled(requestId) && sourceId === this.selectedSourceId) {
          this.errorMessage = readPluginErrorMessage(error);
        }
      });
    } finally {
      runInAction(() => {
        if (this.requests.isCurrentInstalled(requestId)) {
          this.isLoadingInstalled = false;
        }
      });
    }
  }

  /** Explicitly loads the first bounded catalog page. */
  async loadCatalog(): Promise<void> {
    this.requests.clearScheduledSearch();
    await this.searchCatalog(true);
  }

  /** Loads the next bounded catalog page when Codex provided a cursor. */
  async loadMoreCatalogPlugins(): Promise<void> {
    if (!this.hasMoreCatalogPlugins || this.isLoadingCatalog) {
      return;
    }

    await this.searchCatalog(false);
  }

  /** Explicitly refreshes the remote catalog, then reloads bounded state. */
  async refreshCatalog(): Promise<void> {
    const sourceId = this.selectedSourceId;

    if (!this.isSourceReady(sourceId) || this.isRefreshingCatalog) {
      return;
    }

    const requestId = this.requests.beginRefresh();
    this.isRefreshingCatalog = true;
    this.errorMessage = null;

    try {
      const result = await this.root.request<OpenCodexPluginCatalogRefreshResult>({
        type: "plugins.refresh",
        sourceId
      });

      if (!this.requests.matchesRefresh(requestId, sourceId, this.selectedSourceId)) {
        return;
      }

      runInAction(() => {
        this.loadErrors = result.loadErrors;
      });
      await Promise.all([this.loadInstalled(true), this.searchCatalog(true)]);
      runInAction(() => {
        if (this.requests.matchesRefresh(requestId, sourceId, this.selectedSourceId)) {
          this.loadErrors = Array.from(new Set([...result.loadErrors, ...this.loadErrors]));
        }
      });
    } catch (error) {
      runInAction(() => {
        if (this.requests.matchesRefresh(requestId, sourceId, this.selectedSourceId)) {
          this.errorMessage = readPluginErrorMessage(error);
        }
      });
    } finally {
      runInAction(() => {
        if (this.requests.isCurrentRefresh(requestId)) {
          this.isRefreshingCatalog = false;
        }
      });
    }
  }

  /** Loads and opens plugin detail. */
  async openPlugin(plugin: OpenCodexPluginSummary): Promise<void> {
    await this.actions.openPlugin(plugin);
  }

  /** Closes the selected plugin detail and invalidates an in-flight read. */
  closePluginDetail(): void {
    this.actions.closePluginDetail();
  }

  /** Installs a marketplace plugin into the selected source. */
  async installPlugin(plugin: OpenCodexPluginSummary): Promise<void> {
    await this.actions.installPlugin(plugin);
  }

  /** Uninstalls a plugin from the selected source. */
  async uninstallPlugin(plugin: OpenCodexPluginSummary): Promise<void> {
    await this.actions.uninstallPlugin(plugin);
  }

  /** Runs one bounded search page and ignores stale source or query responses. */
  private async searchCatalog(reset: boolean): Promise<void> {
    const sourceId = this.selectedSourceId;

    if (!this.isSourceReady(sourceId)) {
      return;
    }

    const cursor = reset ? null : this.nextCursor;

    if (!reset && cursor === null) {
      return;
    }

    const searchTerm = this.searchTerm.trim();
    const requestId = this.requests.beginCatalog();
    this.isLoadingCatalog = true;
    this.errorMessage = null;

    try {
      const result = await this.root.request<OpenCodexPluginSearchResult>({
        type: "plugins.search",
        sourceId,
        searchTerm,
        cursor,
        limit: SEARCH_PAGE_SIZE
      });

      runInAction(() => {
        if (!this.requests.matchesCatalog(
          requestId,
          sourceId,
          this.selectedSourceId,
          searchTerm,
          this.searchTerm.trim(),
          result.sourceId
        )) {
          return;
        }

        this.catalogPlugins = reset
          ? result.plugins
          : combinePlugins(result.plugins, this.catalogPlugins).slice(0, MAX_RENDERED_PLUGINS);
        this.nextCursor = result.nextCursor;
        this.loadErrors = result.loadErrors;
        this.hasLoadedCatalog = true;
        this.resetUnavailableCategory();
      });
    } catch (error) {
      runInAction(() => {
        if (this.requests.matchesCatalog(
          requestId,
          sourceId,
          this.selectedSourceId,
          searchTerm,
          this.searchTerm.trim(),
          sourceId
        )) {
          this.errorMessage = readPluginErrorMessage(error);
        }
      });
    } finally {
      runInAction(() => {
        if (this.requests.isCurrentCatalog(requestId)) {
          this.isLoadingCatalog = false;
        }
      });
    }
  }

  /** Schedules a replacement first page after the user pauses typing. */
  private scheduleCatalogSearch(): void {
    this.requests.scheduleSearch(SEARCH_DEBOUNCE_MS, () => {
      void this.searchCatalog(true);
    });
  }

  /** Reloads bounded list state after plugin installation changes. */
  private async reloadListsAfterMutation(): Promise<void> {
    const reloads: Promise<void>[] = [this.loadInstalled(true)];

    if (this.hasLoadedCatalog) {
      reloads.push(this.searchCatalog(true));
    }

    await Promise.all(reloads);
  }

  /** Returns whether one source can currently serve plugin requests. */
  private isSourceReady(sourceId: string | null): sourceId is string {
    return sourceId !== null && this.root.sourcesStore.isSourceReady(sourceId);
  }

  /** Clears category selection when it no longer exists in loaded bounded data. */
  private resetUnavailableCategory(): void {
    if (this.selectedCategory.length > 0 && !this.categories.includes(this.selectedCategory)) {
      this.selectedCategory = "";
    }
  }

  /** Clears source-specific plugin state while retaining user search preferences. */
  private clearPluginData(): void {
    this.installedPlugins = [];
    this.catalogPlugins = [];
    this.loadErrors = [];
    this.selectedCategory = "";
    this.actions.reset();
    this.hasLoadedInstalled = false;
    this.hasLoadedCatalog = false;
    this.isLoadingInstalled = false;
    this.isLoadingCatalog = false;
    this.isRefreshingCatalog = false;
    this.nextCursor = null;
    this.errorMessage = null;
  }

  /** Applies a child action error inside the outer MobX store. */
  private setErrorMessage(message: string | null): void {
    this.errorMessage = message;
  }
}
