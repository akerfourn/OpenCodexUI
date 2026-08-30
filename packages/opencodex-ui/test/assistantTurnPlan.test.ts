import { describe, expect, it } from "vitest";

import type {
  OpenCodexPlanSnapshot,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

import {
  isStructuredPlanItem,
  readLatestStructuredPlan,
  shouldIncludeActivityItemInTimeline,
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

    expect(shouldShowPersistentPlan(true, completedPlan)).toBe(true);
  });

  it("moves an incomplete plan back into history after the turn stops", () => {
    expect(shouldShowPersistentPlan(false, createPlan())).toBe(false);
  });

  it("moves a completed plan back into history after the turn stops", () => {
    const completedPlan = createPlan({
      steps: [{ step: "Terminer", status: "completed" }]
    });

    expect(shouldShowPersistentPlan(false, completedPlan)).toBe(false);
  });

  it("does not show a persistent plan when no structured plan exists", () => {
    expect(shouldShowPersistentPlan(true, null)).toBe(false);
  });

  it("moves a historical plan into the collapsible activity timeline", () => {
    const planItem = createItem("plan-1", createPlan());

    expect(shouldIncludeActivityItemInTimeline(planItem, true)).toBe(false);
    expect(shouldIncludeActivityItemInTimeline(planItem, false)).toBe(true);
  });
});
