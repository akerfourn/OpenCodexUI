import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REASONING_DELTA_BATCH_MS,
  ReasoningDeltaBatcher
} from "../src/backend/ReasoningDeltaBatcher";

describe("ReasoningDeltaBatcher", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should combine consecutive deltas before processing them", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const batcher = new ReasoningDeltaBatcher({ process: emit });

    batcher.handleNotification(createReasoningDelta("Hel"), "source-1");
    batcher.handleNotification(createReasoningDelta("lo"), "source-1");

    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(REASONING_DELTA_BATCH_MS);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(createReasoningDelta("Hello"), "source-1");
  });

  it("should flush reasoning before a later turn notification", () => {
    vi.useFakeTimers();
    const processedMethods: string[] = [];
    const batcher = new ReasoningDeltaBatcher({
      process: (notification) => processedMethods.push(notification.method)
    });
    const completedNotification = createTurnCompleted();

    batcher.handleNotification(createReasoningDelta("Done"), "source-1");
    const wasBuffered = batcher.handleNotification(completedNotification, "source-1");

    if (!wasBuffered) {
      processedMethods.push(completedNotification.method);
    }

    expect(processedMethods).toEqual([
      "item/reasoning/summaryTextDelta",
      "turn/completed"
    ]);
  });

  it("should flush reasoning before completing its item", () => {
    vi.useFakeTimers();
    const processedMethods: string[] = [];
    const batcher = new ReasoningDeltaBatcher({
      process: (notification) => processedMethods.push(notification.method)
    });
    const completedNotification = createItemCompleted();

    batcher.handleNotification(createReasoningDelta("Done"), "source-1");
    const wasBuffered = batcher.handleNotification(completedNotification, "source-1");

    if (!wasBuffered) {
      processedMethods.push(completedNotification.method);
    }

    expect(processedMethods).toEqual([
      "item/reasoning/summaryTextDelta",
      "item/completed"
    ]);
  });

  it("should isolate concurrent items and sources", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const batcher = new ReasoningDeltaBatcher({ process: emit });

    batcher.handleNotification(createReasoningDelta("A", "item-1"), "source-1");
    batcher.handleNotification(createReasoningDelta("B", "item-2"), "source-1");
    batcher.handleNotification(createReasoningDelta("C", "item-1"), "source-2");
    vi.advanceTimersByTime(REASONING_DELTA_BATCH_MS);

    expect(emit).toHaveBeenCalledTimes(3);
    expect(emit.mock.calls.map((call) => [
      (call[0].params as Record<string, unknown>).itemId,
      (call[0].params as Record<string, unknown>).delta,
      call[1]
    ])).toEqual([
      ["item-1", "A", "source-1"],
      ["item-2", "B", "source-1"],
      ["item-1", "C", "source-2"]
    ]);
  });

  it("should preserve order across distinct segments of one item", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const batcher = new ReasoningDeltaBatcher({ process: emit });

    batcher.handleNotification(createReasoningDelta("summary"), "source-1");
    batcher.handleNotification(createReasoningTextDelta("content"), "source-1");

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toEqual(createReasoningDelta("summary"));

    vi.advanceTimersByTime(REASONING_DELTA_BATCH_MS);

    expect(emit.mock.calls[1]?.[0]).toEqual(createReasoningTextDelta("content"));
  });

  it("should normalize serialized reasoning fragments before combining them", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const batcher = new ReasoningDeltaBatcher({ process: emit });

    batcher.handleNotification(createReasoningDelta(JSON.stringify({
      type: "reasoning",
      summary: [{ text: "Hel" }],
      content: []
    })), "source-1");
    batcher.handleNotification(createReasoningDelta(JSON.stringify({
      type: "reasoning",
      summary: [{ text: "lo" }],
      content: []
    })), "source-1");
    vi.advanceTimersByTime(REASONING_DELTA_BATCH_MS);

    expect(emit).toHaveBeenCalledWith(createReasoningDelta("Hello"), "source-1");
  });

  it("should consume empty serialized reasoning without emitting an event", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const batcher = new ReasoningDeltaBatcher({ process: emit });
    const emptyReasoning = JSON.stringify({
      type: "reasoning",
      summary: [],
      content: []
    });

    const wasBuffered = batcher.handleNotification(
      createReasoningDelta(emptyReasoning),
      "source-1"
    );
    vi.advanceTimersByTime(REASONING_DELTA_BATCH_MS);

    expect(wasBuffered).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });

  it("should flush only the source being closed", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const batcher = new ReasoningDeltaBatcher({ process: emit });

    batcher.handleNotification(createReasoningDelta("A"), "source-1");
    batcher.handleNotification(createReasoningDelta("B"), "source-2");
    batcher.flushSource("source-1");

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[1]).toBe("source-1");

    vi.advanceTimersByTime(REASONING_DELTA_BATCH_MS);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[1]?.[1]).toBe("source-2");
  });

  it("should not flush reasoning for unrelated thread metadata", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const batcher = new ReasoningDeltaBatcher({ process: emit });

    batcher.handleNotification(createReasoningDelta("A"), "source-1");
    batcher.handleNotification({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "thread-1"
      }
    }, "source-1");

    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(REASONING_DELTA_BATCH_MS);

    expect(emit).toHaveBeenCalledTimes(1);
  });
});

/**
 * Creates one reasoning summary delta notification.
 *
 * @param delta Text fragment.
 * @param itemId Reasoning item identifier.
 *
 * @returns Codex notification fixture.
 */
function createReasoningDelta(delta: string, itemId = "item-1"): CodexNotification {
  return {
    method: "item/reasoning/summaryTextDelta",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId,
      delta,
      summaryIndex: 0
    }
  };
}

/**
 * Creates one reasoning content delta notification.
 *
 * @param delta Text fragment.
 *
 * @returns Codex notification fixture.
 */
function createReasoningTextDelta(delta: string): CodexNotification {
  return {
    method: "item/reasoning/textDelta",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      delta,
      contentIndex: 0
    }
  };
}

/**
 * Creates one turn completion notification.
 *
 * @returns Codex notification fixture.
 */
function createTurnCompleted(): CodexNotification {
  return {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1"
      }
    }
  };
}

/**
 * Creates one item completion notification.
 *
 * @returns Codex notification fixture.
 */
function createItemCompleted(): CodexNotification {
  return {
    method: "item/completed",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        id: "item-1",
        type: "reasoning"
      }
    }
  };
}
