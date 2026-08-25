import { describe, expect, it } from "vitest";

import type {
  OpenCodexPlanSnapshot,
  OpenCodexTurn,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

import {
  isStructuredPlanItem,
  readLatestStructuredPlan,
  shouldShowPersistentPlan
} from "../src/components/messages/assistantTurnPlan";

function createPlan(overrides: Partial<OpenCodexPlanSnapshot> = {}): OpenCodexPlanSnapshot {
  return {
    explanation: null,
    steps: [{ step: "Analyser", status: "inProgress" }],
    ...overrides
  };
}

function createItem(
  id: string,
  plan: OpenCodexPlanSnapshot | null | undefined
): OpenCodexTurnItem {
  return {
    id,
    role: "activity",
    content: "",
    status: "completed",
    createdAt: null,
    kind: "plan",
    plan
  };
}

function createTurn(overrides: Partial<OpenCodexTurn> = {}): OpenCodexTurn {
  return {
    id: "turn-1",
    threadId: "thread-1",
    status: "completed",
    errorMessage: null,
    startedAt: null,
    completedAt: "2026-08-25T10:00:00.000Z",
    durationMs: 1_000,
    items: [],
    ...overrides
  };
}

describe("assistant turn plan", () => {
  it("returns the most recent structured plan", () => {
    const firstPlan = createPlan();
    const latestPlan = createPlan({
      steps: [{ step: "Finaliser", status: "completed" }]
    });

    expect(readLatestStructuredPlan([
      createItem("plan-1", firstPlan),
      createItem("plan-2", latestPlan)
    ])).toEqual(latestPlan);
  });

  it("does not classify legacy text-only plans as structured plans", () => {
    expect(isStructuredPlanItem(createItem("plan-1", null))).toBe(false);
    expect(isStructuredPlanItem(createItem("plan-2", undefined))).toBe(false);
  });

  it("keeps a completed plan visible while the turn is still running", () => {
    const completedPlan = createPlan({
      steps: [{ step: "Terminer", status: "completed" }]
    });

    expect(shouldShowPersistentPlan(createTurn(), true, completedPlan)).toBe(true);
  });

  it("keeps an incomplete plan visible after a terminal turn", () => {
    expect(shouldShowPersistentPlan(createTurn(), false, createPlan())).toBe(true);
  });

  it("hides a completed plan after the turn is terminal", () => {
    const completedPlan = createPlan({
      steps: [{ step: "Terminer", status: "completed" }]
    });

    expect(shouldShowPersistentPlan(createTurn(), false, completedPlan)).toBe(false);
  });
});
