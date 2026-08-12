/**
 * Detects sustained Electron slowdowns using bounded, content-free metrics.
 */
import type {
  OpenCodexEvent,
  OpenCodexRendererPerformanceSample,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import {
  createCounters,
  estimateEventBytes,
  isSevereAnomaly,
  readAnomalyReasons,
  readAverageDuration,
  readNotificationCategory
} from "./performanceMonitoringHelpers.js";
import type { MonitoringCounters } from "./performanceMonitoringHelpers.js";

const SAMPLE_INTERVAL_MS = 1_000;
const HISTORY_LIMIT = 300;
const LOG_HISTORY_LIMIT = 60;
const LOG_COOLDOWN_MS = 10 * 60 * 1_000;
const SUSPENSION_DELAY_MS = 30_000;

export type OpenCodexProcessPerformanceMetric = {
  type: string;
  cpuPercent: number;
  workingSetSizeKb: number;
};

export type PerformanceMonitoringSnapshot = {
  capturedAt: string;
  mode: "standard" | "advanced";
  mainEventLoopDelayMs: number;
  notificationCount: number;
  notificationBytes: number;
  maxNotificationDurationMs: number;
  notificationCategories: Record<string, number>;
  eventCount: number;
  eventBytes: number;
  notificationCounts?: Record<string, number>;
  eventCounts?: Record<string, number>;
  liveCacheNotificationCount?: number;
  liveCacheDurationMs?: number;
  averageLiveCacheDurationMs?: number;
  maxLiveCacheDurationMs?: number;
  liveCacheNotificationCounts?: Record<string, number>;
  renderer: OpenCodexRendererPerformanceSample | null;
  processes: OpenCodexProcessPerformanceMetric[] | null;
};

type PerformanceMonitoringOptions = {
  createLog(message: string, details: unknown): Promise<void> | void;
  readProcessMetrics(): OpenCodexProcessPerformanceMetric[];
  now?(): number;
};

/**
 * Aggregates low-cost metrics and persists a report only for sustained lag.
 */
export class PerformanceMonitoringService {
  private settings: OpenCodexSettings;
  private readonly history: PerformanceMonitoringSnapshot[] = [];
  private counters = createCounters();
  private timer: ReturnType<typeof setInterval> | null = null;
  private expectedTickAt = 0;
  private latestRendererSample: OpenCodexRendererPerformanceSample | null = null;
  private latestProcessMetrics: OpenCodexProcessPerformanceMetric[] | null = null;
  private sampleCount = 0;
  private anomalyStreak = 0;
  private lastLogAt = 0;

  /**
   * Creates a bounded performance monitor.
   *
   * @param settings Initial application settings.
   * @param options Host metrics and persistence adapters.
   */
  constructor(
    settings: OpenCodexSettings,
    private readonly options: PerformanceMonitoringOptions
  ) {
    this.settings = settings;
    this.applyEnabledState();
  }

  /**
   * Applies settings changes and starts or stops sampling as needed.
   *
   * @param settings Effective application settings.
   */
  setSettings(settings: OpenCodexSettings): void {
    const wasAdvancedMode = this.isAdvancedMode();
    this.settings = settings;

    if (wasAdvancedMode !== this.isAdvancedMode()) {
      this.counters = createCounters();
      this.latestRendererSample = null;
      this.history.length = 0;
    }

    this.applyEnabledState();
  }

  /**
   * Records throughput metadata for one raw Codex notification.
   *
   * @param method Codex notification method.
   * @param estimatedBytes Approximate string payload size.
   */
  recordCodexNotification(method: string, estimatedBytes: number): void {
    if (!this.settings.performanceMonitoringEnabled) {
      return;
    }

    this.counters.notificationCount += 1;
    this.counters.notificationBytes += estimatedBytes;
    incrementCount(this.counters.notificationCategories, readNotificationCategory(method));

    if (this.isAdvancedMode()) {
      incrementCount(this.counters.notificationCounts, method);
    }
  }

  /**
   * Records the real synchronous processing cost of one normalized notification.
   *
   * @param durationMs Processing duration after any streaming batch delay.
   */
  recordCodexNotificationProcessing(durationMs: number): void {
    if (!this.settings.performanceMonitoringEnabled) {
      return;
    }

    this.counters.maxNotificationDurationMs = Math.max(
      this.counters.maxNotificationDurationMs,
      durationMs
    );
  }

  /**
   * Records advanced timing for the live-turn cache processing stage.
   *
   * @param method Codex notification method.
   * @param durationMs Synchronous live-cache duration.
   */
  recordLiveCacheNotification(method: string, durationMs: number): void {
    if (!this.isAdvancedMode()) {
      return;
    }

    this.counters.liveCacheNotificationCount += 1;
    this.counters.liveCacheDurationMs += durationMs;
    this.counters.maxLiveCacheDurationMs = Math.max(
      this.counters.maxLiveCacheDurationMs,
      durationMs
    );
    incrementCount(this.counters.liveCacheNotificationCounts, method);
  }

  /**
   * Records one event forwarded from the backend to the renderer.
   *
   * @param event Event payload.
   */
  recordBackendEvent(event: OpenCodexEvent): void {
    if (!this.settings.performanceMonitoringEnabled) {
      return;
    }

    this.counters.eventCount += 1;
    this.counters.eventBytes += estimateEventBytes(event);

    if (this.isAdvancedMode()) {
      incrementCount(this.counters.eventCounts, event.type);
    }
  }

  /**
   * Stores the latest aggregated renderer sample.
   *
   * @param sample Renderer metrics for the latest interval.
   */
  recordRendererSample(sample: OpenCodexRendererPerformanceSample): void {
    if (!this.settings.performanceMonitoringEnabled) {
      return;
    }

    if (this.isAdvancedMode()) {
      this.latestRendererSample = sample;
      return;
    }

    const {
      eventTypeCounts: _eventTypeCounts,
      eventTypeMaxDurationMs: _eventTypeMaxDurationMs,
      markdown: _markdown,
      ...standardSample
    } = sample;
    this.latestRendererSample = standardSample;
  }

  /**
   * Releases the sampling timer.
   */
  dispose(): void {
    this.stop();
  }

  /**
   * Collects one snapshot. Exposed for deterministic tests.
   *
   * @returns Latest snapshot, or `null` when monitoring is disabled.
   */
  collectSnapshot(): PerformanceMonitoringSnapshot | null {
    if (!this.settings.performanceMonitoringEnabled) {
      return null;
    }

    const now = this.now();
    const rawDelay = Math.max(0, now - this.expectedTickAt);
    const mainEventLoopDelayMs = rawDelay >= SUSPENSION_DELAY_MS ? 0 : rawDelay;

    this.expectedTickAt = now + SAMPLE_INTERVAL_MS;
    this.sampleCount += 1;

    if (this.sampleCount === 1 || this.sampleCount % 5 === 0) {
      this.latestProcessMetrics = this.readProcessMetrics();
    }

    const isAdvanced = this.isAdvancedMode();
    const snapshot: PerformanceMonitoringSnapshot = {
      capturedAt: new Date(now).toISOString(),
      mode: isAdvanced ? "advanced" : "standard",
      mainEventLoopDelayMs,
      notificationCount: this.counters.notificationCount,
      notificationBytes: this.counters.notificationBytes,
      maxNotificationDurationMs: this.counters.maxNotificationDurationMs,
      notificationCategories: { ...this.counters.notificationCategories },
      eventCount: this.counters.eventCount,
      eventBytes: this.counters.eventBytes,
      renderer: this.latestRendererSample,
      processes: this.latestProcessMetrics
    };

    if (isAdvanced) {
      snapshot.notificationCounts = { ...this.counters.notificationCounts };
      snapshot.eventCounts = { ...this.counters.eventCounts };
      snapshot.liveCacheNotificationCount = this.counters.liveCacheNotificationCount;
      snapshot.liveCacheDurationMs = this.counters.liveCacheDurationMs;
      snapshot.averageLiveCacheDurationMs = readAverageDuration(
        this.counters.liveCacheDurationMs,
        this.counters.liveCacheNotificationCount
      );
      snapshot.maxLiveCacheDurationMs = this.counters.maxLiveCacheDurationMs;
      snapshot.liveCacheNotificationCounts = {
        ...this.counters.liveCacheNotificationCounts
      };
    }

    this.counters = createCounters();
    this.latestRendererSample = null;
    this.history.push(snapshot);

    if (this.history.length > HISTORY_LIMIT) {
      this.history.shift();
    }

    this.detectAnomaly(snapshot, rawDelay >= SUSPENSION_DELAY_MS);
    return snapshot;
  }

  /** Starts sampling when monitoring is enabled. */
  private start(): void {
    if (this.timer !== null) {
      return;
    }

    this.expectedTickAt = this.now() + SAMPLE_INTERVAL_MS;
    this.timer = setInterval(() => {
      this.collectSnapshot();
    }, SAMPLE_INTERVAL_MS);
  }

  /** Stops sampling and clears transient counters. */
  private stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.counters = createCounters();
    this.latestRendererSample = null;
    this.latestProcessMetrics = null;
    this.history.length = 0;
    this.sampleCount = 0;
    this.anomalyStreak = 0;
    this.lastLogAt = 0;
  }

  /** Applies the enabled state from current settings. */
  private applyEnabledState(): void {
    if (this.settings.performanceMonitoringEnabled) {
      this.start();
      return;
    }

    this.stop();
  }

  /** Returns whether detailed developer metrics may be retained. */
  private isAdvancedMode(): boolean {
    return this.settings.developerMode &&
      this.settings.advancedPerformanceMonitoringEnabled;
  }

  /** Detects sustained or severe lag and persists a bounded report. */
  private detectAnomaly(snapshot: PerformanceMonitoringSnapshot, didSuspend: boolean): void {
    if (didSuspend) {
      this.anomalyStreak = 0;
      return;
    }

    const reasons = readAnomalyReasons(snapshot);
    const isSevere = isSevereAnomaly(snapshot);

    this.anomalyStreak = reasons.length > 0 ? this.anomalyStreak + 1 : 0;

    if (!isSevere && this.anomalyStreak < 3) {
      return;
    }

    const now = this.now();

    if (now - this.lastLogAt < LOG_COOLDOWN_MS) {
      return;
    }

    this.lastLogAt = now;
    this.anomalyStreak = 0;
    const details = {
      detectedAt: snapshot.capturedAt,
      mode: snapshot.mode,
      reasons,
      current: snapshot,
      history: this.history.slice(-LOG_HISTORY_LIMIT)
    };
    const message = this.settings.language === "fr"
      ? "Ralentissement de performance détecté"
      : "Performance slowdown detected";

    void Promise.resolve(this.options.createLog(message, details)).catch(() => {
      // Diagnostic persistence is best effort and must never affect the app.
    });
  }

  /** Returns the current wall-clock time. */
  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /** Reads host metrics defensively so monitoring cannot destabilize the app. */
  private readProcessMetrics(): OpenCodexProcessPerformanceMetric[] {
    try {
      return this.options.readProcessMetrics();
    } catch {
      return [];
    }
  }
}

/** Increments one count without allocating per event. */
function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}
