/**
 * Covers pure chat timeline scroll-position calculations.
 */
import { describe, expect, it } from "vitest";

import {
  BOTTOM_SCROLL_THRESHOLD_PX,
  isTimelineAtBottom,
  resolvePrependedTimelineScrollTop,
  resolveRestoredTimelineScrollTop
} from "../src/components/messages/chatTimelineScroll";

describe("chat timeline scroll", () => {
  it("should consider the exact bottom threshold pinned", () => {
    const isAtBottom = isTimelineAtBottom({
      scrollHeight: 1_000,
      scrollTop: 796,
      clientHeight: 200
    });

    expect(isAtBottom).toBe(true);
    expect(BOTTOM_SCROLL_THRESHOLD_PX).toBe(4);
  });

  it("should consider positions beyond the threshold unpinned", () => {
    const isAtBottom = isTimelineAtBottom({
      scrollHeight: 1_000,
      scrollTop: 795,
      clientHeight: 200
    });

    expect(isAtBottom).toBe(false);
  });

  it("should consider content shorter than the viewport pinned", () => {
    const isAtBottom = isTimelineAtBottom({
      scrollHeight: 100,
      scrollTop: 0,
      clientHeight: 200
    });

    expect(isAtBottom).toBe(true);
  });

  it("should restore a pinned timeline to its current content height", () => {
    const scrollTop = resolveRestoredTimelineScrollTop(true, 240, 1_200);

    expect(scrollTop).toBe(1_200);
  });

  it("should restore a non-pinned timeline to its saved position", () => {
    const scrollTop = resolveRestoredTimelineScrollTop(false, 240, 1_200);

    expect(scrollTop).toBe(240);
  });

  it("should clamp a negative saved non-pinned position to zero", () => {
    const scrollTop = resolveRestoredTimelineScrollTop(false, -20, 1_200);

    expect(scrollTop).toBe(0);
  });

  it("should preserve the viewport after prepending a height delta", () => {
    const scrollTop = resolvePrependedTimelineScrollTop(
      { height: 1_000, top: 120 },
      1_360
    );

    expect(scrollTop).toBe(480);
  });

  it("should preserve the position when prepending no content", () => {
    const scrollTop = resolvePrependedTimelineScrollTop(
      { height: 1_000, top: 120 },
      1_000
    );

    expect(scrollTop).toBe(120);
  });
});
