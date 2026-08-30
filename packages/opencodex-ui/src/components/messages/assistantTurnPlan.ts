import type {
  OpenCodexPlanSnapshot,
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
  isRunning: boolean,
  plan: OpenCodexPlanSnapshot | null
): boolean {
  return isRunning && plan !== null;
}

/** Keeps structured plans in history only when they are not already pinned. */
export function shouldIncludeActivityItemInTimeline(
  item: OpenCodexTurnItem,
  isPersistentPlanVisible: boolean
): boolean {
  return !isPersistentPlanVisible || !isStructuredPlanItem(item);
}
