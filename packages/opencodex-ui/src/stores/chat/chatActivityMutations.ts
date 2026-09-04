import type {
  OpenCodexActivity,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ChatTimelineStore } from "./ChatTimelineStore";
import {
  findOrCreateTurn,
  movePlanItemsToLatestSubTurn
} from "./chatTurnMutations";
import { toMessageStatus } from "./chatTurnUtils";

/**
 * Appends or updates an activity item inside the active turn.
 *
 * @param timeline Timeline store to mutate.
 * @param activity Live activity payload.
 * @param turnId Target turn identifier.
 * @param threadId Owning thread identifier.
 * @returns Whether the turn's structural decomposition must be rebuilt.
 */
export function appendActivityItem(
  timeline: ChatTimelineStore,
  activity: OpenCodexActivity,
  turnId: string | null,
  threadId: string
): boolean {
  if (
    activity.content === undefined ||
    activity.content.trim().length === 0 ||
    isEmptyReasoningActivity(activity.kind, activity.content)
  ) {
    return false;
  }

  if (turnId === null || turnId.length === 0) {
    return false;
  }

  const turn = findOrCreateTurn(timeline, threadId, turnId);
  const existing = findExistingActivityItem(turn, activity);
  turn.status = "running";

  if (existing !== undefined) {
    if (activity.summary !== undefined && activity.summary !== null) {
      existing.summary = activity.summary;
    }

    if (activity.details !== undefined && activity.details !== null) {
      existing.details = activity.details;
    }

    if (activity.plan !== undefined) {
      existing.plan = activity.plan;
    }

    if (activity.kind === "fileChange" || activity.kind === "plan") {
      existing.content = activity.content;
      existing.status = toMessageStatus(activity.status);

      if (activity.kind === "plan") {
        const normalizedTurn = movePlanItemsToLatestSubTurn(turn);
        turn.items = normalizedTurn.items;
        return normalizedTurn !== turn;
      }

      return false;
    }

    if (normalizeActivityContent(existing.content) === normalizeActivityContent(activity.content)) {
      existing.status = toMessageStatus(activity.status);
      return false;
    }

    existing.content += activity.content;
    existing.status = toMessageStatus(activity.status);
    return false;
  }

  turn.items.push({
    id: activity.id,
    role: "activity",
    content: activity.content,
    status: toMessageStatus(activity.status),
    createdAt: new Date().toISOString(),
    kind: activity.kind,
    summary: activity.summary,
    details: activity.details,
    plan: activity.plan
  });

  if (activity.kind === "plan") {
    const normalizedTurn = movePlanItemsToLatestSubTurn(turn);
    turn.items = normalizedTurn.items;
  }

  return true;
}

/**
 * Finds the activity item that a live update should replace.
 *
 * Plan notifications are snapshots of one plan per turn. When Codex omits
 * or changes the generated plan id, the existing plan kind remains the safest
 * association available.
 *
 * @param turn Turn containing the activity.
 * @param activity Incoming activity update.
 * @returns Matching item, or `undefined` when it is new.
 */
function findExistingActivityItem(
  turn: OpenCodexTurn,
  activity: OpenCodexActivity
): OpenCodexTurn["items"][number] | undefined {
  if (activity.kind !== "plan") {
    return turn.items.find((item) => item.id === activity.id);
  }

  return turn.items.find((item) => (
    item.id === activity.id && item.role === "activity" && item.kind === "plan"
  )) ?? turn.items.find((item) => item.role === "activity" && item.kind === "plan");
}

/**
 * Detects empty serialized reasoning activities.
 *
 * @param kind Activity kind.
 * @param content Activity content.
 * @returns Whether the activity should be ignored.
 */
function isEmptyReasoningActivity(kind: string, content: string): boolean {
  if (kind !== "reasoning") {
    return false;
  }

  const trimmedContent = content.trim();

  if (trimmedContent.length === 0) {
    return true;
  }

  if (!trimmedContent.startsWith("{")) {
    return false;
  }

  try {
    const payload = JSON.parse(trimmedContent) as unknown;
    return isEmptyReasoningPayload(payload);
  } catch {
    return false;
  }
}

/**
 * Checks whether a parsed reasoning payload has no displayable text.
 *
 * @param value Parsed reasoning payload.
 * @returns Whether summary and content are empty.
 */
function isEmptyReasoningPayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const payload = value as {
    type?: unknown;
    summary?: unknown;
    content?: unknown;
  };

  if (payload.type !== "reasoning") {
    return false;
  }

  return readReasoningText(payload.summary).length === 0 &&
    readReasoningText(payload.content).length === 0;
}

/**
 * Reads display text from a reasoning segment array.
 *
 * @param value Raw summary/content value.
 * @returns Concatenated reasoning text.
 */
function readReasoningText(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value.map((entry) => readReasoningSegmentText(entry)).join("").trim();
}

/**
 * Reads text from one reasoning segment.
 *
 * @param value Raw segment.
 * @returns Segment text.
 */
function readReasoningSegmentText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "";
  }

  const segment = value as {
    text?: unknown;
    type?: unknown;
    summary?: unknown;
    content?: unknown;
  };

  if (typeof segment.text === "string") {
    return segment.text;
  }

  if (segment.type === "reasoning") {
    return `${readReasoningText(segment.summary)}${readReasoningText(segment.content)}`;
  }

  return "";
}

/**
 * Normalizes activity text before duplicate comparison.
 *
 * @param content Raw activity content.
 * @returns Trimmed content with collapsed whitespace.
 */
function normalizeActivityContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}
