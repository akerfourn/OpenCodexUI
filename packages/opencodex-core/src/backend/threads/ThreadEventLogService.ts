/**
 * Captures bounded, metadata-only traces for Codex chat threads.
 */
import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexThreadEventLogEntry,
  OpenCodexThreadEventLogRequestType,
  OpenCodexThreadEventLogStage,
  OpenCodexThreadEventLogValue
} from "@open-codex-ui/opencodex-protocol";

import {
  readBackendEventTarget,
  readNotificationTarget,
  type EventLogTarget
} from "./ThreadEventLogMapping.js";

const DEFAULT_MAX_ENTRIES_PER_THREAD = 500;
const DEFAULT_LIST_LIMIT = 500;
const MAX_LIST_LIMIT = 500;
const COALESCED_UPDATE_INTERVAL = 10;

const COALESCED_EVENT_NAMES = new Set([
  "item/agentMessage/delta",
  "item/reasoning/summaryTextDelta",
  "item/reasoning/textDelta",
  "command/exec/outputDelta",
  "process/outputDelta",
  "item/commandExecution/outputDelta",
  "item/fileChange/outputDelta",
  "item/mcpToolCall/progress",
  "turn/diff/updated",
  "message.delta",
  "activity.updated"
]);

export type ThreadEventLogMutation = {
  entry: OpenCodexThreadEventLogEntry;
  shouldNotify: boolean;
};

/**
 * Stores bounded event traces independently for each source/thread pair.
 */
export class ThreadEventLogService {
  private readonly entriesByKey = new Map<string, OpenCodexThreadEventLogEntry[]>();
  private readonly truncatedKeys = new Set<string>();
  private nextSequence = 1;

