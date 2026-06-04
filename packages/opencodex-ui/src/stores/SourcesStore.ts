import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexSource,
  OpenCodexSourceLocalSettings
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "./RootStore";
import type { RootChildStore } from "./RootChildStore";

const SOURCE_SYNC_MINIMUM_MS = 750;
const SOURCE_SYNC_MAXIMUM_MS = 10_000;

export class SourcesStore implements RootChildStore {
  sources: OpenCodexSource[] = [];
  syncingSourceIds: string[] = [];
  isSyncingAllSources = false;
  isRefreshingSources = false;
  private allSourcesSyncStartedAt: number | null = null;
  private readonly sourceSyncStartedAtById = new Map<string, number>();

  constructor(private readonly root: RootStore) {
    makeAutoObservable<SourcesStore, "root">(this, { root: false });
  }

  get hasUnavailableCodexSources(): boolean {
    return this.sources.some((source) => !this.isSourceReady(source.id));
  }

  findSource(sourceId: string | null): OpenCodexSource | null {
    if (sourceId === null) {
      return null;
    }

    return this.sources.find((source) => source.id === sourceId) ?? null;
  }

  isSourceReady(sourceId: string | null): boolean {
    const status = this.findSource(sourceId)?.codex.status;

    if (status === "ready") {
      return true;
    }

    return status === "outdated" && this.root.appStore.settings.allowOutdatedCodex;
  }

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

  setHomeSelectedSource(sourceId: string): void {
    this.root.homeStore.setSelectedSourceId(sourceId.length === 0 ? null : sourceId);
  }

  updateSource(
    sourceId: string,
    patch: {
      name?: string;
      settings?: Partial<OpenCodexSourceLocalSettings>;
    }
  ): void {
    void this.root.request({
      type: "sources.update",
      sourceId,
      patch
    });
  }

  async createSource(): Promise<OpenCodexSource | null> {
    try {
      return await this.root.request<OpenCodexSource>({
        type: "sources.create",
        name: "Codex"
      });
    } catch {
      return null;
    }
  }

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

  isSourceSyncing(sourceId: string): boolean {
    return this.isSyncingAllSources || this.syncingSourceIds.includes(sourceId);
  }

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

  async pickSourceExecutablePath(): Promise<string | null> {
    return await this.root.request<string | null>({ type: "sources.pickExecutable" });
  }

  private applyBootstrap(defaultSourceId: string | null, sources: OpenCodexSource[]): void {
    this.sources = sources;
    this.root.homeStore.setSelectedSourceId(null);
  }

  private applySourcesUpdated(defaultSourceId: string | null, sources: OpenCodexSource[]): void {
    this.sources = sources;
    this.root.settings = {
      ...this.root.settings,
      defaultSourceId
    };
    this.selectFallbackHomeSource(defaultSourceId);
  }

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

function schedule(callback: () => void, durationMs: number): void {
  setTimeout(callback, durationMs);
}
