import type {
  OpenCodexCollaborationEvent
} from "@open-codex-ui/opencodex-protocol";

/** Collaboration events grouped by their reliable position in one thread timeline. */
export type CollaborationTimeline = {
  threadEvents: OpenCodexCollaborationEvent[];
  eventsByTurnId: Map<string, OpenCodexCollaborationEvent[]>;
};

/**
 * Groups collaboration events without inventing a receiver-side turn association.
 *
 * Events observed in the current thread with a turn identifier are attached to that
 * turn. Inbound or structurally inferred events remain in a distinct thread context
 * section so inherited messages cannot be mistaken for delegation instructions.
 *
 * @param events Events known for the current thread.
 * @param threadId Current thread identifier.
 * @returns Deduplicated thread-level and turn-level event groups.
 */
export function buildCollaborationTimeline(
  events: readonly OpenCodexCollaborationEvent[],
  threadId: string
): CollaborationTimeline {
  const threadEvents: OpenCodexCollaborationEvent[] = [];
  const eventsByTurnId = new Map<string, OpenCodexCollaborationEvent[]>();
  const seenEventIds = new Set<string>();

  for (const event of events) {
    if (seenEventIds.has(event.id) || !isEventRelatedToThread(event, threadId)) {
      continue;
    }

    seenEventIds.add(event.id);

    if (event.threadId === threadId && event.turnId !== null) {
      const turnEvents = eventsByTurnId.get(event.turnId) ?? [];
      turnEvents.push(event);
      eventsByTurnId.set(event.turnId, turnEvents);
      continue;
    }

    threadEvents.push(event);
  }

  return { threadEvents, eventsByTurnId };
}

/**
 * Checks whether an event names the current thread as observer, sender, or receiver.
 *
 * @param event Collaboration event to inspect.
 * @param threadId Current thread identifier.
 * @returns Whether the event belongs in the thread timeline.
 */
function isEventRelatedToThread(
  event: OpenCodexCollaborationEvent,
  threadId: string
): boolean {
  return event.threadId === threadId
    || event.senderThreadId === threadId
    || event.receiverThreadIds.includes(threadId);
}