  /**
   * Creates a thread event log service.
   *
   * @param maxEntriesPerThread Maximum number of entries retained per chat.
   * @param now Clock used to timestamp entries.
   */
  constructor(
    private readonly maxEntriesPerThread = DEFAULT_MAX_ENTRIES_PER_THREAD,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  /**
   * Records metadata from one raw Codex notification.
   *
   * @param notification Raw notification received from Codex.
   * @param sourceId Source that produced the notification.
   * @returns Mutation to forward to the UI, or `null` when no thread is targeted.
   */
  recordNotification(
    notification: CodexNotification,
    sourceId: string
  ): ThreadEventLogMutation | null {
    const target = readNotificationTarget(notification, sourceId);

    if (target === null) {
      return null;
    }

    return this.appendEntry("received", notification.method, target);
  }

  /**
   * Records metadata for an outgoing turn request.
   *
   * The request body is intentionally not accepted here. Callers can retain
   * only scalar metadata such as input length and attachment count, keeping
   * the trace useful for routing diagnostics without storing user content.
   *
   * @param sourceId Source that receives the request.
   * @param threadId Thread targeted by the request.
   * @param requestType Client request name.
   * @param turnId Active turn targeted by steering, or `null` for a new turn.
   * @param details Safe scalar request metadata.
   * @returns Stored journal mutation.
   */
  recordClientRequest(
    sourceId: string,
    threadId: string,
    requestType: OpenCodexThreadEventLogRequestType,
    turnId: string | null,
    details: Record<string, OpenCodexThreadEventLogValue> = {}
  ): ThreadEventLogMutation {
    return this.appendEntry("client-requested", requestType, {
      sourceId,
      threadId,
      turnId,
      itemId: null,
      details: { ...details }
    });
  }

  /**
   * Records metadata for an event emitted by the backend toward the renderer.
   *
   * @param event Backend event.
   * @returns Mutation to forward to the UI, or `null` for non-thread events.
   */
  recordBackendEvent(event: OpenCodexEvent): ThreadEventLogMutation | null {
    if (event.type === "thread.eventLog.updated") {
      return null;
    }

    const target = readBackendEventTarget(event);

    if (target === null) {
      return null;
    }

    return this.appendEntry("ui-emitted", event.type, target);
  }

  /**
   * Reads the retained trace for one source/thread pair.
   *
   * @param sourceId Source identifier, or `null` for an orphaned thread.
   * @param threadId Thread identifier.
   * @param requestedLimit Maximum number of entries to return.
   * @returns Chronological event page.
   */
  read(
    sourceId: string | null,
    threadId: string,
    requestedLimit = DEFAULT_LIST_LIMIT
  ): { entries: OpenCodexThreadEventLogEntry[]; truncated: boolean } {
    const limit = normalizeLimit(requestedLimit);
    const key = createThreadEventLogKey(sourceId, threadId);
    const entries = this.entriesByKey.get(key) ?? [];

    return {
      entries: entries.slice(-limit),
      truncated: this.truncatedKeys.has(key) || entries.length > limit
    };
  }

  /**
   * Adds one entry and optionally coalesces adjacent high-frequency events.
   *
   * @param stage Processing stage.
   * @param eventName Raw notification or backend event name.
   * @param target Thread/event identifiers and metadata.
   * @returns Stored mutation.
   */
  private appendEntry(
    stage: OpenCodexThreadEventLogStage,
    eventName: string,
    target: EventLogTarget
  ): ThreadEventLogMutation {
    const key = createThreadEventLogKey(target.sourceId, target.threadId);
    const entries = this.entriesByKey.get(key) ?? [];
    const occurredAt = this.now();
    const previous = entries.at(-1);

    if (previous !== undefined && canCoalesce(previous, stage, eventName, target)) {
      const updated: OpenCodexThreadEventLogEntry = {
        ...previous,
        lastOccurredAt: occurredAt,
        count: previous.count + 1,
        details: mergeCoalescedDetails(previous.details, target.details)
      };
      entries[entries.length - 1] = updated;
      this.entriesByKey.set(key, entries);

      return {
        entry: updated,
        shouldNotify: updated.count % COALESCED_UPDATE_INTERVAL === 0
      };
    }

    const entry: OpenCodexThreadEventLogEntry = {
      id: `thread-event-${this.nextSequence}`,
      sequence: this.nextSequence,
      stage,
      eventName,
      sourceId: target.sourceId,
      threadId: target.threadId,
      turnId: target.turnId,
      itemId: target.itemId,
      occurredAt,
      lastOccurredAt: occurredAt,
      count: 1,
      details: target.details
    };
    this.nextSequence += 1;
    entries.push(entry);

    if (entries.length > this.maxEntriesPerThread) {
      entries.shift();
      this.truncatedKeys.add(key);
    }

    this.entriesByKey.set(key, entries);
    return { entry, shouldNotify: true };
  }
}

/**
 * Creates a stable key that keeps identical thread ids isolated by source.
 *
 * @param sourceId Source identifier.
 * @param threadId Thread identifier.
 * @returns Internal map key.
 */
export function createThreadEventLogKey(sourceId: string | null, threadId: string): string {
  return `${sourceId ?? ""}\u0000${threadId}`;
}

/**
 * Merges counters from an adjacent coalesced event.
 *
 * @param previous Previous event details.
 * @param incoming New event details.
 * @returns Merged details.
 */
function mergeCoalescedDetails(
  previous: Record<string, OpenCodexThreadEventLogValue>,
  incoming: Record<string, OpenCodexThreadEventLogValue>
): Record<string, OpenCodexThreadEventLogValue> {
  const details = { ...previous };

  for (const [key, value] of Object.entries(incoming)) {
    const previousValue = details[key];

    if (typeof previousValue === "number" && typeof value === "number" && key.endsWith("Length")) {
      details[key] = previousValue + value;
      continue;
    }

    details[key] = value;
  }

  return details;
}

/**
 * Checks whether two adjacent entries may be combined.
 *
 * @param previous Previous retained entry.
 * @param stage Incoming stage.
 * @param eventName Incoming event name.
 * @param target Incoming target.
 * @returns Whether entries can be combined.
 */
function canCoalesce(
  previous: OpenCodexThreadEventLogEntry,
  stage: OpenCodexThreadEventLogStage,
  eventName: string,
  target: EventLogTarget
): boolean {
  return COALESCED_EVENT_NAMES.has(eventName) &&
    COALESCED_EVENT_NAMES.has(previous.eventName) &&
    previous.stage === stage &&
    previous.eventName === eventName &&
    previous.turnId === target.turnId &&
    previous.itemId === target.itemId;
}

/**
 * Normalizes a requested read limit.
 *
 * @param value Requested limit.
 * @returns Supported limit.
 */
function normalizeLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(Math.floor(value), MAX_LIST_LIMIT);
}
