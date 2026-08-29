/** Maps native Codex goal payloads to the OpenCodexUI protocol. */
import type {
  OpenCodexThreadGoal,
  OpenCodexThreadGoalStatus
} from "@open-codex-ui/opencodex-protocol";

import { readNullableNumber, readObject, readString } from "../../mapping.js";

const GOAL_STATUSES: readonly OpenCodexThreadGoalStatus[] = [
  "active",
  "paused",
  "blocked",
  "usageLimited",
  "budgetLimited",
  "complete"
];

/** Identifies a goal update emitted by the Codex app-server. */
export type ThreadGoalUpdated = {
  threadId: string;
  goal: OpenCodexThreadGoal;
};

/**
 * Maps one native goal object.
 *
 * @param value Raw goal value returned by Codex.
 * @param fallbackThreadId Thread id carried by the surrounding response.
 * @returns Normalized goal, or `null` when the status is unsupported.
 */
export function mapThreadGoal(
  value: unknown,
  fallbackThreadId = ""
): OpenCodexThreadGoal | null {
  const goal = readObject(value);
  const threadId = readString(goal.threadId) || fallbackThreadId;
  const status = readGoalStatus(goal.status);

  if (threadId.length === 0 || status === null) {
    return null;
  }

  return {
    threadId,
    objective: readString(goal.objective),
    status,
    tokenBudget: readNullableNumber(goal.tokenBudget),
    tokensUsed: readGoalNumber(goal.tokensUsed),
    timeUsedSeconds: readGoalNumber(goal.timeUsedSeconds),
    createdAt: readGoalNumber(goal.createdAt),
    updatedAt: readGoalNumber(goal.updatedAt)
  };
}

/**
 * Maps a `thread/goal/updated` notification.
 *
 * @param params Raw notification parameters.
 * @returns Thread and goal, or `null` when the payload is incomplete.
 */
export function mapThreadGoalUpdatedNotification(
  params: unknown
): ThreadGoalUpdated | null {
  const value = readObject(params);
  const threadId = readString(value.threadId);
  const goal = mapThreadGoal(value.goal, threadId);

  if (threadId.length === 0 || goal === null) {
    return null;
  }

  return { threadId, goal };
}

/**
 * Reads a `thread/goal/cleared` notification.
 *
 * @param params Raw notification parameters.
 * @returns Thread id, or `null` when absent.
 */
export function mapThreadGoalClearedNotification(params: unknown): string | null {
  const threadId = readString(readObject(params).threadId);
  return threadId.length > 0 ? threadId : null;
}

/** Reads a supported native goal status. */
function readGoalStatus(value: unknown): OpenCodexThreadGoalStatus | null {
  const status = readString(value);
  return GOAL_STATUSES.includes(status as OpenCodexThreadGoalStatus)
    ? (status as OpenCodexThreadGoalStatus)
    : null;
}

/** Reads a goal counter while keeping malformed payloads harmless. */
function readGoalNumber(value: unknown): number {
  return readNullableNumber(value) ?? 0;
}
