import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexCodexReleaseCheck,
  OpenCodexSource,
  OpenCodexSourceKind,
  OpenCodexSourceSettingsPatch
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "./RootStore";
import type { RootChildStore } from "./RootChildStore";

const SOURCE_SYNC_MINIMUM_MS = 750;
const SOURCE_SYNC_MAXIMUM_MS = 10_000;

/**
 * Stores configured Codex sources and their visible synchronization state.
 */
export class SourcesStore implements RootChildStore {
  /** Configured Codex sources. */
  sources: OpenCodexSource[] = [];
  /** Source ids currently showing a sync indicator. */
  syncingSourceIds: string[] = [];
  /** Whether the all-sources sync indicator is active. */
  isSyncingAllSources = false;
  /** Whether source diagnostics are currently being refreshed. */
  isRefreshingSources = false;
  /** Whether the latest Codex release metadata is currently being refreshed. */
  isRefreshingCodexRelease = false;
  /** Start time for the visible all-sources sync indicator. */
  private allSourcesSyncStartedAt: number | null = null;
  /** Start times for visible per-source sync indicators. */
  private readonly sourceSyncStartedAtById = new Map<string, number>();

  /**
   * Creates the sources store.
   *
   * @param root Root store used for backend requests and settings.
   */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<SourcesStore, "root">(this, { root: false });
  }

  /** Whether at least one source cannot run Codex actions. */
  get hasUnavailableCodexSources(): boolean {
    return this.sources.some((source) => !this.isSourceReady(source.id));
  }

  /**
   * Finds a source by id.
   *
   * @param sourceId Source identifier.
   * @returns Matching source, or `null`.
   */
  findSource(sourceId: string | null): OpenCodexSource | null {
    if (sourceId === null) {
      return null;
    }

    return this.sources.find((source) => source.id === sourceId) ?? null;
  }

  /**
   * Checks whether a source can be used for Codex operations.
   *
   * @param sourceId Source identifier.
   * @returns Whether the source is ready or explicitly allowed when outdated.
   */
  isSourceReady(sourceId: string | null): boolean {
    const status = this.findSource(sourceId)?.codex.status;

    if (status === "ready") {
      return true;
    }

    return status === "outdated" && this.root.appStore.settings.allowOutdatedCodex;
  }

  /**
   * Applies source-related backend events.
   *
   * @param event Backend event.
   */
  handleEvent(event: OpenCodexEvent): void {
    switch (event.type) {
      case "app.bootstrap":
        this.applyBootstrap(event.settings.defaultSourceId, event.sources);
        return;
      case "projects.updated":
        this.finishVisibleSourceSync();
        return;
      case "sources.updated":
        this.applySourcesUpdated(event.defaultSourceId, event.sources);
        this.finishVisibleSourceSync();
        return;
      default:
        return;
    }
  }

  /**
   * Updates the source selected by the Home view.
   *
   * @param sourceId Selected source id or an empty string for all sources.
   */
  setHomeSelectedSource(sourceId: string): void {
    this.root.homeStore.setSelectedSourceId(sourceId.length === 0 ? null : sourceId);
  }

  /**
   * Persists a partial source update.
   *
   * @param sourceId Source identifier.
   * @param patch Source fields to update.
   */
  updateSource(
    sourceId: string,
    patch: {
      name?: string;
      settings?: OpenCodexSourceSettingsPatch;
    }
  ): void {
    void this.root.request({
      type: "sources.update",
      sourceId,
      patch
    });
  }

  /**
   * Creates a Codex source from a validated configuration draft.
   *
   * @param name Source display name.
   * @param kind Source kind.
   * @param settings Source settings.
   *
   * @returns Created source, or `null` when creation fails.
   */
  async createSource(
    name: string,
    kind: OpenCodexSourceKind,
    settings: OpenCodexSourceSettingsPatch
  ): Promise<OpenCodexSource> {
    try {
      return await this.root.request<OpenCodexSource>({
        type: "sources.create",
        name,
        kind,
        settings
      });
    } catch {
      throw new Error("Unable to create the Codex source.");
    }
  }

  /**
   * Deletes a configured source.
   *
   * @param sourceId Source identifier.
   * @returns Promise resolved when deletion completes.
   */
  async deleteSource(sourceId: string): Promise<void> {
    await this.root.request({
      type: "sources.delete",
      sourceId
    });
  }

  /**
   * Reloads source diagnostics without launching a full project synchronization.
   *
   * @returns Promise resolved when the source list request completes.
   */
  async refreshSources(): Promise<void> {
    if (this.isRefreshingSources) {
      return;
    }

    this.isRefreshingSources = true;

    try {
      const sources = await this.root.request<OpenCodexSource[]>({
        type: "sources.list"
      });
      runInAction(() => {
        this.sources = sources;
      });
    } finally {
      runInAction(() => {
        this.isRefreshingSources = false;
      });
    }
  }

  /**
   * Forces a latest Codex release check, then refreshes source diagnostics.
   *
   * @returns Promise resolved after the visible source list is updated.
   */
  async refreshCodexReleaseCheck(): Promise<void> {
    if (this.isRefreshingCodexRelease) {
      return;
    }

    this.isRefreshingCodexRelease = true;

    try {
      const releaseCheck = await this.root.request<OpenCodexCodexReleaseCheck>({
        type: "sources.codexRelease.check",
        force: true
      });
      runInAction(() => {
        this.root.appStore.setCodexReleaseCheck(releaseCheck);
      });
    } finally {
      runInAction(() => {
        this.isRefreshingCodexRelease = false;
      });
    }
  }

  /**
   * Applies a standalone Codex update for one source.
   *
   * @param sourceId Source identifier.
   * @returns Promise resolved when the backend update request completes.
   */
  async updateCodexSource(sourceId: string): Promise<void> {
    if (this.isSourceSyncing(sourceId)) {
      return;
    }

    this.syncingSourceIds = [...this.syncingSourceIds, sourceId];
    this.sourceSyncStartedAtById.set(sourceId, Date.now());

    try {
      await this.root.request({
        type: "sources.codexUpdate.apply",
        sourceId
      });
    } finally {
      this.finishVisibleSourceSync(sourceId);
    }
  }

  /**
   * Starts a project/thread sync for one source.
   *
   * @param sourceId Source identifier.
   */
  syncSource(sourceId: string): void {
    if (this.isSourceSyncing(sourceId)) {
      return;
    }

    this.syncingSourceIds = [...this.syncingSourceIds, sourceId];
    this.sourceSyncStartedAtById.set(sourceId, Date.now());
    const syncRequest = this.root.request({
      type: "sources.sync",
      sourceId
    });
    void syncRequest.then(
      () => this.finishVisibleSourceSync(sourceId),
      () => this.finishVisibleSourceSync(sourceId)
    );
    schedule(() => this.clearVisibleSourceSync(sourceId), SOURCE_SYNC_MAXIMUM_MS);
  }

  /**
   * Starts a project/thread sync for all sources.
   */
  syncAllSources(): void {
    if (this.isSyncingAllSources) {
      return;
    }

    this.isSyncingAllSources = true;
    this.syncingSourceIds = this.sources.map((source) => source.id);
    this.allSourcesSyncStartedAt = Date.now();

    for (const source of this.sources) {
      this.sourceSyncStartedAtById.set(source.id, this.allSourcesSyncStartedAt);
    }

    const syncRequest = this.root.request({
      type: "sources.sync",
      sourceId: null
    });
    void syncRequest.then(
      () => this.finishVisibleSourceSync(),
      () => this.finishVisibleSourceSync()
    );
    schedule(() => this.clearVisibleSourceSync(), SOURCE_SYNC_MAXIMUM_MS);
  }

  /**
   * Checks whether a source should show sync feedback.
   *
   * @param sourceId Source identifier.
   * @returns Whether the source is visually syncing.
   */
  isSourceSyncing(sourceId: string): boolean {
    return this.isSyncingAllSources || this.syncingSourceIds.includes(sourceId);
  }

  /**
   * Checks whether a source can use host-local file operations.
   *
   * @param sourceId Source identifier.
   * @returns Whether host-local file/folder actions are allowed.
   */
  hasLocalAccess(sourceId: string | null): boolean {
    const source = this.findSource(sourceId);

    if (source === null) {
      return false;
    }

    return sourceHasLocalAccess(source);
  }

  /**
   * Lets the user select a Codex executable for a source.
   *
   * @param sourceId Source identifier.
   */
  pickSourceExecutable(sourceId: string): void {
    void this.pickSourceExecutablePath().then((path) => {
      if (path === null) {
        return;
      }

      this.updateSource(sourceId, {
        settings: {
          commandMode: "custom",
          command: path
        }
      });
    });
  }

  /**
   * Opens the native executable picker.
   *
   * @returns Selected executable path, or `null`.
   */
  async pickSourceExecutablePath(): Promise<string | null> {
    return await this.root.request<string | null>({ type: "sources.pickExecutable" });
  }

  /**
   * Applies sources from the initial app bootstrap event.
   *
   * @param defaultSourceId Default source id from settings.
   * @param sources Source list.
   */
  private applyBootstrap(defaultSourceId: string | null, sources: OpenCodexSource[]): void {
    this.sources = sources;
    this.root.homeStore.setSelectedSourceId(null);
  }

  /**
   * Applies a source list update from the backend.
   *
   * @param defaultSourceId Default source id from settings.
   * @param sources Source list.
   */
  private applySourcesUpdated(defaultSourceId: string | null, sources: OpenCodexSource[]): void {
    this.sources = sources;
    this.root.settings = {
      ...this.root.settings,
      defaultSourceId
    };
    this.selectFallbackHomeSource(defaultSourceId);
  }

  /**
   * Keeps the Home source filter valid after source updates.
   *
   * @param defaultSourceId Default source id from settings.
   */
  private selectFallbackHomeSource(defaultSourceId: string | null): void {
    if (this.sources.length === 0) {
      this.root.homeStore.setSelectedSourceId(null);
      return;
    }

    const selectedSourceId = this.root.homeStore.selectedSourceId;
    const selectedSourceExists = selectedSourceId !== null &&
      this.sources.some((source) => source.id === selectedSourceId);

    if (selectedSourceId !== null && !selectedSourceExists) {
      this.root.homeStore.setSelectedSourceId(null);
    }
  }

  /**
   * Ends visible sync feedback after the minimum display duration.
   *
   * @param sourceId Optional source identifier.
   */
  private finishVisibleSourceSync(sourceId?: string): void {
    if (sourceId === undefined && this.allSourcesSyncStartedAt === null && this.sourceSyncStartedAtById.size > 0) {
      for (const syncingSourceId of Array.from(this.sourceSyncStartedAtById.keys())) {
        this.finishVisibleSourceSync(syncingSourceId);
      }
      return;
    }

    const startedAt = sourceId === undefined
      ? this.allSourcesSyncStartedAt
      : this.sourceSyncStartedAtById.get(sourceId) ?? null;

    if (startedAt === null) {
      return;
    }

    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(0, SOURCE_SYNC_MINIMUM_MS - elapsedMs);

    schedule(() => {
      runInAction(() => {
        if (sourceId === undefined) {
          this.clearVisibleSourceSync();
          return;
        }

        this.clearVisibleSourceSync(sourceId);
      });
    }, remainingMs);
  }

  /**
   * Clears sync feedback immediately for one source or all sources.
   *
   * @param sourceId Optional source identifier.
   */
  private clearVisibleSourceSync(sourceId?: string): void {
    if (sourceId === undefined) {
      this.isSyncingAllSources = false;
      this.syncingSourceIds = [];
      this.allSourcesSyncStartedAt = null;
      this.sourceSyncStartedAtById.clear();
      return;
    }

    this.syncingSourceIds = this.syncingSourceIds.filter((entry) => entry !== sourceId);
    this.sourceSyncStartedAtById.delete(sourceId);

    if (this.syncingSourceIds.length === 0) {
      this.isSyncingAllSources = false;
      this.allSourcesSyncStartedAt = null;
    }
  }
}

/**
 * Schedules delayed UI state cleanup.
 *
 * @param callback Callback to run.
 * @param durationMs Delay in milliseconds.
 */
function schedule(callback: () => void, durationMs: number): void {
  setTimeout(callback, durationMs);
}

/**
 * Checks whether a source points to paths visible from the Electron host.
 *
 * @param source Source DTO.
 * @returns Whether local file pickers and openers can be used.
 */
function sourceHasLocalAccess(source: OpenCodexSource): boolean {
  if (source.kind === "local") {
    return true;
  }

  return source.kind === "custom" && source.settings.hasLocalAccess;
}
