/**
 * Covers the bounded developer-mode trace for individual Codex turns.
 */
import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexTurnDiagnosticRequestInput
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it } from "vitest";

import { ThreadTurnDiagnosticService } from "../src/backend/threads/ThreadTurnDiagnosticService";

describe("ThreadTurnDiagnosticService", () => {
  it("should preserve the request and causal order for one completed turn", () => {
    const service = createService();
    const requestMutation = service.recordTurnRequest("source-1", "thread-1", createRequest());

    expect(requestMutation).not.toBeNull();

    if (requestMutation === null) {
      return;
    }

    service.recordTurnResponse(requestMutation.diagnostic.id, "turn-1", null);
    service.recordNotification(createNotification("turn/started", {
      threadId: "thread-1",
      turn: { id: "turn-1" }
    }), "source-1");
    service.recordNotification(createNotification("item/agentMessage/delta", {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "message-1",
      delta: "hello"
    }), "source-1");
    service.recordNotification(createNotification("item/agentMessage/delta", {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "message-1",
      delta: " world"
    }), "source-1");
    service.recordNotification(createNotification("turn/completed", {
      threadId: "thread-1",
      turn: { id: "turn-1", status: "completed" }
    }), "source-1");

    const diagnostic = service.read("source-1", "thread-1", "turn-1");

    expect(diagnostic).toMatchObject({
      sourceId: "source-1",
      threadId: "thread-1",
      turnId: "turn-1",
      status: "completed",
      requests: [{
        requestType: "turn.start",
        rpcMethod: "turn/start",
        text: "Investigate the reply routing",
        model: "gpt-test",
        response: {
          status: "succeeded",
          turnId: "turn-1",
          errorMessage: null
        }
      }],
      response: {
        outputDeltaCount: 2,
        outputLength: 11
      }
    });
    expect(diagnostic?.events.map((event) => event.eventName)).toEqual([
      "turn.start",
      "turn.start.response",
      "turn/started",
      "item/agentMessage/delta",
      "turn/completed"
    ]);
    expect(diagnostic?.events[3]?.count).toBe(2);
    expect(diagnostic?.response.outputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should flag a mismatch between the captured prompt and the UI input event", () => {
    const service = createService();
    const requestMutation = service.recordTurnRequest("source-1", "thread-1", createRequest());

    expect(requestMutation).not.toBeNull();

    if (requestMutation === null) {
      return;
    }

    service.recordBackendEvent(createMessageStartedEvent("different prompt"));
    service.recordTurnResponse(requestMutation.diagnostic.id, "turn-1", null);

    expect(service.read("source-1", "thread-1", "turn-1")?.anomalies)
      .toContain("message-content-mismatch");
  });

  it("should preserve a terminal notification received before the RPC response", () => {
    const service = createService();
    const requestMutation = service.recordTurnRequest("source-1", "thread-1", createRequest());

    expect(requestMutation).not.toBeNull();

    if (requestMutation === null) {
      return;
    }

    service.recordNotification(createNotification("turn/completed", {
      threadId: "thread-1",
      turn: { id: "turn-1", status: "failed" }
    }), "source-1");
    service.recordTurnResponse(requestMutation.diagnostic.id, "turn-1", null);

    expect(service.read("source-1", "thread-1", "turn-1")?.status).toBe("failed");
  });

  it("should isolate identical thread and turn ids by source", () => {
    const service = createService();

    for (const sourceId of ["source-1", "source-2"]) {
      const mutation = service.recordTurnRequest(sourceId, "thread-1", createRequest());
      expect(mutation).not.toBeNull();

      if (mutation !== null) {
        service.recordTurnResponse(mutation.diagnostic.id, "turn-1", null);
      }
    }

    expect(service.read("source-1", "thread-1", "turn-1")?.sourceId).toBe("source-1");
    expect(service.read("source-2", "thread-1", "turn-1")?.sourceId).toBe("source-2");
  });

  it("should not retain traces while developer diagnostics are disabled", () => {
    const service = new ThreadTurnDiagnosticService({ isEnabled: () => false });

    expect(service.recordTurnRequest("source-1", "thread-1", createRequest())).toBeNull();
    expect(service.read("source-1", "thread-1", "turn-1")).toBeNull();
  });
});

/** Creates deterministic timestamps for trace assertions. */
function createService(): ThreadTurnDiagnosticService {
  let timestamp = 0;

  return new ThreadTurnDiagnosticService({
    now: () => `2026-09-03T00:00:0${timestamp++}.000Z`
  });
}

/** Creates the exact request shape captured before a turn/start RPC call. */
function createRequest(): OpenCodexTurnDiagnosticRequestInput {
  return {
    requestType: "turn.start",
    rpcMethod: "turn/start",
    threadId: "thread-1",
    turnId: null,
    text: "Investigate the reply routing",
    input: [{ type: "text", text: "Investigate the reply routing" }],
    model: "gpt-test",
    reasoningEffort: "high",
    serviceTier: "auto",
    resumedExistingThread: true
  };
}

/** Creates a raw notification fixture with an arbitrary method and payload. */
function createNotification(
  method: string,
  params: Record<string, unknown>
): CodexNotification {
  return { method, params };
}

/** Creates the normalized synthetic user-message event used for prompt comparison. */
function createMessageStartedEvent(content: string): OpenCodexEvent {
  return {
    type: "message.started",
    sourceId: "source-1",
    threadId: "thread-1",
    message: {
      id: "message-1",
      threadId: "thread-1",
      role: "user",
      content,
      status: "completed",
      createdAt: "2026-09-03T00:00:00.000Z"
    }
  };
}
