/**
 * Holds Codex account usage limit state.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexUsageLimits,
  OpenCodexUsageResetConsumeResult,
  OpenCodexUsageResetCredits,
  OpenCodexUsageSnapshot
} from "@open-codex-ui/opencodex-protocol";

import type { RootChildStore } from "../RootChildStore";
import type { RootStore } from "../RootStore";

const USAGE_REFRESH_INTERVAL_MS = 60_000;
const DEFAULT_SOURCE_KEY = "__default__";

/**
 * Usage state maintained for one source.
 */
export type OpenCodexSourceUsageState = {
  usagesByLimitId: Map<string, OpenCodexUsageLimits>;
  rateLimitResetCredits: OpenCodexUsageResetCredits | null | undefined;
  lastUpdatedAt: string | null;
  lastRefreshRequestedAt: string | null;
  isLoading: boolean;
  isUnavailable: boolean;
  isConsumingReset: boolean;
  error: string | null;
};

/**
 * Stores current Codex usage limits and banked reset credits per source.
 */
export class UsageStore implements RootChildStore {
  /** Usage state keyed by the source owning the Codex account. */
  readonly usageBySourceId = new Map<string, OpenCodexSourceUsageState>();
  /** Timer used to keep loaded usage data reasonably fresh. */
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  /** Idempotency keys retained while a failed consume attempt may be retried. */
  private readonly resetIdempotencyKeys = new Map<string, string>();

  /**
   * Creates the usage store and schedules the first automatic refresh.
   *
   * @param root Root store used for backend requests and settings.
   */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<UsageStore, "root" | "refreshTimer" | "resetIdempotencyKeys">(
      this,
      { root: false, refreshTimer: false, resetIdempotencyKeys: false },
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

    const state = this.ensureSourceState(event.sourceId);

    if (event.usage === null) {
      this.applyUnavailable(state);
    } else {
      this.applySnapshot(state, event.usage);
    }

    this.scheduleNextRefresh();
  }

  /**
   * Returns the usage state for one source.
   *
   * @param sourceId Source identifier.
   * @returns Source usage state, or `null` before its first request.
   */
  getSourceUsage(sourceId: string): OpenCodexSourceUsageState | null {
    return this.usageBySourceId.get(sourceId) ?? null;
  }

  /** Limit id selected for compact usage widgets. */
  get defaultUsageLimitId(): string {
    return this.root.appStore.settingsStore.settings.defaultUsageLimitId ?? "codex";
  }

  /** Usage limits belonging to the configured default source. */
  get usagesByLimitId(): Map<string, OpenCodexUsageLimits> {
    return this.readDefaultState()?.usagesByLimitId ?? new Map();
  }

  /** ISO timestamp of the newest default-source usage snapshot. */
  get lastUpdatedAt(): string | null {
    return this.readDefaultState()?.lastUpdatedAt ?? null;
  }

  /** ISO timestamp of the last default-source refresh request. */
  get lastRefreshRequestedAt(): string | null {
    return this.readDefaultState()?.lastRefreshRequestedAt ?? null;
  }

  /** Whether the default-source usage request is currently in flight. */
  get isLoading(): boolean {
    return this.readDefaultState()?.isLoading ?? false;
  }

  /** Whether default-source usage is unavailable. */
  get isUnavailable(): boolean {
    return this.readDefaultState()?.isUnavailable ?? false;
  }

  /** Usage limit highlighted as the default limit. */
  get defaultUsage(): OpenCodexUsageLimits | null {
    return this.usagesByLimitId.get(this.defaultUsageLimitId)
      ?? this.usagesByLimitId.get("codex")
      ?? null;
  }

  /** All known default-source usage limits sorted for display. */
  get usages(): OpenCodexUsageLimits[] {
    return Array.from(this.usagesByLimitId.values()).sort(compareUsageLimits);
  }

