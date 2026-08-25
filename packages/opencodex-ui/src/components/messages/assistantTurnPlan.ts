import type {
  OpenCodexPlanSnapshot,
  OpenCodexTurn,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

/** Returns the most recent structured plan emitted during a turn. */
export function readLatestStructuredPlan(
  items: readonly OpenCodexTurnItem[]
): OpenCodexPlanSnapshot | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];

    if (item !== undefined && isStructuredPlanItem(item)) {
      return item.plan;
    }
  }

  return null;
}

/** Checks whether an item contains the structured plan projection. */
export function isStructuredPlanItem(
  item: OpenCodexTurnItem
): item is OpenCodexTurnItem & { plan: OpenCodexPlanSnapshot } {
  return item.role === "activity" && item.kind === "plan" && item.plan !== null
    && item.plan !== undefined;
}

/** Determines whether a plan should remain visible below the activity stream. */
export function shouldShowPersistentPlan(
  turn: OpenCodexTurn,
  isRunning: boolean,
  plan: OpenCodexPlanSnapshot | null
): boolean {
  if (plan === null) {
    return false;
  }

  return isRunning || !isPlanComplete(plan) || !isTurnFinished(turn);
}

/** Checks whether every explicit plan step has reached the completed state. */
function isPlanComplete(plan: OpenCodexPlanSnapshot): boolean {
  return plan.steps.length > 0 && plan.steps.every((step) => step.status === "completed");
}

/** Checks whether the turn has a terminal status or completion timestamp. */
function isTurnFinished(turn: OpenCodexTurn): boolean {
  return turn.completedAt !== null
    || turn.status === "completed"
    || turn.status === "failed"
    || turn.status === "interrupted";
}
