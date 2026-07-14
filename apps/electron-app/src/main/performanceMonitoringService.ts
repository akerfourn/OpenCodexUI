/**
 * Detects sustained Electron slowdowns using bounded, content-free metrics.
 */
import type {
  OpenCodexEvent,
  OpenCodexRendererPerformanceSample,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

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

type MonitoringCounters = {
  notificationCount: number;
  notificationBytes: number;
  maxNotificationDurationMs: number;
  notificationCategories: Record<string, number>;
  eventCount: number;
  eventBytes: number;
  notificationCounts: Record<string, number>;
  eventCounts: Record<string, number>;
  liveCacheNotificationCount: number;
  liveCacheDurationMs: number;
  maxLiveCacheDurationMs: number;
  liveCacheNotificationCounts: Record<string, number>;
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
   * Records one processed Codex notification without retaining its content.
   *
   * @param method Codex notification method.
   * @param estimatedBytes Approximate string payload size.
   * @param durationMs Synchronous backend processing duration.
   */
  recordCodexNotification(method: string, estimatedBytes: number, durationMs: number): void {
    if (!this.settings.performanceMonitoringEnabled) {
      return;
    }

    this.counters.notificationCount += 1;
    this.counters.notificationBytes += estimatedBytes;
    this.counters.maxNotificationDurationMs = Math.max(
      this.counters.maxNotificationDurationMs,
      durationMs
    );
    incrementCount(this.counters.notificationCategories, readNotificationCategory(method));

    if (this.isAdvancedMode()) {
      incrementCount(this.counters.notificationCounts, method);
    }
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

    const { eventTypeCounts: _eventTypeCounts, ...standardSample } = sample;
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

/** Creates empty interval counters. */
function createCounters(): MonitoringCounters {
  return {
    notificationCount: 0,
    notificationBytes: 0,
    maxNotificationDurationMs: 0,
    notificationCategories: {},
    eventCount: 0,
    eventBytes: 0,
    notificationCounts: {},
    eventCounts: {},
    liveCacheNotificationCount: 0,
    liveCacheDurationMs: 0,
    maxLiveCacheDurationMs: 0,
    liveCacheNotificationCounts: {}
  };
}

/** Maps verbose notification methods to stable standard-mode categories. */
function readNotificationCategory(method: string): string {
  if (method === "item/agentMessage/delta") {
    return "assistantDelta";
  }

  if (method.startsWith("item/reasoning/")) {
    return "reasoningDelta";
  }

  if (method === "command/exec/outputDelta" ||
    method === "item/commandExecution/outputDelta" ||
    method === "process/outputDelta") {
    return "commandOutputDelta";
  }

  if (method === "turn/diff/updated") {
    return "diffUpdated";
  }

  if (method.startsWith("item/fileChange/")) {
    return "fileChange";
  }

  if (method === "item/mcpToolCall/progress") {
    return "toolProgress";
  }

  return "other";
}

/** Increments one count without allocating per event. */
function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

/**
 * Returns a stable average duration for one sampled interval.
 *
 * @param totalDurationMs Accumulated duration.
 * @param count Number of timed operations.
 * @returns Average duration, or zero when no operation was timed.
 */
function readAverageDuration(totalDurationMs: number, count: number): number {
  return count > 0 ? totalDurationMs / count : 0;
}

/** Estimates user-independent event payload volume from known string fields. */
function estimateEventBytes(event: OpenCodexEvent): number {
  if (event.type === "message.delta") {
    return event.delta.length;
  }

  if (event.type === "activity.updated") {
    return (event.activity.content?.length ?? 0) +
      (event.activity.details?.length ?? 0) +
      (event.activity.summary?.length ?? 0);
  }

  if (event.type === "projectCommand.output") {
    return event.delta.length;
  }

  return 0;
}

/** Reads anomaly reasons from one aggregated interval. */
function readAnomalyReasons(snapshot: PerformanceMonitoringSnapshot): string[] {
  const reasons: string[] = [];
  const renderer = snapshot.renderer;

  if (snapshot.mainEventLoopDelayMs >= 150) {
    reasons.push("main_event_loop_delay");
  }

  if (snapshot.maxNotificationDurationMs >= 100) {
    reasons.push("backend_notification_duration");
  }

  if (renderer?.isDocumentVisible === true && renderer.eventLoopDelayMs >= 150) {
    reasons.push("renderer_event_loop_delay");
  }

  if (renderer?.isDocumentVisible === true && renderer.longTaskDurationMs >= 500) {
    reasons.push("renderer_long_tasks");
  }

  if (renderer?.isDocumentVisible === true && renderer.maxEventHandlingDurationMs >= 100) {
    reasons.push("renderer_event_handling_duration");
  }

  return reasons;
}

/** Returns whether one interval is severe enough to log immediately. */
function isSevereAnomaly(snapshot: PerformanceMonitoringSnapshot): boolean {
  const renderer = snapshot.renderer;

  return snapshot.mainEventLoopDelayMs >= 1_000 ||
    snapshot.maxNotificationDurationMs >= 500 ||
    (
      renderer?.isDocumentVisible === true &&
      (
        renderer.eventLoopDelayMs >= 1_000 ||
        renderer.maxLongTaskDurationMs >= 1_000 ||
        renderer.maxEventHandlingDurationMs >= 500
      )
    );
}
