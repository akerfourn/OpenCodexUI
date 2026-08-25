import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  CachedCollaborationEvent,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexCollaborationEvent,
  OpenCodexCollaborationQuery,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import {
  correlateCollaborationEvents,
  normalizeCollaborationResponseItem,
  normalizeCollaborationThreadItem,
  readObject,
  readString
} from "../../mapping.js";
import type { RuntimeEventPort } from "../runtime/runtimePorts.js";

export type CollaborationServiceOptions = {
  cacheRepository: OpenCodexCacheRepository | null;
  events: Pick<RuntimeEventPort, "emit">;
  logger?: (message: string) => void;
};

/** Model settings requested while spawning a child thread. */
export type SpawnExecutionMetadata = {
  model: string | null;
  reasoningEffort: string | null;
};

/**
 * Persists and exposes normalized multi-agent collaboration state.
 */
export class CollaborationService {
  /** Spawn settings indexed by the source-aware child thread identifier. */
  private readonly spawnMetadataByThread = new Map<string, SpawnExecutionMetadata>();
  /** Spawn settings indexed by the source-aware parent and agent path. */
  private readonly spawnMetadataByPath = new Map<string, SpawnExecutionMetadata>();

  /**
   * Creates a collaboration service.
   *
   * @param options Cache, runtime event port, and diagnostic dependencies.
   */
  constructor(private readonly options: CollaborationServiceOptions) {}

  /**
   * Returns spawn settings already observed for one child thread.
   *
   * The lookup is synchronous on purpose: live collaboration notifications are
   * registered before their asynchronous cache write, so a child `turn/started`
   * notification can use the settings without waiting for SQLite.
   *
   * @param sourceId Source that owns the parent and child threads.
   * @param threadId Child thread identifier.
   * @param parentThreadId Parent thread identifier, when known.
   * @param agentPath Child agent path, when known.
   * @returns Spawn settings, or `null` when no model setting is known.
   */
  getSpawnExecutionMetadata(
    sourceId: string,
    threadId: string,
    parentThreadId: string | null,
    agentPath: string | null
  ): SpawnExecutionMetadata | null {
    const direct = threadId.length > 0
      ? this.spawnMetadataByThread.get(createSpawnThreadKey(sourceId, threadId)) ?? null
      : null;
    const byPath = parentThreadId !== null && agentPath !== null
      ? this.spawnMetadataByPath.get(createSpawnPathKey(sourceId, parentThreadId, agentPath)) ?? null
      : null;
    const merged = mergeSpawnExecutionMetadata(direct, byPath);

    return hasSpawnExecutionMetadata(merged) ? merged : null;
  }

  /**
   * Resolves spawn settings from the in-memory registry and persisted history.
   *
   * @param sourceId Source that owns the parent and child threads.
   * @param threadId Child thread identifier.
   * @param parentThreadId Parent thread identifier, when known.
   * @param agentPath Child agent path, when known.
   * @returns Spawn settings, or `null` when unavailable.
   */
  async resolveSpawnExecutionMetadata(
    sourceId: string,
    threadId: string,
    parentThreadId: string | null,
    agentPath: string | null
  ): Promise<SpawnExecutionMetadata | null> {
    const immediate = this.getSpawnExecutionMetadata(
      sourceId,
      threadId,
      parentThreadId,
      agentPath
    );

    if (immediate !== null || this.options.cacheRepository === null) {
      return immediate;
    }

    if (parentThreadId === null && threadId.length === 0) {
      return null;
    }

    try {
      const events = await this.options.cacheRepository.listCollaborationEvents(
        parentThreadId === null
          ? { sourceId, receiverThreadId: threadId }
          : { sourceId, threadId: parentThreadId }
      );

      for (const event of events) {
        this.rememberSpawnEvent(event);
      }

      return this.getSpawnExecutionMetadata(sourceId, threadId, parentThreadId, agentPath);
    } catch (error) {
      this.options.logger?.(`spawn execution metadata lookup failed: ${String(error)}`);
      return null;
    }
  }

  /**
   * Normalizes one live App Server notification when it carries collaboration data.
   *
   * @param notification App Server notification.
   * @param sourceId Source that owns the App Server connection.
   */
  async handleNotification(notification: CodexNotification, sourceId: string): Promise<void> {
    const params = readObject(notification.params);
    const threadId = readString(params.threadId);
    const turnId = readString(params.turnId) || null;

    if (threadId.length === 0) {
      return;
    }

    let event: OpenCodexCollaborationEvent | null = null;

    if (notification.method === "item/started" || notification.method === "item/completed") {
      event = normalizeCollaborationThreadItem(
        params.item,
        { sourceId, threadId, turnId },
        notification.method === "item/started" ? "started" : "completed"
      );
    } else if (notification.method === "rawResponseItem/completed") {
      event = normalizeCollaborationResponseItem(params.item, { sourceId, threadId, turnId });
    }

    if (event !== null) {
      await this.persistEvent(event, true);
    }
  }

