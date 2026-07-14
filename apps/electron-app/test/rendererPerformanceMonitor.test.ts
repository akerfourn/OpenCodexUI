/**
 * Covers advanced renderer aggregation for content-free Markdown timings.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OpenCodexEvent } from "@open-codex-ui/opencodex-protocol";

import { defaultSettings } from "../src/main/settingsStore";
import { RendererPerformanceMonitor } from "../src/renderer/rendererPerformanceMonitor";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RendererPerformanceMonitor", () => {
  it("should aggregate plain and highlighted Markdown only in advanced mode", () => {
    vi.useFakeTimers();
    const reportPerformanceSample = vi.fn();
    const settings = {
      ...defaultSettings,
      developerMode: true,
      advancedPerformanceMonitoringEnabled: true
    };

    vi.stubGlobal("document", { visibilityState: "visible" });
    vi.stubGlobal("window", {
      openCodexUI: { reportPerformanceSample }
    });

    const monitor = new RendererPerformanceMonitor(() => settings);

    monitor.recordMarkdownRender({
      durationMs: 4,
      markdownLength: 1_024,
      isSyntaxHighlighted: false
    });
    monitor.recordMarkdownRender({
      durationMs: 20,
      markdownLength: 2_048,
      isSyntaxHighlighted: true
    });
    vi.advanceTimersByTime(1_000);

    expect(reportPerformanceSample).toHaveBeenCalledWith(expect.objectContaining({
      markdown: {
        plainRenderCount: 1,
        plainRenderDurationMs: 4,
        maxPlainRenderDurationMs: 4,
        highlightedRenderCount: 1,
        highlightedRenderDurationMs: 20,
        maxHighlightedRenderDurationMs: 20,
        maxMarkdownLength: 2_048
      }
    }));

    monitor.dispose();
  });

  it("should retain the maximum handling duration for each event type", () => {
    vi.useFakeTimers();
    const reportPerformanceSample = vi.fn();
    const settings = {
      ...defaultSettings,
      developerMode: true,
      advancedPerformanceMonitoringEnabled: true
    };
    const event = {
      type: "thread.sync.started",
      sourceId: "source-a",
      threadId: "thread-a"
    } satisfies OpenCodexEvent;

    vi.stubGlobal("document", { visibilityState: "visible" });
    vi.stubGlobal("window", {
      openCodexUI: { reportPerformanceSample }
    });

    const monitor = new RendererPerformanceMonitor(() => settings);

    monitor.recordEvent(event, 2);
    monitor.recordEvent(event, 7);
    vi.advanceTimersByTime(1_000);

    expect(reportPerformanceSample).toHaveBeenCalledWith(expect.objectContaining({
      eventTypeCounts: { "thread.sync.started": 2 },
      eventTypeMaxDurationMs: { "thread.sync.started": 7 }
    }));

    monitor.dispose();
  });
});