  /** Non-default usage limits shown after the highlighted default limit. */
  get otherUsages(): OpenCodexUsageLimits[] {
    const defaultLimitId = readUsageLimitId(this.defaultUsage);
    return this.usages.filter((usage) => readUsageLimitId(usage) !== defaultLimitId);
  }

  /**
   * Refreshes usage limits for one source, or the configured default source.
   *
   * @param sourceId Source identifier, or `null` for the configured default.
   * @returns Promise resolved when the refresh has completed.
   */
  async load(sourceId: string | null = null): Promise<void> {
    const requestedSourceId = sourceId ?? this.root.appStore.settingsStore.settings.defaultSourceId;
    const stateKey = requestedSourceId ?? DEFAULT_SOURCE_KEY;
    const state = this.ensureSourceState(stateKey);

    if (state.isLoading) {
      return;
    }

    state.isLoading = true;
    state.lastRefreshRequestedAt = new Date().toISOString();
    state.error = null;

    try {
      const usage = await this.root.request<OpenCodexUsageSnapshot | null>({
        type: "usage.read",
        sourceId: requestedSourceId
      });

      runInAction(() => {
        if (usage === null) {
          this.applyUnavailable(state);
          return;
        }

        if (stateKey !== usage.sourceId) {
          this.usageBySourceId.delete(stateKey);
        }

        this.applySnapshot(this.ensureSourceState(usage.sourceId), usage);
      });
    } catch (error) {
      runInAction(() => {
        state.error = readUsageError(error);
        this.applyUnavailable(state);
      });
    } finally {
      runInAction(() => {
        state.isLoading = false;
      });
      this.scheduleNextRefresh();
    }
  }

  /**
   * Consumes one fully identified reset credit for a source.
   *
   * @param sourceId Source identifier owning the reset.
   * @param creditId Reset-credit identifier selected by the user.
   * @returns Consume outcome.
   */
  async consumeReset(
    sourceId: string,
    creditId: string
  ): Promise<OpenCodexUsageResetConsumeResult> {
    const state = this.ensureSourceState(sourceId);
    validateResetSelection(state, creditId);

    if (state.isConsumingReset) {
      throw new Error("A reset is already being applied for this source.");
    }

    state.isConsumingReset = true;
    state.error = null;
    const attemptKey = readResetAttemptKey(sourceId, creditId);
    const idempotencyKey = this.resetIdempotencyKeys.get(attemptKey) ?? createIdempotencyKey();
    this.resetIdempotencyKeys.set(attemptKey, idempotencyKey);

    try {
      const result = await this.root.request<OpenCodexUsageResetConsumeResult>({
        type: "usage.reset.consume",
        sourceId,
        creditId,
        idempotencyKey
      });

      this.resetIdempotencyKeys.delete(attemptKey);

      runInAction(() => {
        if (result.outcome === "nothingToReset" || result.outcome === "noCredit") {
          state.error = readConsumeOutcomeError(result.outcome);
        }
      });

      return result;
    } catch (error) {
      runInAction(() => {
        state.error = readUsageError(error);
      });
      throw error;
    } finally {
      runInAction(() => {
        state.isConsumingReset = false;
      });
    }
  }

  /**
   * Changes the usage limit used by compact widgets and highlighted summaries.
   *
   * @param limitId Usage limit identifier.
   * @returns Nothing.
   */
  selectDefaultUsageLimit(limitId: string): void {
    this.root.appStore.settingsStore.setDefaultUsageLimitId(limitId === "codex" ? null : limitId);
  }

  /**
   * Returns or creates state for a source.
   *
   * @param sourceId Source identifier.
   * @returns Mutable observable source state.
   */
  private ensureSourceState(sourceId: string): OpenCodexSourceUsageState {
    const existingState = this.usageBySourceId.get(sourceId);

    if (existingState !== undefined) {
      return existingState;
    }

    const state: OpenCodexSourceUsageState = {
      usagesByLimitId: new Map(),
      rateLimitResetCredits: undefined,
      lastUpdatedAt: null,
      lastRefreshRequestedAt: null,
      isLoading: false,
      isUnavailable: false,
      isConsumingReset: false,
      error: null
    };
    this.usageBySourceId.set(sourceId, state);
    return state;
  }