  /**
   * Reconstructs collaboration events from canonical or locally retained raw turn items.
   *
   * @param sourceId Source that owns the thread.
   * @param threadId Thread whose turns are being reconciled.
   * @param turns Raw cached or App Server turns.
   */
  async reconcileTurns(sourceId: string, threadId: string, turns: readonly unknown[]): Promise<void> {
    if (sourceId.length === 0 || threadId.length === 0) {
      return;
    }

    const events: OpenCodexCollaborationEvent[] = [];

    for (const turnValue of turns) {
      const turn = readObject(turnValue);
      const turnId = readString(turn.id) || null;
      const items = Array.isArray(turn.items) ? turn.items : [];

      for (const item of items) {
        const context = { sourceId, threadId, turnId };
        const canonicalEvent = normalizeCollaborationThreadItem(item, context, "completed");
        const rawEvent = normalizeCollaborationResponseItem(item, context);

        if (canonicalEvent !== null) {
          events.push(canonicalEvent);
        }

        if (rawEvent !== null) {
          events.push(rawEvent);
        }
      }
    }

    for (const event of correlateCollaborationEvents(events)) {
      await this.persistEvent(event, false);
    }
  }

  /**
   * Adds prompt-less spawn fallbacks for structural descendants lacking semantic history.
   *
   * @param sourceId Source that owns the thread tree.
   * @param rootThreadId Root used for the descendant query.
   * @param threads Descendant thread metadata returned by Codex.
   */
  async reconcileDescendantThreads(
    sourceId: string,
    rootThreadId: string,
    threads: readonly OpenCodexThread[]
  ): Promise<void> {
    if (this.options.cacheRepository === null) {
      return;
    }

    try {
      const existingEvents = await this.options.cacheRepository.listCollaborationEvents({
        sourceId,
        rootThreadId
      });
      existingEvents.forEach((event) => this.rememberSpawnEvent(event));
      const concreteReceivers = readConcreteSpawnReceivers(existingEvents);

      for (const thread of threads) {
        if (thread.parentThreadId === null || concreteReceivers.threadIds.has(thread.id)) {
          continue;
        }

        const agentPath = thread.subAgentSource?.agentPath ?? null;

        if (agentPath !== null && concreteReceivers.agentPaths.has(agentPath)) {
          continue;
        }

        await this.persistEvent(createStructuralSpawnEvent(sourceId, thread), true);
      }
    } catch (error) {
      this.options.logger?.(`collaboration descendant reconciliation failed: ${String(error)}`);
    }
  }

  /**
   * Lists normalized events while hiding structural fallbacks superseded by concrete evidence.
   *
   * @param query Source-aware collaboration filters.
   * @returns Collaboration events in first-observed order.
   */
  async listEvents(query: OpenCodexCollaborationQuery): Promise<OpenCodexCollaborationEvent[]> {
    if (this.options.cacheRepository === null) {
      return [];
    }

    const events = await this.options.cacheRepository.listCollaborationEvents(query);
    events.forEach((event) => this.rememberSpawnEvent(event));
    return suppressSupersededStructuralEvents(events).map(toProtocolEvent);
  }

  /**
   * Stores one normalized event and optionally publishes its merged representation.
   *
   * @param event Event to store.
   * @param shouldEmit Whether live UI consumers should be notified.
   */
  private async persistEvent(
    event: OpenCodexCollaborationEvent,
    shouldEmit: boolean
  ): Promise<void> {
    this.rememberSpawnEvent(event);

    try {
      const persisted = this.options.cacheRepository === null
        ? event
        : await this.options.cacheRepository.upsertCollaborationEvent(event);
      this.rememberSpawnEvent(persisted);

      if (shouldEmit) {
        this.options.events.emit({
          type: "collaboration.updated",
          sourceId: event.sourceId,
          event: toProtocolEvent(persisted)
        });
      }
    } catch (error) {
      this.options.logger?.(`collaboration cache write failed: ${String(error)}`);
    }
  }

  /**
   * Adds spawn model evidence to the source-aware in-memory association index.
   *
   * @param event Normalized collaboration event.
   */
  private rememberSpawnEvent(event: OpenCodexCollaborationEvent): void {
    if (event.action !== "spawn") {
      return;
    }

    let metadata: SpawnExecutionMetadata = {
      model: event.model,
      reasoningEffort: event.reasoningEffort
    };

    for (const agentPath of event.receiverAgentPaths) {
      metadata = mergeSpawnExecutionMetadata(
        metadata,
        this.spawnMetadataByPath.get(
          createSpawnPathKey(event.sourceId, event.threadId, agentPath)
        ) ?? null
      );
    }

    if (!hasSpawnExecutionMetadata(metadata)) {
      return;
    }

    for (const receiverThreadId of event.receiverThreadIds) {
      this.mergeSpawnMetadata(
        this.spawnMetadataByThread,
        createSpawnThreadKey(event.sourceId, receiverThreadId),
        metadata
      );
    }

    for (const agentPath of event.receiverAgentPaths) {
      this.mergeSpawnMetadata(
        this.spawnMetadataByPath,
        createSpawnPathKey(event.sourceId, event.threadId, agentPath),
        metadata
      );
    }
  }

