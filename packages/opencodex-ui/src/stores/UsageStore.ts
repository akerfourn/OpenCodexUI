/**
 * Holds Codex account usage limit state.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexUsageLimits,
  OpenCodexUsageSnapshot
} from "@open-codex-ui/opencodex-protocol";

import type { RootChildStore } from "./RootChildStore";
import type { RootStore } from "./RootStore";

const USAGE_REFRESH_INTERVAL_MS = 60_000;

/**
 * Stores current Codex usage limits.
 */
export class UsageStore implements RootChildStore {
  usagesByLimitId = new Map<string, OpenCodexUsageLimits>();
  lastUpdatedAt: string | null = null;
  lastRefreshRequestedAt: string | null = null;
  isLoading = false;
  isUnavailable = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly root: RootStore) {
    makeAutoObservable<UsageStore, "root" | "refreshTimer">(
      this,
      { root: false, refreshTimer: false },
      { autoBind: true }
    );
    this.scheduleNextRefresh();
  }

  handleEvent(event: OpenCodexEvent): void {
    if (event.type !== "usage.updated") {
      return;
    }

    this.applySnapshot(event.usage);
    this.scheduleNextRefresh();
  }

  get defaultUsageLimitId(): string {
    return this.root.appStore.settings.defaultUsageLimitId ?? "codex";
  }

  get defaultUsage(): OpenCodexUsageLimits | null {
    return this.usagesByLimitId.get(this.defaultUsageLimitId)
      ?? this.usagesByLimitId.get("codex")
      ?? null;
  }

  get usages(): OpenCodexUsageLimits[] {
    return Array.from(this.usagesByLimitId.values()).sort(compareUsageLimits);
  }

  get otherUsages(): OpenCodexUsageLimits[] {
    const defaultLimitId = readUsageLimitId(this.defaultUsage);
    return this.usages.filter((usage) => readUsageLimitId(usage) !== defaultLimitId);
  }

  async load(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.lastRefreshRequestedAt = new Date().toISOString();

    try {
      const usage = await this.root.request<OpenCodexUsageSnapshot | null>({ type: "usage.read" });
      runInAction(() => {
        this.applySnapshot(usage);
      });
    } catch {
      runInAction(() => {
        this.isUnavailable = true;
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
      this.scheduleNextRefresh();
    }
  }

  /**
   * Changes the usage limit used by compact widgets and highlighted summaries.
   *
   * @param limitId Usage limit identifier.
   *
   * @returns Nothing.
   */
  selectDefaultUsageLimit(limitId: string): void {
    this.root.appStore.setDefaultUsageLimitId(limitId === "codex" ? null : limitId);
  }

  private applySnapshot(snapshot: OpenCodexUsageSnapshot | null): void {
    if (snapshot === null) {
      this.isUnavailable = this.usagesByLimitId.size === 0;
      return;
    }

    snapshot.limits.forEach((usage) => {
      this.usagesByLimitId.set(readUsageLimitId(usage), usage);
    });
    this.lastUpdatedAt = snapshot.updatedAt;
    this.isUnavailable = this.usagesByLimitId.size === 0;
  }

  private scheduleNextRefresh(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      void this.load();
    }, USAGE_REFRESH_INTERVAL_MS);
  }
}

function compareUsageLimits(left: OpenCodexUsageLimits, right: OpenCodexUsageLimits): number {
  if (readUsageLimitId(left) === "codex") {
    return -1;
  }

  if (readUsageLimitId(right) === "codex") {
    return 1;
  }

  return readUsageLabel(left).localeCompare(readUsageLabel(right));
}

export function readUsageLimitId(usage: OpenCodexUsageLimits | null): string {
  return usage?.limitId ?? "codex";
}

export function readUsageLabel(usage: OpenCodexUsageLimits): string {
  return usage.limitName ?? usage.limitId ?? "codex";
}