  /**
   * Applies a usage snapshot while preserving reset data omitted by notifications.
   *
   * @param state Destination source state.
   * @param snapshot Usage snapshot.
   * @returns Nothing.
   */
  private applySnapshot(
    state: OpenCodexSourceUsageState,
    snapshot: OpenCodexUsageSnapshot
  ): void {
    snapshot.limits.forEach((usage) => {
      state.usagesByLimitId.set(readUsageLimitId(usage), usage);
    });

    if (Object.prototype.hasOwnProperty.call(snapshot, "rateLimitResetCredits")) {
      state.rateLimitResetCredits = snapshot.rateLimitResetCredits;
    }

    state.lastUpdatedAt = snapshot.updatedAt;
    state.isUnavailable = false;
    state.error = null;
  }

  /**
   * Marks a source usage snapshot unavailable and disables reset actions.
   *
   * @param state Source usage state.
   * @returns Nothing.
   */
  private applyUnavailable(state: OpenCodexSourceUsageState): void {
    state.isUnavailable = true;
    state.rateLimitResetCredits = null;
  }

  /**
   * Reads the state associated with the configured default source.
   *
   * @returns Default source state, or `null` before loading.
   */
  private readDefaultState(): OpenCodexSourceUsageState | null {
    const sourceId = this.root.appStore.settingsStore.settings.defaultSourceId ?? DEFAULT_SOURCE_KEY;
    return this.usageBySourceId.get(sourceId) ?? null;
  }

  /**
   * Refreshes all source states that have already been requested.
   *
   * @returns Promise resolved after refresh requests are started and settled.
   */
  private async refreshLoadedSources(): Promise<void> {
    const sourceIds = Array.from(this.usageBySourceId.keys())
      .filter((sourceId) => sourceId !== DEFAULT_SOURCE_KEY);

    if (sourceIds.length === 0) {
      await this.load();
      return;
    }

    await Promise.all(sourceIds.map((sourceId) => this.load(sourceId)));
  }

  /**
   * Schedules the next automatic usage refresh.
   */
  private scheduleNextRefresh(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      void this.refreshLoadedSources();
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

/**
 * Ensures the selected reset is fully identified and still available locally.
 *
 * @param state Source usage state.
 * @param creditId Selected reset-credit identifier.
 * @returns Nothing.
 */
function validateResetSelection(state: OpenCodexSourceUsageState, creditId: string): void {
  const summary = state.rateLimitResetCredits;
  const credits = summary?.credits;
  const credit = credits?.find((entry) => entry.id === creditId);

  if (
    summary === undefined ||
    summary === null ||
    credits === null ||
    credits === undefined ||
    credits.length !== summary.availableCount ||
    credit === undefined ||
    credit.status !== "available"
  ) {
    state.error = "The reset details are incomplete or no longer available.";
    throw new Error(state.error);
  }
}

/**
 * Creates a UUID-like idempotency key for one logical user action.
 *
 * @returns Stable key for the current consume attempt.
 */
function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `reset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Creates the local key used to retain one logical retry attempt.
 *
 * @param sourceId Source identifier.
 * @param creditId Reset-credit identifier.
 * @returns Local attempt key.
 */
function readResetAttemptKey(sourceId: string, creditId: string): string {
  return `${sourceId}:${creditId}`;
}

/**
 * Converts a failed request into a readable UI error.
 *
 * @param error Thrown request error.
 * @returns Error message.
 */
function readUsageError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Converts a backend consume outcome into an explanatory UI message.
 *
 * @param outcome Backend consume outcome.
 * @returns User-facing message.
 */
function readConsumeOutcomeError(
  outcome: "nothingToReset" | "noCredit"
): string {
  if (outcome === "nothingToReset") {
    return "No rate-limit reset is currently available.";
  }

  return "The selected reset credit is no longer available.";
}
