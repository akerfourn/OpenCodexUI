/**
 * Covers the optional bridge between UI components and renderer diagnostics.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isMarkdownRenderPerformanceRecordingEnabled,
  recordMarkdownRenderPerformance,
  setRendererPerformanceRecorder
} from "../src/performance/rendererPerformanceRecorder";

afterEach(() => {
  setRendererPerformanceRecorder(null);
});

describe("renderer performance recorder", () => {
  it("should forward content-free Markdown metrics to the attached host", () => {
    const recordMarkdownRender = vi.fn();

    setRendererPerformanceRecorder({
      isMarkdownRenderPerformanceRecordingEnabled: () => true,
      recordMarkdownRender
    });
    recordMarkdownRenderPerformance({
      durationMs: 12,
      markdownLength: 2_048,
      isSyntaxHighlighted: true
    });

    expect(recordMarkdownRender).toHaveBeenCalledWith({
      durationMs: 12,
      markdownLength: 2_048,
      isSyntaxHighlighted: true
    });
    expect(isMarkdownRenderPerformanceRecordingEnabled()).toBe(true);
  });
});
