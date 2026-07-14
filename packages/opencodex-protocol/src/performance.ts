/** Aggregated Markdown renderer timings retained only in advanced mode. */
export type OpenCodexRendererMarkdownPerformanceSample = {
  plainRenderCount: number;
  plainRenderDurationMs: number;
  maxPlainRenderDurationMs: number;
  highlightedRenderCount: number;
  highlightedRenderDurationMs: number;
  maxHighlightedRenderDurationMs: number;
  maxMarkdownLength: number;
};

/** One content-free Markdown render timing recorded by the UI. */
export type OpenCodexMarkdownRenderPerformanceMetric = {
  durationMs: number;
  markdownLength: number;
  isSyntaxHighlighted: boolean;
};

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
  eventTypeMaxDurationMs?: Record<string, number>;
  markdown?: OpenCodexRendererMarkdownPerformanceSample;
};
