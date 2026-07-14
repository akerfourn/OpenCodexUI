/**
 * Collects bounded renderer metrics without retaining application content.
 */
import type {
  OpenCodexEvent,
  OpenCodexRendererPerformanceSample,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

const SAMPLE_INTERVAL_MS = 1_000;
const SUSPENSION_DELAY_MS = 30_000;

/**
 * Aggregates renderer event and long-task metrics once per second.
 */
export class RendererPerformanceMonitor {
  private expectedTickAt = performance.now() + SAMPLE_INTERVAL_MS;
  private longTaskCount = 0;
  private longTaskDurationMs = 0;
  private maxLongTaskDurationMs = 0;
  private processedEventCount = 0;
  private estimatedEventBytes = 0;
  private maxEventHandlingDurationMs = 0;
  private eventTypeCounts: Record<string, number> = {};
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly longTaskObserver: PerformanceObserver | null;
  private isLongTaskObserverActive = false;

  /**
   * Creates and starts renderer sampling.
   *
   * @param getSettings Returns current monitoring settings.
   */
  constructor(private readonly getSettings: () => OpenCodexSettings) {
    this.longTaskObserver = this.createLongTaskObserver();
    this.syncLongTaskObserver(this.getSettings().performanceMonitoringEnabled);
    this.timer = setInterval(() => {
      this.emitSample();
    }, SAMPLE_INTERVAL_MS);
  }

  /**
   * Records the synchronous application time for one backend event.
   *
   * @param event Applied backend event.
   * @param durationMs Synchronous listener duration.
   */
  recordEvent(event: OpenCodexEvent, durationMs: number): void {
    const settings = this.getSettings();

    if (!settings.performanceMonitoringEnabled) {
      return;
    }

    this.processedEventCount += 1;
    this.estimatedEventBytes += estimateEventBytes(event);
    this.maxEventHandlingDurationMs = Math.max(this.maxEventHandlingDurationMs, durationMs);

    if (settings.developerMode && settings.advancedPerformanceMonitoringEnabled) {
      this.eventTypeCounts[event.type] = (this.eventTypeCounts[event.type] ?? 0) + 1;
    }
  }

  /** Releases timers and observers owned by the monitor. */
  dispose(): void {
    clearInterval(this.timer);
    this.longTaskObserver?.disconnect();
  }

  /** Builds a browser long-task observer when the API is available. */
  private createLongTaskObserver(): PerformanceObserver | null {
    if (typeof PerformanceObserver === "undefined") {
      return null;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        if (!this.getSettings().performanceMonitoringEnabled) {
          return;
        }

        for (const entry of list.getEntries()) {
          this.longTaskCount += 1;
          this.longTaskDurationMs += entry.duration;
          this.maxLongTaskDurationMs = Math.max(this.maxLongTaskDurationMs, entry.duration);
        }
      });

      return observer;
    } catch {
      return null;
    }
  }

  /** Emits one aggregate sample to the Electron main process. */
  private emitSample(): void {
    const settings = this.getSettings();
    const now = performance.now();

    this.syncLongTaskObserver(settings.performanceMonitoringEnabled);

    if (!settings.performanceMonitoringEnabled) {
      this.expectedTickAt = now + SAMPLE_INTERVAL_MS;
      this.resetCounters();
      return;
    }

    const isAdvanced = settings.developerMode &&
      settings.advancedPerformanceMonitoringEnabled;
    const rawEventLoopDelayMs = Math.max(0, now - this.expectedTickAt);
    const sample: OpenCodexRendererPerformanceSample = {
      capturedAt: new Date().toISOString(),
      intervalMs: SAMPLE_INTERVAL_MS,
      isDocumentVisible: document.visibilityState === "visible",
      eventLoopDelayMs: rawEventLoopDelayMs >= SUSPENSION_DELAY_MS
        ? 0
        : rawEventLoopDelayMs,
      longTaskCount: this.longTaskCount,
      longTaskDurationMs: this.longTaskDurationMs,
      maxLongTaskDurationMs: this.maxLongTaskDurationMs,
      processedEventCount: this.processedEventCount,
      estimatedEventBytes: this.estimatedEventBytes,
      maxEventHandlingDurationMs: this.maxEventHandlingDurationMs
    };

    if (isAdvanced) {
      sample.eventTypeCounts = { ...this.eventTypeCounts };
    }

    window.openCodexUI.reportPerformanceSample(sample);
    this.expectedTickAt = now + SAMPLE_INTERVAL_MS;
    this.resetCounters();
  }

  /** Starts or stops browser long-task collection with the user setting. */
  private syncLongTaskObserver(isEnabled: boolean): void {
    if (this.longTaskObserver === null) {
      return;
    }

    if (!isEnabled) {
      if (this.isLongTaskObserverActive) {
        this.longTaskObserver.disconnect();
        this.isLongTaskObserverActive = false;
      }
      return;
    }

    if (this.isLongTaskObserverActive) {
      return;
    }

    try {
      this.longTaskObserver.observe({ entryTypes: ["longtask"] });
      this.isLongTaskObserverActive = true;
    } catch {
      this.isLongTaskObserverActive = false;
    }
  }

  /** Clears counters after one reporting interval. */
  private resetCounters(): void {
    this.longTaskCount = 0;
    this.longTaskDurationMs = 0;
    this.maxLongTaskDurationMs = 0;
    this.processedEventCount = 0;
    this.estimatedEventBytes = 0;
    this.maxEventHandlingDurationMs = 0;
    this.eventTypeCounts = {};
  }
}

/** Estimates known string payloads without serializing complete events. */
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
