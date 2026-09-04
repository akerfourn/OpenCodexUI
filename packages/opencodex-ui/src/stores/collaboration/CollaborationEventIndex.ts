import { makeAutoObservable, observable } from "mobx";

import type { OpenCodexCollaborationEvent } from "@open-codex-ui/opencodex-protocol";

/** Shared immutable result used when an indexed collection has no entries. */
export const EMPTY_COLLABORATION_EVENTS: readonly OpenCodexCollaborationEvent[] = [];

type CollaborationEventIndexLocation = {
  threadKeys: string[];
  contextThreadKeys: string[];
  turnKey: string | null;
};

/**
 * Maintains stable observable collections for collaboration timeline consumers.
 *
 * The canonical event map remains owned by CollaborationStore. This index only
 * stores references to canonical event objects and replaces a single affected
 * collection when an event changes.
 */
export class CollaborationEventIndex {
  /** Events related to a source-aware thread, including turn-attached events. */
  private readonly threadEventsByKey = new Map<string, OpenCodexCollaborationEvent[]>();
  /** Events that should render in a thread context section. */
  private readonly threadContextEventsByKey = new Map<
    string,
    OpenCodexCollaborationEvent[]
  >();
  /** Events anchored to one exact source-aware turn. */
  private readonly turnEventsByKey = new Map<string, OpenCodexCollaborationEvent[]>();
  /** Membership data used to update only affected collections. */
  private readonly locationsBySourceId = new Map<
    string,
    Map<string, CollaborationEventIndexLocation>
  >();

  /** Creates an empty observable event index. */
  constructor() {
    makeAutoObservable<
      CollaborationEventIndex,
      | "locationsBySourceId"
      | "threadEventsByKey"
      | "threadContextEventsByKey"
      | "turnEventsByKey"
    >(this, {
      locationsBySourceId: false,
      threadEventsByKey: observable.shallow,
      threadContextEventsByKey: observable.shallow,
      turnEventsByKey: observable.shallow
    }, { autoBind: true });
  }

  /** Reads all events related to one source-aware thread. */
  readThreadEvents(
    sourceId: string,
    threadId: string
  ): readonly OpenCodexCollaborationEvent[] {
    return this.threadEventsByKey.get(createThreadRootKey(sourceId, threadId))
      ?? EMPTY_COLLABORATION_EVENTS;
  }

  /** Reads context events that are not attached to this thread's turn. */
  readThreadContextEvents(
    sourceId: string,
    threadId: string
  ): readonly OpenCodexCollaborationEvent[] {
    return this.threadContextEventsByKey.get(createThreadRootKey(sourceId, threadId))
      ?? EMPTY_COLLABORATION_EVENTS;
  }

  /** Reads events attached to one exact source-aware turn. */
  readTurnEvents(
    sourceId: string,
    threadId: string,
    turnId: string
  ): readonly OpenCodexCollaborationEvent[] {
    return this.turnEventsByKey.get(createThreadTurnKey(sourceId, threadId, turnId))
      ?? EMPTY_COLLABORATION_EVENTS;
  }

  /** Adds a new canonical event to every collection it belongs to. */
  add(event: OpenCodexCollaborationEvent): void {
    const location = createEventIndexLocation(event);
    let sourceLocations = this.locationsBySourceId.get(event.sourceId);

    if (sourceLocations === undefined) {
      sourceLocations = new Map<string, CollaborationEventIndexLocation>();
      this.locationsBySourceId.set(event.sourceId, sourceLocations);
    }

    sourceLocations.set(event.id, location);
    this.appendToCollections(this.threadEventsByKey, location.threadKeys, event);
    this.appendToCollections(this.threadContextEventsByKey, location.contextThreadKeys, event);

    if (location.turnKey !== null) {
      this.appendToCollections(this.turnEventsByKey, [location.turnKey], event);
    }
  }

  /** Replaces one canonical event while preserving its index position. */
  replace(
    existingEvent: OpenCodexCollaborationEvent,
    nextEvent: OpenCodexCollaborationEvent
  ): void {
    const previousLocation = this.locationsBySourceId
      .get(existingEvent.sourceId)
      ?.get(existingEvent.id) ?? createEventIndexLocation(existingEvent);
    const nextLocation = createEventIndexLocation(nextEvent);

    replaceIndexedEvents(
      this.threadEventsByKey,
      previousLocation.threadKeys,
      nextLocation.threadKeys,
      existingEvent,
      nextEvent
    );
    replaceIndexedEvents(
      this.threadContextEventsByKey,
      previousLocation.contextThreadKeys,
      nextLocation.contextThreadKeys,
      existingEvent,
      nextEvent
    );
    replaceIndexedEvents(
      this.turnEventsByKey,
      toOptionalKey(previousLocation.turnKey),
      toOptionalKey(nextLocation.turnKey),
      existingEvent,
      nextEvent
    );

    this.locationsBySourceId
      .get(existingEvent.sourceId)
      ?.set(existingEvent.id, nextLocation);
  }

