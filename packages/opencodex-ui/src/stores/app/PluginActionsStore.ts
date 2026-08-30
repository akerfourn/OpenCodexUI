import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexPluginDetail,
  OpenCodexPluginSummary,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

import { readPluginErrorMessage } from "./pluginStoreCollections";

type PluginActionsStoreOptions = {
  request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse>;
  getSourceId(): string | null;
  reloadLists(): Promise<void>;
  reportError(message: string | null): void;
};

/** Owns plugin detail, installation, and uninstallation actions. */
export class PluginActionsStore {
  /** Detail currently opened in the plugin modal. */
  selectedPluginDetail: OpenCodexPluginDetail | null = null;
  /** Whether plugin details are loading. */
  isLoadingDetail = false;
  /** Source-scoped plugin keys currently being installed or uninstalled. */
  private busyPluginKeys: string[] = [];
  /** Invalidates detail responses after source changes or modal closure. */
  private detailRequestId = 0;

  /** Creates plugin actions over store-owned request and refresh callbacks. */
  constructor(private readonly options: PluginActionsStoreOptions) {
    makeAutoObservable<PluginActionsStore, "options" | "detailRequestId">(
      this,
      { options: false, detailRequestId: false },
      { autoBind: true }
    );
  }

  /** Checks whether a plugin mutation is in flight. */
  isPluginBusy(pluginId: string): boolean {
    const sourceId = this.options.getSourceId();
    return sourceId !== null && this.busyPluginKeys.includes(createBusyKey(sourceId, pluginId));
  }

  /** Loads and opens plugin detail for the current source. */
  async openPlugin(plugin: OpenCodexPluginSummary): Promise<void> {
    const sourceId = this.options.getSourceId();

    if (sourceId === null) {
      return;
    }

    const requestId = ++this.detailRequestId;
    this.isLoadingDetail = true;
    this.options.reportError(null);

    try {
      const detail = await this.options.request<OpenCodexPluginDetail>({
        type: "plugins.read",
        sourceId,
        marketplaceName: plugin.marketplaceName,
        marketplacePath: plugin.marketplacePath,
        pluginName: plugin.name
      });

      runInAction(() => {
        if (requestId === this.detailRequestId && sourceId === this.options.getSourceId()) {
          this.selectedPluginDetail = detail;
        }
      });
    } catch (error) {
      if (requestId === this.detailRequestId && sourceId === this.options.getSourceId()) {
        this.options.reportError(readPluginErrorMessage(error));
      }
    } finally {
      runInAction(() => {
        if (requestId === this.detailRequestId) {
          this.isLoadingDetail = false;
        }
      });
    }
  }

  /** Closes the selected plugin detail and invalidates an in-flight read. */
  closePluginDetail(): void {
    this.detailRequestId += 1;
    this.isLoadingDetail = false;
    this.selectedPluginDetail = null;
  }

  /** Installs a marketplace plugin into the current source. */
  async installPlugin(plugin: OpenCodexPluginSummary): Promise<void> {
    const sourceId = this.options.getSourceId();

    if (sourceId === null || this.isPluginBusy(plugin.id)) {
      return;
    }

    const busyKey = createBusyKey(sourceId, plugin.id);
    this.markPluginBusy(busyKey);
    this.options.reportError(null);

    try {
      await this.options.request({
        type: "plugins.install",
        sourceId,
        marketplaceName: plugin.marketplaceName,
        marketplacePath: plugin.marketplacePath,
        pluginName: plugin.name
      });
      await this.refreshAfterMutation(plugin, sourceId);
    } catch (error) {
      if (sourceId === this.options.getSourceId()) {
        this.options.reportError(readPluginErrorMessage(error));
      }
    } finally {
      runInAction(() => {
        this.unmarkPluginBusy(busyKey);
      });
    }
  }

  /** Uninstalls a plugin from the current source. */
  async uninstallPlugin(plugin: OpenCodexPluginSummary): Promise<void> {
    const sourceId = this.options.getSourceId();

    if (sourceId === null || this.isPluginBusy(plugin.id)) {
      return;
    }

    const busyKey = createBusyKey(sourceId, plugin.id);
    this.markPluginBusy(busyKey);
    this.options.reportError(null);

    try {
      await this.options.request({
        type: "plugins.uninstall",
        sourceId,
        pluginId: plugin.id
      });
      await this.refreshAfterMutation(plugin, sourceId);
    } catch (error) {
      if (sourceId === this.options.getSourceId()) {
        this.options.reportError(readPluginErrorMessage(error));
      }
    } finally {
      runInAction(() => {
        this.unmarkPluginBusy(busyKey);
      });
    }
  }

  /** Invalidates source-specific detail and mutation presentation state. */
  reset(): void {
    this.detailRequestId += 1;
    this.selectedPluginDetail = null;
    this.isLoadingDetail = false;
    this.busyPluginKeys = [];
  }

  /** Reloads bounded lists and an open detail after a successful mutation. */
  private async refreshAfterMutation(
    plugin: OpenCodexPluginSummary,
    sourceId: string
  ): Promise<void> {
    if (sourceId !== this.options.getSourceId()) {
      return;
    }

    await this.options.reloadLists();

    if (
      sourceId === this.options.getSourceId() &&
      this.selectedPluginDetail?.summary.id === plugin.id
    ) {
      await this.openPlugin(plugin);
    }
  }

  /** Marks a plugin as having an in-flight mutation. */
  private markPluginBusy(busyKey: string): void {
    this.busyPluginKeys = [...this.busyPluginKeys, busyKey];
  }

  /** Clears a plugin busy marker. */
  private unmarkPluginBusy(busyKey: string): void {
    this.busyPluginKeys = this.busyPluginKeys.filter((entry) => entry !== busyKey);
  }
}

/** Creates a collision-safe source-scoped mutation key. */
function createBusyKey(sourceId: string, pluginId: string): string {
  return JSON.stringify([sourceId, pluginId]);
}
