import { makeAutoObservable } from "mobx";

import type {
  OpenCodexCollaborationEvent,
  OpenCodexCollaborationQuery,
  OpenCodexEvent
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../RootStore";
import {
  CollaborationEventIndex,
  createThreadRootKey
} from "./CollaborationEventIndex";

/**
 * Maintains source-scoped normalized collaboration events for future timeline views.
 */
export class CollaborationStore {
  /** Normalized events grouped by their owning Codex source. */
  private readonly eventsBySourceId = new Map<string, Map<string, OpenCodexCollaborationEvent>>();
  /** Stable source/thread/turn collections used by timeline observers. */
  private readonly eventIndex = new CollaborationEventIndex();
  /** Thread roots whose persisted collaboration history has already been loaded. */
  private readonly loadedThreadRoots = new Set<string>();
  /** In-flight history requests shared by concurrent timeline consumers. */
  private readonly loadingThreadRoots = new Map<
    string,
    Promise<OpenCodexCollaborationEvent[]>
  >();

  /**
   * Creates the collaboration store.
   *
   * @param root Root store used for backend requests.
   */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<
      CollaborationStore,
      | "root"
      | "eventsBySourceId"
      | "eventIndex"
      | "loadedThreadRoots"
      | "loadingThreadRoots"
    >(this, {
      root: false,
      eventsBySourceId: false,
      eventIndex: false,
      loadedThreadRoots: false,
      loadingThreadRoots: false
    });
  }

  /**
   * Applies one live normalized collaboration update.
   *
   * @param event Backend event.
   */
  handleEvent(event: OpenCodexEvent): void {
    if (event.type !== "collaboration.updated") {
      return;
    }

    this.upsert(event.event);
  }

  /**
   * Loads collaboration events matching an explicit source-aware query.
   *
   * @param query Source and optional routing filters.
   * @returns Events in backend-defined chronological order.
   */
  async list(query: OpenCodexCollaborationQuery): Promise<OpenCodexCollaborationEvent[]> {
    const events = await this.root.request<OpenCodexCollaborationEvent[]>({
      type: "threads.collaboration.list",
      ...query
    });

    events.forEach((event) => this.upsert(event));
    return events;
  }

  /**
   * Loads the persisted collaboration subtree needed by one thread timeline once.
   *
   * @param sourceId Source that owns the thread.
   * @param threadId Thread used as the source-aware hierarchy root.
   * @returns Events returned by the backend or already known locally.
   */
  loadThreadEvents(
    sourceId: string,
    threadId: string
  ): Promise<OpenCodexCollaborationEvent[]> {
    const rootKey = createThreadRootKey(sourceId, threadId);

    if (this.loadedThreadRoots.has(rootKey)) {
      return Promise.resolve([...this.readThreadEvents(sourceId, threadId)]);
    }

    const existingRequest = this.loadingThreadRoots.get(rootKey);

    if (existingRequest !== undefined) {
      return existingRequest;
    }

    const request = this.list({ sourceId, rootThreadId: threadId })
      .then((events) => {
        this.loadedThreadRoots.add(rootKey);
        return events;
      })
      .finally(() => {
        this.loadingThreadRoots.delete(rootKey);
      });

    this.loadingThreadRoots.set(rootKey, request);
    return request;
  }

  /**
   * Reads events currently known for one thread as sender, receiver, or observer.
   *
   * @param sourceId Source that owns the thread.
   * @param threadId Thread identifier.
   * @returns Known matching events in insertion order.
   */
  readThreadEvents(
    sourceId: string,
    threadId: string
  ): readonly OpenCodexCollaborationEvent[] {
    return this.eventIndex.readThreadEvents(sourceId, threadId);
  }

  /**
   * Reads events that belong to a thread context rather than a specific turn.
   *
   * @param sourceId Source that owns the thread.
   * @param threadId Thread identifier.
   * @returns Stable context event collection.
   */
  readThreadContextEvents(
    sourceId: string,
    threadId: string
  ): readonly OpenCodexCollaborationEvent[] {
    return this.eventIndex.readThreadContextEvents(sourceId, threadId);
  }

  /**
   * Reads events anchored to one exact source-aware turn.
   *
   * @param sourceId Source that owns the thread.
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   * @returns Stable turn event collection.
   */
  readTurnEvents(
    sourceId: string,
    threadId: string,
    turnId: string
  ): readonly OpenCodexCollaborationEvent[] {
    return this.eventIndex.readTurnEvents(sourceId, threadId, turnId);
  }

  /**
   * Inserts or replaces one event by its source-scoped stable identity.
   *
   * @param event Normalized event.
   */
  private upsert(event: OpenCodexCollaborationEvent): void {
    let sourceEvents = this.eventsBySourceId.get(event.sourceId);

    if (sourceEvents === undefined) {
      sourceEvents = new Map<string, OpenCodexCollaborationEvent>();
      this.eventsBySourceId.set(event.sourceId, sourceEvents);
    }

    if (isStructuralSpawn(event)) {
      const hasConcreteEvent = Array.from(sourceEvents.values()).some((candidate) => (
        isConcreteSpawn(candidate) && hasSharedReceiver(candidate, event)
      ));

      if (hasConcreteEvent) {
        return;
      }
    } else if (isConcreteSpawn(event)) {
      for (const [eventId, candidate] of sourceEvents.entries()) {
        if (isStructuralSpawn(candidate) && hasSharedReceiver(candidate, event)) {
          this.removeCanonicalEvent(event.sourceId, eventId);
        }
      }
    }

    const existingEvent = sourceEvents.get(event.id);

    if (existingEvent === undefined) {
      sourceEvents.set(event.id, event);
      this.eventIndex.add(event);
      return;
    }

    const mergedEvent = mergeCollaborationEvent(existingEvent, event);

    if (!areCollaborationEventsEqual(existingEvent, mergedEvent)) {
      sourceEvents.set(event.id, mergedEvent);
      this.eventIndex.replace(existingEvent, mergedEvent);
    }
  }

  /** Removes one canonical event and its source-aware index entries. */
  private removeCanonicalEvent(sourceId: string, eventId: string): void {
    const sourceEvents = this.eventsBySourceId.get(sourceId);
    const event = sourceEvents?.get(eventId);

    if (sourceEvents === undefined || event === undefined) {
      return;
    }

    sourceEvents.delete(eventId);
    this.eventIndex.remove(event);
  }
}