  /** Merges newly observed settings without discarding known values. */
  private mergeSpawnMetadata(
    target: Map<string, SpawnExecutionMetadata>,
    key: string,
    metadata: SpawnExecutionMetadata
  ): void {
    target.set(key, mergeSpawnExecutionMetadata(target.get(key) ?? null, metadata));
  }
}

/** Creates a source-aware key for a child thread association. */
function createSpawnThreadKey(sourceId: string, threadId: string): string {
  return `${sourceId}\u0000thread\u0000${threadId}`;
}

/** Creates a source-aware key for a parent/path association. */
function createSpawnPathKey(sourceId: string, parentThreadId: string, agentPath: string): string {
  return `${sourceId}\u0000path\u0000${parentThreadId}\u0000${agentPath}`;
}

/** Merges two optional child-thread execution metadata values. */
function mergeSpawnExecutionMetadata(
  current: SpawnExecutionMetadata | null,
  next: SpawnExecutionMetadata | null
): SpawnExecutionMetadata {
  return {
    model: next?.model ?? current?.model ?? null,
    reasoningEffort: next?.reasoningEffort ?? current?.reasoningEffort ?? null
  };
}

/** Checks whether spawn metadata contains at least one useful setting. */
function hasSpawnExecutionMetadata(metadata: SpawnExecutionMetadata): boolean {
  return metadata.model !== null || metadata.reasoningEffort !== null;
}

/**
 * Creates a deterministic spawn event when only a parent-child edge survived.
 */
function createStructuralSpawnEvent(
  sourceId: string,
  thread: OpenCodexThread
): OpenCodexCollaborationEvent {
  const parentThreadId = thread.parentThreadId ?? "";
  const externalId = `structural:${thread.id}`;
  const id = ["collaboration", sourceId, parentThreadId, "-", externalId]
    .map(encodeURIComponent)
    .join(":");
  const agentPath = thread.subAgentSource?.agentPath ?? null;
  const targetAgentStatuses: Record<string, string> = {};

  if (thread.status !== undefined) {
    targetAgentStatuses[thread.id] = thread.status;
  }

  return {
    id,
    sourceId,
    threadId: parentThreadId,
    turnId: null,
    callId: null,
    action: "spawn",
    toolName: null,
    senderThreadId: parentThreadId,
    senderAgentPath: null,
    receiverThreadIds: [thread.id],
    receiverAgentPaths: agentPath === null ? [] : [agentPath],
    prompt: null,
    result: null,
    taskName: null,
    model: thread.model,
    reasoningEffort: thread.reasoningEffort,
    agentRole: thread.agentRole ?? thread.subAgentSource?.agentRole ?? null,
    forkTurns: null,
    status: "completed",
    targetAgentStatuses,
    evidence: ["structuralInference"]
  };
}

/**
 * Reads receiver identities already backed by non-structural spawn evidence.
 */
function readConcreteSpawnReceivers(events: readonly OpenCodexCollaborationEvent[]): {
  threadIds: Set<string>;
  agentPaths: Set<string>;
} {
  const threadIds = new Set<string>();
  const agentPaths = new Set<string>();

  for (const event of events) {
    if (event.action !== "spawn" || event.evidence.includes("structuralInference")) {
      continue;
    }

    event.receiverThreadIds.forEach((threadId) => threadIds.add(threadId));
    event.receiverAgentPaths.forEach((agentPath) => agentPaths.add(agentPath));
  }

  return { threadIds, agentPaths };
}

/**
 * Drops structural spawn placeholders after richer evidence identifies the same child.
 */
function suppressSupersededStructuralEvents(
  events: readonly CachedCollaborationEvent[]
): CachedCollaborationEvent[] {
  const concreteReceivers = readConcreteSpawnReceivers(events);

  return events.filter((event) => {
    if (!event.evidence.includes("structuralInference")) {
      return true;
    }

    return !event.receiverThreadIds.some((threadId) => concreteReceivers.threadIds.has(threadId))
      && !event.receiverAgentPaths.some((agentPath) => concreteReceivers.agentPaths.has(agentPath));
  });
}

/**
 * Removes cache-only timestamps before crossing the backend transport boundary.
 */
function toProtocolEvent(
  event: OpenCodexCollaborationEvent | CachedCollaborationEvent
): OpenCodexCollaborationEvent {
  return {
    id: event.id,
    sourceId: event.sourceId,
    threadId: event.threadId,
    turnId: event.turnId,
    callId: event.callId,
    action: event.action,
    toolName: event.toolName,
    senderThreadId: event.senderThreadId,
    senderAgentPath: event.senderAgentPath,
    receiverThreadIds: [...event.receiverThreadIds],
    receiverAgentPaths: [...event.receiverAgentPaths],
    prompt: event.prompt,
    result: event.result,
    taskName: event.taskName,
    model: event.model,
    reasoningEffort: event.reasoningEffort,
    agentRole: event.agentRole,
    forkTurns: event.forkTurns,
    status: event.status,
    targetAgentStatuses: { ...event.targetAgentStatuses },
    evidence: [...event.evidence]
  };
}
