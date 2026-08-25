import type {
  OpenCodexCollaborationEvent,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

import type { ChatSubTurn } from "../../stores/chat/chatTurnStructure";

/** One normal activity or enriched collaboration card in reasoning order. */
export type ReasoningTimelineEntry =
  | { type: "item"; item: OpenCodexTurnItem }
  | { type: "collaboration"; event: OpenCodexCollaborationEvent };

/**
 * Associates collaboration events with the sub-turn containing their activity anchor.
 *
 * Events without a reliable item anchor are attached to the final sub-turn so they remain
 * part of the preparation flow without being placed after the assistant answer.
 *
 * @param subTurns Structured chat segments.
 * @param collaborationEvents Normalized events observed during the turn.
 * @returns Events grouped by the sub-turn that should render them.
 */
export function assignCollaborationEvents(
  subTurns: readonly ChatSubTurn[],
  collaborationEvents: readonly OpenCodexCollaborationEvent[]
): Map<string, OpenCodexCollaborationEvent[]> {
  const eventsBySubTurnId = new Map<string, OpenCodexCollaborationEvent[]>();
  const eventsByCallId = groupEventsByCallId(collaborationEvents);
  const assignedEventIds = new Set<string>();

  for (const subTurn of subTurns) {
    const subTurnEvents: OpenCodexCollaborationEvent[] = [];

    for (const item of subTurn.reasoningItems) {
      if (!isCollaborationActivity(item.kind)) {
        continue;
      }

      for (const event of eventsByCallId.get(item.id) ?? []) {
        subTurnEvents.push(event);
        assignedEventIds.add(event.id);
      }
    }

    if (subTurnEvents.length > 0) {
      eventsBySubTurnId.set(subTurn.id, subTurnEvents);
    }
  }

  const finalSubTurn = subTurns[subTurns.length - 1];

  if (finalSubTurn === undefined) {
    return eventsBySubTurnId;
  }

  const unassignedEvents = collaborationEvents.filter((event) => (
    !assignedEventIds.has(event.id)
  ));

  if (unassignedEvents.length > 0) {
    const finalEvents = eventsBySubTurnId.get(finalSubTurn.id) ?? [];
    eventsBySubTurnId.set(finalSubTurn.id, [...finalEvents, ...unassignedEvents]);
  }

  return eventsBySubTurnId;
}

/** Builds the reasoning timeline while replacing only positively matched activities. */
export function buildReasoningTimelineEntries(
  items: readonly OpenCodexTurnItem[],
  collaborationEvents: readonly OpenCodexCollaborationEvent[]
): ReasoningTimelineEntry[] {
  const eventsByCallId = groupEventsByCallId(collaborationEvents);
  const renderedEventIds = new Set<string>();
  const entries: ReasoningTimelineEntry[] = [];

  for (const item of items) {
    const matchingEvents = isCollaborationActivity(item.kind)
      ? eventsByCallId.get(item.id) ?? []
      : [];

    if (matchingEvents.length === 0) {
      entries.push({ type: "item", item });
      continue;
    }

    for (const event of matchingEvents) {
      entries.push({ type: "collaboration", event });
      renderedEventIds.add(event.id);
    }
  }

  for (const event of collaborationEvents) {
    if (!renderedEventIds.has(event.id)) {
      entries.push({ type: "collaboration", event });
    }
  }

  return entries;
}

/** Groups events by the App Server activity identifier that anchors their position. */
function groupEventsByCallId(
  events: readonly OpenCodexCollaborationEvent[]
): Map<string, OpenCodexCollaborationEvent[]> {
  const eventsByCallId = new Map<string, OpenCodexCollaborationEvent[]>();

  for (const event of events) {
    if (event.callId === null) {
      continue;
    }

    const callEvents = eventsByCallId.get(event.callId) ?? [];
    callEvents.push(event);
    eventsByCallId.set(event.callId, callEvents);
  }

  return eventsByCallId;
}

/** Checks whether an activity can be safely replaced by a normalized event card. */
function isCollaborationActivity(kind: string | undefined): boolean {
  return kind === "collabAgentToolCall" || kind === "subAgentActivity";
}