/** Returns whether an event is a structure-only spawn placeholder. */
function isStructuralSpawn(event: OpenCodexCollaborationEvent): boolean {
  return event.action === "spawn" && event.evidence.includes("structuralInference");
}

/** Returns whether an event is a spawn backed by semantic App Server evidence. */
function isConcreteSpawn(event: OpenCodexCollaborationEvent): boolean {
  return event.action === "spawn" && !event.evidence.includes("structuralInference");
}

/** Returns whether two spawn events identify at least one common receiver. */
function hasSharedReceiver(
  first: OpenCodexCollaborationEvent,
  second: OpenCodexCollaborationEvent
): boolean {
  return first.receiverThreadIds.some((threadId) => second.receiverThreadIds.includes(threadId))
    || first.receiverAgentPaths.some((agentPath) => second.receiverAgentPaths.includes(agentPath));
}

/**
 * Enriches a known event without letting a late partial snapshot erase live details.
 *
 * @param existing Event already visible in the UI.
 * @param incoming Newly loaded or streamed representation.
 * @returns Most complete stable representation.
 */
function mergeCollaborationEvent(
  existing: OpenCodexCollaborationEvent,
  incoming: OpenCodexCollaborationEvent
): OpenCodexCollaborationEvent {
  return {
    ...incoming,
    action: mergeAction(existing, incoming),
    turnId: incoming.turnId ?? existing.turnId,
    callId: incoming.callId ?? existing.callId,
    toolName: incoming.toolName ?? existing.toolName,
    senderThreadId: incoming.senderThreadId ?? existing.senderThreadId,
    senderAgentPath: incoming.senderAgentPath ?? existing.senderAgentPath,
    receiverThreadIds: mergeUniqueValues(
      existing.receiverThreadIds,
      incoming.receiverThreadIds
    ),
    receiverAgentPaths: mergeUniqueValues(
      existing.receiverAgentPaths,
      incoming.receiverAgentPaths
    ),
    prompt: incoming.prompt ?? existing.prompt,
    result: incoming.result ?? existing.result,
    taskName: incoming.taskName ?? existing.taskName,
    model: incoming.model ?? existing.model,
    reasoningEffort: incoming.reasoningEffort ?? existing.reasoningEffort,
    agentRole: incoming.agentRole ?? existing.agentRole,
    forkTurns: incoming.forkTurns ?? existing.forkTurns,
    status: mergeStatus(existing.status, incoming.status),
    targetAgentStatuses: {
      ...existing.targetAgentStatuses,
      ...incoming.targetAgentStatuses
    },
    evidence: mergeUniqueValues(existing.evidence, incoming.evidence)
  };
}

