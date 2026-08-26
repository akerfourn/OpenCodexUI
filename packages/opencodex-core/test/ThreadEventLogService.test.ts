/**
 * Covers the metadata-only Codex event trace.
 */
import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import { describe, expect, it } from "vitest";

import { ThreadEventLogService } from "../src/backend/threads/ThreadEventLogService";

describe("ThreadEventLogService", () => {
  it("should keep turn completion metadata without retaining turn content", () => {
    const service = createService();
    const mutation = service.recordNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "failed",
          durationMs: 1200,
          items: [{ type: "commandExecution", command: "secret command" }],
          error: { message: "diagnostic summary" }
        }
      }
    }, "source-1");

    expect(mutation?.entry).toMatchObject({
      stage: "received",
      eventName: "turn/completed",
      sourceId: "source-1",
      threadId: "thread-1",
      turnId: "turn-1",
      details: {
        durationMs: 1200,
        turnItemCount: 1,
        turnStatus: "failed",
        errorMessage: "diagnostic summary"
      }
    });
    expect(JSON.stringify(mutation)).not.toContain("secret command");
  });

  it("should isolate identical thread ids by source", () => {
    const service = createService();

    service.recordNotification(createDelta("source-1-delta"), "source-1");
    service.recordNotification(createDelta("source-2-delta"), "source-2");

    expect(service.read("source-1", "thread-1").entries).toHaveLength(1);
    expect(service.read("source-2", "thread-1").entries).toHaveLength(1);
    expect(service.read("source-1", "thread-1").entries[0]?.sourceId).toBe("source-1");
    expect(service.read("source-2", "thread-1").entries[0]?.sourceId).toBe("source-2");
  });

  it("should retain outgoing turn requests as content-free metadata", () => {
    const service = createService();
    const mutation = service.recordClientRequest(
      "source-1",
      "thread-1",
      "turn.steer",
      "turn-1",
      {
        inputTextLength: 42,
        attachmentCount: 0
      }
    );

    expect(mutation.entry).toMatchObject({
      stage: "client-requested",
      eventName: "turn.steer",
      sourceId: "source-1",
      threadId: "thread-1",
      turnId: "turn-1",
      details: {
        inputTextLength: 42,
        attachmentCount: 0
      }
    });
    expect(JSON.stringify(mutation)).not.toContain("private user content");
  });

  it("should coalesce adjacent high-frequency events and sum their lengths", () => {
    const service = createService();
    const firstMutation = service.recordNotification(createDelta("first"), "source-1");
    const secondMutation = service.recordNotification(createDelta("second"), "source-1");

    expect(firstMutation?.shouldNotify).toBe(true);
    expect(secondMutation?.shouldNotify).toBe(false);
    expect(service.read("source-1", "thread-1").entries).toEqual([
      expect.objectContaining({
        count: 2,
        details: expect.objectContaining({ deltaLength: 11 })
      })
    ]);
  });

  it("should trace future collaboration calls without retaining their arguments", () => {
    const service = createService();
    const mutation = service.recordNotification(createNotification(
      "rawResponseItem/completed",
      {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          type: "function_call",
          namespace: "collaboration",
          name: "future_agent_action",
          call_id: "call-1",
          arguments: JSON.stringify({ prompt: "private delegation content" })
        }
      }
    ), "source-1");

    expect(mutation?.entry.details).toMatchObject({
      itemType: "function_call",
      functionNamespace: "collaboration",
      functionName: "future_agent_action",
      hasArguments: true
    });
    expect(JSON.stringify(mutation)).not.toContain("private delegation content");
  });

  it("should mark the trace as truncated after evicting old entries", () => {
    const service = createService(2);

    service.recordNotification(createNotification("item/started", {
      threadId: "thread-1",
      item: { id: "item-1", type: "commandExecution" }
    }), "source-1");
    service.recordNotification(createNotification("item/completed", {
      threadId: "thread-1",
      item: { id: "item-1", type: "commandExecution" }
    }), "source-1");
    service.recordNotification(createNotification("thread/status/changed", {
      threadId: "thread-1",
      status: { type: "idle" }
    }), "source-1");

    const page = service.read("source-1", "thread-1");

    expect(page.entries).toHaveLength(2);
    expect(page.truncated).toBe(true);
    expect(page.entries[0]?.eventName).toBe("item/completed");
  });
});

/**
 * Creates a deterministic event-log service for one test.
 *
 * @param maxEntries Maximum entries retained per thread.
 * @returns Event-log service.
 */
function createService(maxEntries = 20): ThreadEventLogService {
  let timestamp = 0;

  return new ThreadEventLogService(maxEntries, () => `2026-07-18T00:00:0${timestamp++}.000Z`);
}

/**
 * Creates an assistant delta notification with a caller-controlled payload.
 *
 * @param delta Assistant fragment used only to verify its length is retained.
 * @returns Codex notification.
 */
function createDelta(delta: string): CodexNotification {
  return createNotification("item/agentMessage/delta", {
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    delta
  });
}

/**
 * Creates a typed raw notification fixture.
 *
 * @param method Notification method.
 * @param params Notification parameters.
 * @returns Codex notification.
 */
function createNotification(method: string, params: Record<string, unknown>): CodexNotification {
  return { method, params };
}
