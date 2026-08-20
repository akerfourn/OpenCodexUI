/** Covers replacement and enrichment of live activity items. */
import { describe, expect, it } from "vitest";

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
});