/** Returns unique values while preserving first-observed ordering. */
function mergeUniqueValues<T>(existing: readonly T[], incoming: readonly T[]): T[] {
  return Array.from(new Set([...existing, ...incoming]));
}

/** Prefers the action decoded from the richer raw function-call evidence. */
function mergeAction(
  existing: OpenCodexCollaborationEvent,
  incoming: OpenCodexCollaborationEvent
): OpenCodexCollaborationEvent["action"] {
  if (incoming.evidence.includes("rawFunctionCall")) {
    return incoming.action;
  }

  return existing.action;
}

/** Prevents lower-priority lifecycle snapshots from replacing a stronger state. */
function mergeStatus(
  existing: OpenCodexCollaborationEvent["status"],
  incoming: OpenCodexCollaborationEvent["status"]
): OpenCodexCollaborationEvent["status"] {
  const priority: Record<OpenCodexCollaborationEvent["status"], number> = {
    unknown: 0,
    pending: 1,
    completed: 2,
    failed: 3
  };

  return priority[incoming] > priority[existing] ? incoming : existing;
}

/** Compares normalized events before mutating observable timeline state. */
function areCollaborationEventsEqual(
  first: OpenCodexCollaborationEvent,
  second: OpenCodexCollaborationEvent
): boolean {
  return first.id === second.id
    && first.sourceId === second.sourceId
    && first.threadId === second.threadId
    && first.turnId === second.turnId
    && first.callId === second.callId
    && first.action === second.action
    && first.toolName === second.toolName
    && first.senderThreadId === second.senderThreadId
    && first.senderAgentPath === second.senderAgentPath
    && areStringArraysEqual(first.receiverThreadIds, second.receiverThreadIds)
    && areStringArraysEqual(first.receiverAgentPaths, second.receiverAgentPaths)
    && first.prompt === second.prompt
    && first.result === second.result
    && first.taskName === second.taskName
    && first.model === second.model
    && first.reasoningEffort === second.reasoningEffort
    && first.agentRole === second.agentRole
    && first.forkTurns === second.forkTurns
    && first.status === second.status
    && areRecordsEqual(first.targetAgentStatuses, second.targetAgentStatuses)
    && areStringArraysEqual(first.evidence, second.evidence);
}

/** Compares ordered string collections in normalized collaboration state. */
function areStringArraysEqual(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length
    && first.every((value, index) => value === second[index]);
}

/** Compares status maps without serializing observable data. */
function areRecordsEqual(
  first: Readonly<Record<string, string>>,
  second: Readonly<Record<string, string>>
): boolean {
  const firstEntries = Object.entries(first);
  const secondEntries = Object.entries(second);

  return firstEntries.length === secondEntries.length
    && firstEntries.every(([key, value]) => second[key] === value);
}
