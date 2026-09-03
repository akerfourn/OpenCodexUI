import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexTurnDiagnosticRequestInput
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it } from "vitest";

import { RuntimeEventDispatcher } from "../src/backend/runtime/RuntimeEventDispatcher";
import { ThreadTurnDiagnosticService } from "../src/backend/threads/ThreadTurnDiagnosticService";

describe("RuntimeEventDispatcher", () => {
  it("should notify the journal before the event without recursively recording updates", () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const dispatcher = new RuntimeEventDispatcher({
      emitToHost: (event) => emittedEvents.push(event)
    });

    dispatcher.emit({
      type: "turn.started",
      sourceId: "source-1",
      threadId: "thread-1",
      turnId: "turn-1"
    });

    expect(emittedEvents.map((event) => event.type)).toEqual([
      "thread.eventLog.updated",
      "turn.started"
    ]);
    expect(dispatcher.readThreadEventLog("thread-1", "source-1", 50).entries)
      .toHaveLength(1);

    const journalUpdate = emittedEvents[0];

    if (journalUpdate?.type !== "thread.eventLog.updated") {
      throw new Error("Expected the journal update to be emitted first.");
    }

    dispatcher.emit(journalUpdate);

    expect(emittedEvents.map((event) => event.type)).toEqual([
      "thread.eventLog.updated",
      "turn.started",
      "thread.eventLog.updated"
    ]);
    expect(dispatcher.readThreadEventLog("thread-1", "source-1", 50).entries)
      .toHaveLength(1);
  });

  it("should record raw notifications with their source and thread target", () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const dispatcher = new RuntimeEventDispatcher({
      emitToHost: (event) => emittedEvents.push(event)
    });
    const notification: CodexNotification = {
      method: "turn/started",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1" }
      }
    };

    dispatcher.recordRawNotification(notification, "source-1");
    dispatcher.recordRawNotification(notification, "source-2");

    expect(emittedEvents).toHaveLength(2);
    expect(emittedEvents.every((event) => event.type === "thread.eventLog.updated")).toBe(true);
    expect(dispatcher.readThreadEventLog("thread-1", "source-1", 50).entries[0])
      .toEqual(expect.objectContaining({
        stage: "received",
        eventName: "turn/started",
        sourceId: "source-1",
        threadId: "thread-1",
        turnId: "turn-1"
      }));
    expect(dispatcher.readThreadEventLog("thread-1", "source-2", 50).entries[0])
      .toEqual(expect.objectContaining({ sourceId: "source-2" }));
  });

  it("should record outgoing turn requests in the source-scoped journal", () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const dispatcher = new RuntimeEventDispatcher({
      emitToHost: (event) => emittedEvents.push(event)
    });

    dispatcher.recordClientRequest(
      "source-1",
      "thread-1",
      "turn.steer",
      "turn-1",
      { inputTextLength: 12 }
    );

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]).toMatchObject({
      type: "thread.eventLog.updated",
      sourceId: "source-1",
      threadId: "thread-1",
      entry: {
        stage: "client-requested",
        eventName: "turn.steer",
        turnId: "turn-1",
        details: { inputTextLength: 12 }
      }
    });
  });

  it("should forward and read a developer-mode turn diagnostic", () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const dispatcher = new RuntimeEventDispatcher({
      emitToHost: (event) => emittedEvents.push(event),
      threadTurnDiagnosticService: new ThreadTurnDiagnosticService({
        isEnabled: () => true
      })
    });
    const requestMutationId = dispatcher.recordTurnDiagnosticRequest(
      "source-1",
      "thread-1",
      createDiagnosticRequest()
    );

    expect(requestMutationId).not.toBeNull();
    dispatcher.recordTurnDiagnosticResponse(requestMutationId ?? "", "turn-1", null);
    dispatcher.recordRawNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1", status: "completed" }
      }
    }, "source-1");

    expect(emittedEvents.some((event) => event.type === "thread.turnDiagnostic.updated")).toBe(true);
    expect(dispatcher.readTurnDiagnostic("thread-1", "source-1", "turn-1")).toMatchObject({
      sourceId: "source-1",
      threadId: "thread-1",
      turnId: "turn-1",
      status: "completed"
    });
  });
});

/** Creates the minimal request payload captured by the diagnostic dispatcher. */
function createDiagnosticRequest(): OpenCodexTurnDiagnosticRequestInput {
  return {
    requestType: "turn.start",
    rpcMethod: "turn/start",
    threadId: "thread-1",
    turnId: null,
    text: "Inspect the request",
    input: [{ type: "text", text: "Inspect the request" }],
    model: "gpt-test",
    reasoningEffort: "high",
    serviceTier: "auto",
    resumedExistingThread: false
  };
}
