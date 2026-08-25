import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STREAMING_NOTIFICATION_BATCH_MS,
  StreamingNotificationBatcher
} from "../src/backend/runtime/StreamingNotificationBatcher";

describe("StreamingNotificationBatcher file updates", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should combine legacy append-only file output", () => {
    vi.useFakeTimers();
    const process = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process });

    batcher.handleNotification(createFileOutputDelta("part-1"), "source-1");
    batcher.handleNotification(createFileOutputDelta("part-2"), "source-1");
    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(process).toHaveBeenCalledWith(
      createFileOutputDelta("part-1part-2"),
      "source-1"
    );
  });

  it("should keep only the latest aggregated turn diff", () => {
    vi.useFakeTimers();
    const process = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process });

    batcher.handleNotification(createTurnDiff("first diff"), "source-1");
    batcher.handleNotification(createTurnDiff("latest diff"), "source-1");
    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(process).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledWith(createTurnDiff("latest diff"), "source-1");
  });

  it("should preserve an empty latest turn diff snapshot", () => {
    vi.useFakeTimers();
    const process = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process });

    batcher.handleNotification(createTurnDiff("obsolete diff"), "source-1");
    batcher.handleNotification(createTurnDiff(""), "source-1");
    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(process).toHaveBeenCalledWith(createTurnDiff(""), "source-1");
  });

  it("should keep only the latest structured file patch", () => {
    vi.useFakeTimers();
    const process = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process });

    batcher.handleNotification(createFilePatch("old diff"), "source-1");
    batcher.handleNotification(createFilePatch("new diff"), "source-1");
    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(process).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledWith(createFilePatch("new diff"), "source-1");
  });

  it("should isolate snapshots for different file items", () => {
    vi.useFakeTimers();
    const process = vi.fn();
    const batcher = new StreamingNotificationBatcher({ process });

    batcher.handleNotification(createFilePatch("diff-a", "file-1"), "source-1");
    batcher.handleNotification(createFilePatch("diff-b", "file-2"), "source-1");
    vi.advanceTimersByTime(STREAMING_NOTIFICATION_BATCH_MS);

    expect(process.mock.calls.map((call) => (
      (call[0].params as Record<string, unknown>).itemId
    ))).toEqual(["file-1", "file-2"]);
  });

  it("should flush a file snapshot before item completion", () => {
    vi.useFakeTimers();
    const processedMethods: string[] = [];
    const batcher = new StreamingNotificationBatcher({
      process: (notification) => processedMethods.push(notification.method)
    });
    const completion = createFileCompleted();

    batcher.handleNotification(createFilePatch("final diff"), "source-1");
    const wasBuffered = batcher.handleNotification(completion, "source-1");

    if (!wasBuffered) {
      processedMethods.push(completion.method);
    }

    expect(processedMethods).toEqual([
      "item/fileChange/patchUpdated",
      "item/completed"
    ]);
  });
});

/**
 * Creates a deprecated append-only file output notification.
 *
 * @param delta Text fragment.
 *
 * @returns Codex notification fixture.
 */
function createFileOutputDelta(delta: string): CodexNotification {
  return {
    method: "item/fileChange/outputDelta",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "file-1",
      delta
    }
  };
}

/**
 * Creates one aggregated turn diff snapshot.
 *
 * @param diff Complete unified diff.
 *
 * @returns Codex notification fixture.
 */
function createTurnDiff(diff: string): CodexNotification {
  return {
    method: "turn/diff/updated",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      diff
    }
  };
}

/**
 * Creates one structured file patch snapshot.
 *
 * @param diff Complete file diff.
 * @param itemId File-change item identifier.
 *
 * @returns Codex notification fixture.
 */
function createFilePatch(diff: string, itemId = "file-1"): CodexNotification {
  return {
    method: "item/fileChange/patchUpdated",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId,
      changes: [{
        path: `${itemId}.ts`,
        kind: "update",
        diff
      }]
    }
  };
}

/**
 * Creates one file-change item completion notification.
 *
 * @returns Codex notification fixture.
 */
function createFileCompleted(): CodexNotification {
  return {
    method: "item/completed",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        id: "file-1",
        type: "fileChange"
      }
    }
  };
}
