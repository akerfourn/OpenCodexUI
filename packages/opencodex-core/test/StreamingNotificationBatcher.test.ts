import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STREAMING_NOTIFICATION_BATCH_MS,
  StreamingNotificationBatcher
} from "../src/backend/runtime/StreamingNotificationBatcher";
import { createActivityFromNotification } from "../src/mapping/activity";

describe("StreamingNotificationBatcher", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should combine consecutive deltas before processing them", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process: emit });

    batcher.handleNotification(createReasoningDelta("Hel"), "source-1");
    batcher.handleNotification(createReasoningDelta("lo"), "source-1");

    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(createReasoningDelta("Hello"), "source-1");
  });

  it("should flush reasoning before a later turn notification", () => {
    vi.useFakeTimers();
    const processedMethods: string[] = [];
    const batcher = new StreamingNotificationBatcher({
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
    const batcher = new StreamingNotificationBatcher({
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
    const batcher = new StreamingNotificationBatcher({ process: emit });

    batcher.handleNotification(createReasoningDelta("A", "item-1"), "source-1");
    batcher.handleNotification(createReasoningDelta("B", "item-2"), "source-1");
    batcher.handleNotification(createReasoningDelta("C", "item-1"), "source-2");
    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

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
    const batcher = new StreamingNotificationBatcher({ process: emit });

    batcher.handleNotification(createReasoningDelta("summary"), "source-1");
    batcher.handleNotification(createReasoningTextDelta("content"), "source-1");

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[0]).toEqual(createReasoningDelta("summary"));

    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(emit.mock.calls[1]?.[0]).toEqual(createReasoningTextDelta("content"));
  });

  it("should normalize serialized reasoning fragments before combining them", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process: emit });

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
    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(emit).toHaveBeenCalledWith(createReasoningDelta("Hello"), "source-1");
  });

  it("should consume empty serialized reasoning without emitting an event", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process: emit });
    const emptyReasoning = JSON.stringify({
      type: "reasoning",
      summary: [],
      content: []
    });

    const wasBuffered = batcher.handleNotification(
      createReasoningDelta(emptyReasoning),
      "source-1"
    );
    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(wasBuffered).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });

  it("should flush only the source being closed", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process: emit });

    batcher.handleNotification(createReasoningDelta("A"), "source-1");
    batcher.handleNotification(createReasoningDelta("B"), "source-2");
    batcher.flushSource("source-1");

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]?.[1]).toBe("source-1");

    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[1]?.[1]).toBe("source-2");
  });

  it("should not flush reasoning for unrelated thread metadata", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process: emit });

    batcher.handleNotification(createReasoningDelta("A"), "source-1");
    batcher.handleNotification({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "thread-1"
      }
    }, "source-1");

    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("should combine command output without changing its transport shape", () => {
    vi.useFakeTimers();
    const process = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process });

    batcher.handleNotification(createCommandOutputDelta("Hel"), "source-1");
    batcher.handleNotification(createCommandOutputDelta("lo"), "source-1");
    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(process).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledWith(createCommandOutputDelta("Hello"), "source-1");
  });

  it("should preserve ANSI sequences split across command fragments", () => {
    vi.useFakeTimers();
    const process = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process });

    batcher.handleNotification(createCommandOutputDelta("\u001B["), "source-1");
    batcher.handleNotification(createCommandOutputDelta("31mred"), "source-1");
    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    const batchedNotification = process.mock.calls[0]?.[0] as CodexNotification;
    const activity = createActivityFromNotification(batchedNotification);

    expect(activity?.content).toBe("red");
  });

  it("should combine MCP tool progress messages", () => {
    vi.useFakeTimers();
    const process = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process });

    batcher.handleNotification(createToolProgress("Step "), "source-1");
    batcher.handleNotification(createToolProgress("done"), "source-1");
    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(process).toHaveBeenCalledWith(createToolProgress("Step done"), "source-1");
  });

  it("should combine base64 output as bytes and preserve cap state", () => {
    vi.useFakeTimers();
    const process = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process });

    batcher.handleNotification(createProcessOutput("Hel"), "source-1");
    batcher.handleNotification(createProcessOutput("lo", "stdout", true), "source-1");
    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(process).toHaveBeenCalledWith(
      createProcessOutput("Hello", "stdout", true),
      "source-1"
    );
  });

  it("should preserve ordering when a process switches output streams", () => {
    vi.useFakeTimers();
    const process = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process });

    batcher.handleNotification(createProcessOutput("out", "stdout"), "source-1");
    batcher.handleNotification(createProcessOutput("err", "stderr"), "source-1");

    expect(process).toHaveBeenCalledTimes(1);
    expect(process.mock.calls[0]?.[0]).toEqual(createProcessOutput("out", "stdout"));

    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(process.mock.calls[1]?.[0]).toEqual(createProcessOutput("err", "stderr"));
  });

  it("should flush process output before its exit notification", () => {
    vi.useFakeTimers();
    const processedMethods: string[] = [];
    const batcher = new StreamingNotificationBatcher({
      process: (notification) => processedMethods.push(notification.method)
    });
    const exitNotification = createProcessExited();

    batcher.handleNotification(createProcessOutput("done"), "source-1");
    const wasBuffered = batcher.handleNotification(exitNotification, "source-1");

    if (!wasBuffered) {
      processedMethods.push(exitNotification.method);
    }

    expect(processedMethods).toEqual([
      "process/outputDelta",
      "process/exited"
    ]);
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

/**
 * Creates one command execution output notification.
 *
 * @param delta Terminal output fragment.
 *
 * @returns Codex notification fixture.
 */
function createCommandOutputDelta(delta: string): CodexNotification {
  return {
    method: "item/commandExecution/outputDelta",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "command-1",
      delta
    }
  };
}

/**
 * Creates one MCP tool progress notification.
 *
 * @param message Progress message fragment.
 *
 * @returns Codex notification fixture.
 */
function createToolProgress(message: string): CodexNotification {
  return {
    method: "item/mcpToolCall/progress",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "tool-1",
      message
    }
  };
}

/**
 * Creates one connection-scoped process output notification.
 *
 * @param content Decoded output content.
 * @param stream Output stream.
 * @param capReached Whether the output cap was reached.
 *
 * @returns Codex notification fixture.
 */
function createProcessOutput(
  content: string,
  stream: "stdout" | "stderr" = "stdout",
  capReached = false
): CodexNotification {
  return {
    method: "process/outputDelta",
    params: {
      processHandle: "process-1",
      stream,
      deltaBase64: Buffer.from(content, "utf8").toString("base64"),
      capReached
    }
  };
}

/**
 * Creates one process exit notification.
 *
 * @returns Codex notification fixture.
 */
function createProcessExited(): CodexNotification {
  return {
    method: "process/exited",
    params: {
      processHandle: "process-1",
      exitCode: 0,
      stdout: "",
      stdoutCapReached: false,
      stderr: "",
      stderrCapReached: false
    }
  };
}
