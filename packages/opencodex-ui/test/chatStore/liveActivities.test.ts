/** Covers replacement and enrichment of live activity items. */
import { describe, expect, it } from "vitest";

import { buildChatTurnStructure } from "../../src/stores/chat/chatTurnStructure";
import {
  createChatStore,
  createCommandActivity,
  createPlanActivity
} from "./chatStoreFixtures";

describe("ChatStore live activities", () => {
  it("should keep the latest command details when output arrives later", () => {
    const chatStore = createChatStore({});

    chatStore.timeline.applyActivityUpdated(createCommandActivity(
      "Commande: npm test",
      "running",
      { command: "npm test", aggregatedOutput: null }
    ), null, null);
    chatStore.timeline.applyActivityUpdated(createCommandActivity(
      "Tests terminés",
      "completed",
      { command: "npm test", aggregatedOutput: "1 test passed" }
    ), null, null);

    expect(chatStore.timeline.turns[0]?.items[0]?.details).toContain("1 test passed");
  });

  it("should replace a live plan with its latest structured snapshot", () => {
    const chatStore = createChatStore({});

    chatStore.timeline.applyActivityUpdated(createPlanActivity(
      "inProgress: Analyser",
      [{ step: "Analyser", status: "inProgress" }]
    ), null, null);
    chatStore.timeline.applyActivityUpdated(createPlanActivity(
      "completed: Analyser\npending: Implémenter",
      [
        { step: "Analyser", status: "completed" },
        { step: "Implémenter", status: "pending" }
      ]
    ), null, null);

    expect(chatStore.timeline.turns[0]?.items).toHaveLength(1);
    expect(chatStore.timeline.turns[0]?.items[0]).toMatchObject({
      id: "plan-turn-1",
      content: "completed: Analyser\npending: Implémenter",
      plan: {
        explanation: null,
        steps: [
          { step: "Analyser", status: "completed" },
          { step: "Implémenter", status: "pending" }
        ]
      }
    });
  });

  it("should move a plan to the latest reasoning block after steering", () => {
    const chatStore = createChatStore({});
    const turn = {
      id: "turn-1",
      threadId: "thread-1",
      status: "running",
      startedAt: null,
      completedAt: null,
      durationMs: null,
      items: [
        {
          id: "user-1",
          role: "user" as const,
          content: "Initial request",
          status: "completed" as const,
          createdAt: null
        },
        {
          id: "reasoning-1",
          role: "assistant" as const,
          phase: "commentary" as const,
          content: "First reasoning block",
          status: "completed" as const,
          createdAt: null
        }
      ]
    };

    chatStore.timeline.setTurns([turn]);
    chatStore.timeline.applyActivityUpdated(createPlanActivity(
      "inProgress: Initial plan",
      [{ step: "Initial plan", status: "inProgress" }]
    ), "turn-1", null);
    chatStore.timeline.createOptimisticSteerItem("turn-1", "Continue", []);

    let structure = buildChatTurnStructure(chatStore.timeline.turns[0]!);
    expect(structure.subTurns).toHaveLength(2);
    expect(structure.subTurns[0]?.reasoningItems.some((item) => item.kind === "plan"))
      .toBe(false);
    expect(structure.subTurns[1]?.reasoningItems.some((item) => item.kind === "plan"))
      .toBe(true);

    chatStore.timeline.applyActivityUpdated({
      ...createPlanActivity(
        "completed: Initial plan\ninProgress: Follow-up",
        [
          { step: "Initial plan", status: "completed" },
          { step: "Follow-up", status: "inProgress" }
        ]
      ),
      id: "plan-after-steer"
    }, "turn-1", null);

    structure = buildChatTurnStructure(chatStore.timeline.turns[0]!);
    expect(structure.subTurns[0]?.reasoningItems.some((item) => item.kind === "plan"))
      .toBe(false);
    expect(structure.subTurns[1]?.reasoningItems).toEqual([
      expect.objectContaining({
        kind: "plan",
        content: "completed: Initial plan\ninProgress: Follow-up"
      })
    ]);
  });
});
