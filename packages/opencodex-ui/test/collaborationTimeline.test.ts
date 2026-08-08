import { describe, expect, it } from "vitest";

import type {
  OpenCodexCollaborationEvent
} from "@open-codex-ui/opencodex-protocol";

import { buildCollaborationTimeline } from "../src/components/messages/collaborationTimeline";

describe("collaboration timeline", () => {
  it("should attach an observed outgoing event to its sender turn", () => {
    const event = createEvent({
      id: "spawn-1",
      threadId: "parent-1",
      turnId: "turn-1",
      senderThreadId: "parent-1",
      receiverThreadIds: ["child-1"]
    });

    const timeline = buildCollaborationTimeline([event], "parent-1");

    expect(timeline.threadEvents).toEqual([]);
    expect(timeline.eventsByTurnId.get("turn-1")).toEqual([event]);
  });

  it("should keep an inbound delegation separate from inherited child context", () => {
    const event = createEvent({
      id: "spawn-1",
      threadId: "parent-1",
      turnId: "parent-turn-1",
      senderThreadId: "parent-1",
      receiverThreadIds: ["child-1"]
    });

    const timeline = buildCollaborationTimeline([event], "child-1");

    expect(timeline.threadEvents).toEqual([event]);
    expect(timeline.eventsByTurnId.size).toBe(0);
  });

  it("should render one logical event only once within a thread timeline", () => {
    const event = createEvent({ id: "message-1" });

    const timeline = buildCollaborationTimeline([event, event], "parent-1");

    expect(timeline.eventsByTurnId.get("turn-1")).toEqual([event]);
  });
});

/** Creates a normalized collaboration event fixture. */
function createEvent(
  overrides: Partial<OpenCodexCollaborationEvent>
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
