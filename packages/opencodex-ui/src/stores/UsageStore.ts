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
  /** Usage limits keyed by Codex limit identifier. */
  usagesByLimitId = new Map<string, OpenCodexUsageLimits>();
  /** ISO timestamp of the newest usage snapshot received from Codex. */
  lastUpdatedAt: string | null = null;
  /** ISO timestamp of the last UI-triggered or automatic refresh request. */
  lastRefreshRequestedAt: string | null = null;
  /** Whether a usage request is currently in flight. */
  isLoading = false;
  /** Whether usage data could not be loaded or is empty. */
  isUnavailable = false;
  /** Timer used to keep usage data reasonably fresh without request spam. */
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Creates the usage store and schedules the first automatic refresh.
   *
   * @param root Root store used for backend requests and settings.
   */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<UsageStore, "root" | "refreshTimer">(
      this,
      { root: false, refreshTimer: false },
      { autoBind: true }
    );
    this.scheduleNextRefresh();
  }

  /**
   * Applies usage snapshots emitted by the backend.
   *
   * @param event Backend event.
   */
  handleEvent(event: OpenCodexEvent): void {
    if (event.type !== "usage.updated") {
      return;
    }

    this.applySnapshot(event.usage);
    this.scheduleNextRefresh();
  }

  /** Limit id selected for compact usage widgets. */
  get defaultUsageLimitId(): string {
    return this.root.appStore.settings.defaultUsageLimitId ?? "codex";
  }

  /** Usage limit highlighted as the default limit. */
  get defaultUsage(): OpenCodexUsageLimits | null {
    return this.usagesByLimitId.get(this.defaultUsageLimitId)
      ?? this.usagesByLimitId.get("codex")
      ?? null;
  }

  /** All known usage limits sorted for display. */
  get usages(): OpenCodexUsageLimits[] {
    return Array.from(this.usagesByLimitId.values()).sort(compareUsageLimits);
  }

  /** Non-default usage limits shown after the highlighted default limit. */
  get otherUsages(): OpenCodexUsageLimits[] {
    const defaultLimitId = readUsageLimitId(this.defaultUsage);
    return this.usages.filter((usage) => readUsageLimitId(usage) !== defaultLimitId);
  }

  /**
   * Refreshes usage limits from the backend.
   *
   * @returns Promise resolved when the refresh has completed.
   */
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

  /**
   * Merges a usage snapshot into the local limit map.
   *
   * @param snapshot Usage snapshot returned by the backend.
   */
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

  /**
   * Schedules the next automatic usage refresh.
   */
  private scheduleNextRefresh(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      void this.load();
    }, USAGE_REFRESH_INTERVAL_MS);
  }
}

/**
 * Sorts Codex usage limits with the main Codex limit first.
 *
 * @param left First usage limit.
 * @param right Second usage limit.
 * @returns Sort comparison.
 */
function compareUsageLimits(left: OpenCodexUsageLimits, right: OpenCodexUsageLimits): number {
  if (readUsageLimitId(left) === "codex") {
    return -1;
  }

  if (readUsageLimitId(right) === "codex") {
    return 1;
  }

  return readUsageLabel(left).localeCompare(readUsageLabel(right));
}

/**
 * Reads the stable usage limit id with the Codex default fallback.
 *
 * @param usage Usage limit.
 * @returns Usage limit id.
 */
export function readUsageLimitId(usage: OpenCodexUsageLimits | null): string {
  return usage?.limitId ?? "codex";
}

/**
 * Reads the human label for a usage limit.
 *
 * @param usage Usage limit.
 * @returns Display label.
 */
export function readUsageLabel(usage: OpenCodexUsageLimits): string {
  return usage.limitName ?? usage.limitId ?? "codex";
}
