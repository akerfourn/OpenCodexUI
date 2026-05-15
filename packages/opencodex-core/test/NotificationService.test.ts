/**
 * Covers Codex notification to UI event batching.
 */
import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type { OpenCodexEvent, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "../src/backend/NotificationService";

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
      threadId: "thread-1",
      turnId: "turn-1",
      durationMs: 1200
    });
  });
});

function createService(emit: (event: OpenCodexEvent) => void): NotificationService {
  return new NotificationService({
    getSettings: () => ({}) as OpenCodexSettings,
    emit,
    applyCodexThreadTitle: vi.fn(),
    syncCompletedTurn: vi.fn()
  });
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