  /** Removes one canonical event from all indexed collections. */
  remove(event: OpenCodexCollaborationEvent): void {
    const location = this.locationsBySourceId
      .get(event.sourceId)
      ?.get(event.id) ?? createEventIndexLocation(event);

    this.removeFromCollections(this.threadEventsByKey, location.threadKeys, event.id);
    this.removeFromCollections(
      this.threadContextEventsByKey,
      location.contextThreadKeys,
      event.id
    );

    if (location.turnKey !== null) {
      this.removeFromCollections(this.turnEventsByKey, [location.turnKey], event.id);
    }

    const sourceLocations = this.locationsBySourceId.get(event.sourceId);
    sourceLocations?.delete(event.id);

    if (sourceLocations?.size === 0) {
      this.locationsBySourceId.delete(event.sourceId);
    }
  }

  /** Appends one event to each affected key using fresh array references. */
  private appendToCollections(
    index: Map<string, OpenCodexCollaborationEvent[]>,
    keys: readonly string[],
    event: OpenCodexCollaborationEvent
  ): void {
    for (const key of keys) {
      const events = index.get(key);
      index.set(key, events === undefined ? [event] : [...events, event]);
    }
  }

  /** Removes one event from each affected key and deletes empty collections. */
  private removeFromCollections(
    index: Map<string, OpenCodexCollaborationEvent[]>,
    keys: readonly string[],
    eventId: string
  ): void {
    for (const key of keys) {
      const events = index.get(key);

      if (events === undefined) {
        continue;
      }

      const nextEvents = events.filter((event) => event.id !== eventId);

      if (nextEvents.length === 0) {
        index.delete(key);
      } else if (nextEvents.length !== events.length) {
        index.set(key, nextEvents);
      }
    }
  }
}

/** Builds all source-aware collection memberships for one event. */
function createEventIndexLocation(
  event: OpenCodexCollaborationEvent
): CollaborationEventIndexLocation {
  const relatedThreadIds = Array.from(new Set([
    event.threadId,
    event.senderThreadId,
    ...event.receiverThreadIds
  ].filter((threadId): threadId is string => (
    threadId !== null && threadId.trim().length > 0
  ))));
  const threadKeys = relatedThreadIds.map((threadId) => (
    createThreadRootKey(event.sourceId, threadId)
  ));
  const contextThreadKeys = relatedThreadIds
    .filter((threadId) => event.threadId !== threadId || event.turnId === null)
    .map((threadId) => createThreadRootKey(event.sourceId, threadId));
  const turnKey = event.turnId === null
    ? null
    : createThreadTurnKey(event.sourceId, event.threadId, event.turnId);

  return { threadKeys, contextThreadKeys, turnKey };
}

/** Replaces or moves one event across the affected indexed keys. */
function replaceIndexedEvents(
  index: Map<string, OpenCodexCollaborationEvent[]>,
  previousKeys: readonly string[],
  nextKeys: readonly string[],
  existingEvent: OpenCodexCollaborationEvent,
  nextEvent: OpenCodexCollaborationEvent
): void {
  const allKeys = new Set([...previousKeys, ...nextKeys]);

  for (const key of allKeys) {
    const wasIndexed = previousKeys.includes(key);
    const isIndexed = nextKeys.includes(key);

    if (wasIndexed && isIndexed) {
      const events = index.get(key);
      const eventIndex = events?.findIndex((event) => event.id === existingEvent.id) ?? -1;

      if (events === undefined || eventIndex < 0) {
        continue;
      }

      const nextEvents = [...events];
      nextEvents[eventIndex] = nextEvent;
      index.set(key, nextEvents);
      continue;
    }

    if (wasIndexed) {
      removeIndexedEvent(index, key, existingEvent.id);
      continue;
    }

    const events = index.get(key);
    index.set(key, events === undefined ? [nextEvent] : [...events, nextEvent]);
  }
}

/** Removes an event from one indexed collection. */
function removeIndexedEvent(
  index: Map<string, OpenCodexCollaborationEvent[]>,
  key: string,
  eventId: string
): void {
  const events = index.get(key);

  if (events === undefined) {
    return;
  }

  const nextEvents = events.filter((event) => event.id !== eventId);

  if (nextEvents.length === 0) {
    index.delete(key);
    return;
  }

  if (nextEvents.length !== events.length) {
    index.set(key, nextEvents);
  }
}

/** Converts an optional key into the collection shape used by replacement. */
function toOptionalKey(key: string | null): readonly string[] {
  return key === null ? [] : [key];
}

/** Builds a collision-free key for one source-aware thread. */
export function createThreadRootKey(sourceId: string, threadId: string): string {
  return `${encodeURIComponent(sourceId)}:${encodeURIComponent(threadId)}`;
}

/** Builds a collision-free key for one source-aware turn. */
function createThreadTurnKey(sourceId: string, threadId: string, turnId: string): string {
  return `${createThreadRootKey(sourceId, threadId)}:${encodeURIComponent(turnId)}`;
}
