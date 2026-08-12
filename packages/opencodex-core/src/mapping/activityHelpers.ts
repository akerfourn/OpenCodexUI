import type {
  OpenCodexActivity,
  OpenCodexPlanSnapshot,
  OpenCodexPlanStep
} from "@open-codex-ui/opencodex-protocol";

import { readObject, readString } from "./primitives.js";

/**
 * Creates a running activity record.
 *
 * @param id Activity identifier.
 * @param threadId Thread identifier.
 * @param kind Activity kind.
 * @param turnId Turn identifier.
 * @param content Activity content.
 *
 * @returns Activity record.
 */
export function createActivity(
  id: string,
  threadId: string,
  kind: string,
  turnId: string,
  content: string,
  status: OpenCodexActivity["status"] = "running",
  summary?: string | null,
  details?: string | null,
  plan?: OpenCodexPlanSnapshot | null
): OpenCodexActivity {
  return {
    id,
    threadId,
    kind,
    title: turnId.length > 0 ? turnId : undefined,
    content,
    summary,
    details,
    plan,
    status
  };
}

/** Reads the structured plan snapshot from a Codex plan notification or item. */
export function readPlanSnapshot(value: Record<string, unknown>): OpenCodexPlanSnapshot | null {
  const explanation = readString(value.explanation);
  const nestedPlan = readObject(value.plan);
  const rawSteps = Array.isArray(value.plan)
    ? value.plan
    : Array.isArray(nestedPlan.steps) ? nestedPlan.steps : [];
  const nestedExplanation = readString(nestedPlan.explanation);
  const resolvedExplanation = explanation.length > 0 ? explanation : nestedExplanation;
  const steps: OpenCodexPlanStep[] = rawSteps
    .map((entry) => readObject(entry))
    .map((entry) => ({
      step: readString(entry.step),
      status: readString(entry.status)
    }))
    .filter((entry): entry is OpenCodexPlanStep =>
      entry.step.length > 0 && (
        entry.status === "pending" ||
        entry.status === "inProgress" ||
        entry.status === "completed"
      )
    );

  if (steps.length === 0 && resolvedExplanation.length === 0) {
    return null;
  }

  return {
    explanation: resolvedExplanation.length > 0 ? resolvedExplanation : null,
    steps
  };
}
