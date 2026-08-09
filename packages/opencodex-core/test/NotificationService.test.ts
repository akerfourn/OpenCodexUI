/**
 * Covers Codex notification to UI event batching.
 */
import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type { OpenCodexEvent } from "@open-codex-ui/opencodex-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "../src/backend/NotificationService";
import type { RuntimeEventPort } from "../src/backend/runtime/runtimePorts";

describe("NotificationService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should batch assistant message deltas before emitting them", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const service = createService(emit);

    service.handleNotification(createAgentMessageDelta("Hel"), "source-1");
    service.handleNotification(createAgentMessageDelta("lo"), "source-1");

    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({
      type: "message.delta",
      sourceId: "source-1",
      threadId: "thread-1",
      turnId: "turn-1",
      messageId: "message-1",
      delta: "Hello",
      phase: null
    });
  });

  it("should flush pending assistant deltas before completing a turn", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const service = createService(emit);

    service.handleNotification(createAgentMessageDelta("Done"), "source-1");
    service.handleNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          durationMs: 1200
        }
      }
    }, "source-1");

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0]?.[0]).toMatchObject({
      type: "message.delta",
      delta: "Done"
    });
    expect(emit.mock.calls[1]?.[0]).toEqual({
      type: "turn.completed",
      sourceId: "source-1",
      threadId: "thread-1",
      turnId: "turn-1",
      durationMs: 1200
    });
  });

  it("should expose the Codex turn status on completion events", () => {
    const emit = vi.fn();
    const service = createService(emit);

    service.handleNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "failed",
          durationMs: 1200,
          error: {
            message: "Selected model is at capacity. Please try a different model."
          }
        }
      }
    }, "source-1");

    expect(emit).toHaveBeenCalledWith({
      type: "turn.completed",
      sourceId: "source-1",
      threadId: "thread-1",
      turnId: "turn-1",
      durationMs: 1200,
      turnStatus: "failed",
      errorMessage: "Selected model is at capacity. Please try a different model."
    });
  });
});

function createService(emit: (event: OpenCodexEvent) => void): NotificationService {
  return new NotificationService({
    events: createEventPort(emit),
    applyCodexThreadTitle: vi.fn(),
    applyCodexThreadDeleted: vi.fn(),
    syncCompletedTurn: vi.fn()
  });
}

/** Creates the event port required by notification tests. */
function createEventPort(emit: (event: OpenCodexEvent) => void): RuntimeEventPort {
  return {
    emit,
    recordRawNotification: () => undefined,
    readThreadEventLog: () => ({ entries: [], truncated: false })
  };
}

function createAgentMessageDelta(delta: string): CodexNotification {
  return {
    method: "item/agentMessage/delta",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "message-1",
      delta
    }
  };
}
