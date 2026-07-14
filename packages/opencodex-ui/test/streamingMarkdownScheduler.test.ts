/**
 * Covers cadence limiting and final flushing for streamed Markdown snapshots.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStreamingMarkdownScheduler,
  STREAMING_MARKDOWN_INTERVAL_MS
} from "../src/components/messages/streamingMarkdownScheduler";

afterEach(() => {
  vi.useRealTimers();
});

describe("streaming Markdown scheduler", () => {
  it("should emit only the latest snapshot in one cadence window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const updates: string[] = [];
    const scheduler = createStreamingMarkdownScheduler("initial", (markdown) => {
      updates.push(markdown);
    });

    scheduler.schedule("first");
    vi.advanceTimersByTime(50);
    scheduler.schedule("latest");
    vi.advanceTimersByTime(STREAMING_MARKDOWN_INTERVAL_MS - 51);

    expect(updates).toEqual([]);

    vi.advanceTimersByTime(1);

    expect(updates).toEqual(["latest"]);
  });

  it("should flush completed content immediately", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const updates: string[] = [];
    const scheduler = createStreamingMarkdownScheduler("initial", (markdown) => {
      updates.push(markdown);
    });

    scheduler.schedule("streamed");
    scheduler.flush("completed");

    expect(updates).toEqual(["completed"]);

    vi.runAllTimers();

    expect(updates).toEqual(["completed"]);
  });

  it("should discard pending content when cancelled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const updates: string[] = [];
    const scheduler = createStreamingMarkdownScheduler("initial", (markdown) => {
      updates.push(markdown);
    });

    scheduler.schedule("pending");
    scheduler.cancel();
    vi.runAllTimers();

    expect(updates).toEqual([]);
  });
});
