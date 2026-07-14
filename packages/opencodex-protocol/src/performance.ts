/**
 * Aggregated renderer performance data sent to the Electron host.
 */
export type OpenCodexRendererPerformanceSample = {
  capturedAt: string;
  intervalMs: number;
  isDocumentVisible: boolean;
  eventLoopDelayMs: number;
  longTaskCount: number;
  longTaskDurationMs: number;
  maxLongTaskDurationMs: number;
  processedEventCount: number;
  estimatedEventBytes: number;
  maxEventHandlingDurationMs: number;
  eventTypeCounts?: Record<string, number>;
};
