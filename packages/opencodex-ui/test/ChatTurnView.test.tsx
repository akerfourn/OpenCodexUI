import { describe, expect, it } from "vitest";

import type {
  OpenCodexCollaborationEvent,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import {
  buildReasoningTimelineEntries,
  assignCollaborationEvents
} from "../src/components/messages/collaborationReasoningTimeline";
import { ChatTurnStore } from "../src/stores/ChatTurnStore";

describe("ChatTurnView", () => {
  it("should replace a correlated activity at its position before the final answer", () => {
    const turn = createTurn();
    const event = createCollaborationEvent();
    const turnStore = new ChatTurnStore(turn);
    const subTurn = turnStore.subTurns[0];

    expect(subTurn).toBeDefined();

    if (subTurn === undefined) {
      return;
    }

    const eventsBySubTurnId = assignCollaborationEvents(turnStore.subTurns, [event]);
    const timelineContents = buildReasoningTimelineEntries(
      subTurn.reasoningItems,
      eventsBySubTurnId.get(subTurn.id) ?? []
    ).map(readTimelineContent);

    expect(timelineContents).toEqual([
      "REASONING_BEFORE_DELEGATION",
      "DEDICATED_DELEGATION_PROMPT",
      "REASONING_AFTER_DELEGATION"
    ]);
  });

  it("should keep an unanchored event in the preparation block before the answer", () => {
    const turn = createTurn();
    const event = createCollaborationEvent({ callId: null });
    const turnStore = new ChatTurnStore(turn);
    const subTurn = turnStore.subTurns[0];

    expect(subTurn).toBeDefined();

    if (subTurn === undefined) {
      return;
    }

    const eventsBySubTurnId = assignCollaborationEvents(turnStore.subTurns, [event]);
    const timelineContents = buildReasoningTimelineEntries(
      subTurn.reasoningItems,
      eventsBySubTurnId.get(subTurn.id) ?? []
    ).map(readTimelineContent);

    expect(timelineContents).toEqual([
      "REASONING_BEFORE_DELEGATION",
      "GENERIC_COLLABORATION_ACTIVITY",
      "REASONING_AFTER_DELEGATION",
      "DEDICATED_DELEGATION_PROMPT"
    ]);
  });
});

/** Reads the visible content represented by one mixed reasoning timeline entry. */
function readTimelineContent(
  entry: ReturnType<typeof buildReasoningTimelineEntries>[number]
): string | null {
  return entry.type === "item" ? entry.item.content : entry.event.prompt;
}

/** Creates a turn containing the raw activity correlated to the dedicated card. */
function createTurn(): OpenCodexTurn {
  return {
    id: "turn-1",
    threadId: "parent-1",
    status: "completed",
    startedAt: null,
    completedAt: null,
    durationMs: null,
    items: [
      {
        id: "reasoning-before",
        role: "assistant",
        phase: "commentary",
        content: "REASONING_BEFORE_DELEGATION",
        status: "completed",
        createdAt: null
      },
      {
        id: "call-1",
        role: "activity",
        content: "GENERIC_COLLABORATION_ACTIVITY",
        status: "completed",
        createdAt: null,
        kind: "subAgentActivity"
      },
      {
        id: "reasoning-after",
        role: "assistant",
        phase: "commentary",
        content: "REASONING_AFTER_DELEGATION",
        status: "completed",
        createdAt: null
      },
      {
        id: "answer-1",
        role: "assistant",
        phase: "final_answer",
        content: "FINAL_ASSISTANT_ANSWER",
        status: "completed",
        createdAt: null
      }
    ]
  };
}

/** Creates the normalized event that supersedes the generic activity row. */
function createCollaborationEvent(
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
    prompt: "DEDICATED_DELEGATION_PROMPT",
    result: null,
    taskName: "review",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    agentRole: "explorer",
    forkTurns: "all",
    status: "completed",
    targetAgentStatuses: {},
    evidence: ["rawFunctionCall", "canonicalItem"],
    ...overrides
  };
}
