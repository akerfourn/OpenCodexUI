import { describe, expect, it, vi } from "vitest";
import { autorun } from "mobx";

import type {
  OpenCodexCollaborationEvent,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

import { CollaborationStore } from "../src/stores/CollaborationStore";
import type { RootStore } from "../src/stores/RootStore";

describe("CollaborationStore", () => {
  it("should share and cache one source-aware history request per thread root", async () => {
    const event = createEvent();
    const request = vi.fn(async () => [event]);
    const store = new CollaborationStore(createRootStore(request));

    const [firstResult, secondResult] = await Promise.all([
      store.loadThreadEvents("source-1", "parent-1"),
      store.loadThreadEvents("source-1", "parent-1")
    ]);
    const cachedResult = await store.loadThreadEvents("source-1", "parent-1");

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      type: "threads.collaboration.list",
      sourceId: "source-1",
      rootThreadId: "parent-1"
    });
    expect(firstResult).toEqual([event]);
    expect(secondResult).toEqual([event]);
    expect(cachedResult).toEqual([event]);
  });

  it("should enrich one live event without duplicating its timeline identity", () => {
    const store = new CollaborationStore(createRootStore(vi.fn()));
    const pendingEvent = createEvent({ status: "pending", prompt: null });
    const completedEvent = createEvent({ status: "completed", prompt: "Review this module." });

    store.handleEvent({
      type: "collaboration.updated",
      sourceId: "source-1",
      event: pendingEvent
    });
    store.handleEvent({
      type: "collaboration.updated",
      sourceId: "source-1",
      event: completedEvent
    });

    expect(store.readThreadEvents("source-1", "parent-1")).toEqual([completedEvent]);
    expect(store.readThreadEvents("source-1", "child-1")).toEqual([completedEvent]);
  });

  it("should not regress a completed live event when a partial history load arrives later", () => {
    const store = new CollaborationStore(createRootStore(vi.fn()));
    const completedEvent = createEvent({
      action: "followup",
      status: "completed",
      prompt: "Retained prompt"
    });
    const latePartialEvent = createEvent({
      action: "message",
      status: "pending",
      prompt: null,
      evidence: ["canonicalItem"]
    });

    store.handleEvent({
      type: "collaboration.updated",
      sourceId: "source-1",
      event: completedEvent
    });
    store.handleEvent({
      type: "collaboration.updated",
      sourceId: "source-1",
      event: latePartialEvent
    });

    expect(store.readThreadEvents("source-1", "parent-1")).toMatchObject([{
      id: "event-1",
      action: "followup",
      prompt: "Retained prompt",
      status: "completed"
    }]);
  });

  it("should retain parallel events without notifying observers for exact replays", () => {
    const store = new CollaborationStore(createRootStore(vi.fn()));
    const events = Array.from({ length: 128 }, (_, index) => createEvent({
      id: `event-${index}`,
      callId: `call-${index}`,
      receiverThreadIds: [`child-${index}`],
      receiverAgentPaths: [`/root/child-${index}`]
    }));
    const observedSizes: number[] = [];
    const dispose = autorun(() => {
      observedSizes.push(store.readThreadEvents("source-1", "parent-1").length);
    });

    for (const event of events) {
      store.handleEvent({ type: "collaboration.updated", sourceId: "source-1", event });
    }

    const observationCountAfterInsert = observedSizes.length;

    for (const event of events) {
      store.handleEvent({
        type: "collaboration.updated",
        sourceId: "source-1",
        event: { ...event }
      });
    }

    expect(store.readThreadEvents("source-1", "parent-1")).toHaveLength(128);
    expect(observedSizes.length).toBe(observationCountAfterInsert);
    dispose();
  });
});

/** Creates the minimum root contract needed by the collaboration store. */
function createRootStore(
  request: (request: OpenCodexRequest) => Promise<unknown>
): RootStore {
  return { request } as RootStore;
}

/** Creates a normalized collaboration event fixture. */
function createEvent(
  overrides: Partial<OpenCodexCollaborationEvent> = {}
): OpenCodexCollaborationEvent {
  return {
    id: "event-1",
    sourceId: "source-1",
    threadId: "parent-1",
    turnId: "turn-1",
    callId: "call-1",
    action: "spawn",
    toolName: "spawn_agent",
    senderThreadId: "parent-1",
    senderAgentPath: "/root",
    receiverThreadIds: ["child-1"],
    receiverAgentPaths: ["/root/reviewer"],
    prompt: "Review this module.",
    result: null,
    taskName: "review",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    agentRole: "reviewer",
    forkTurns: "all",
    status: "completed",
    targetAgentStatuses: {},
    evidence: ["rawFunctionCall"],
    ...overrides
  };
}
