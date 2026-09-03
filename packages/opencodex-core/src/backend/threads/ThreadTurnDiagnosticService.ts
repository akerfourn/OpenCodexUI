/**
 * Captures bounded, source-aware traces for individual Codex turns.
 *
 * Unlike the general event log, a diagnostic trace is organized around one
 * turn and is never rebuilt from a synchronized thread snapshot. It therefore
 * preserves the causal order needed to investigate stale or misrouted replies.
 */
import { createHash, type Hash } from "node:crypto";

import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexThreadEventLogValue,
  OpenCodexTurnDiagnostic,
  OpenCodexTurnDiagnosticEvent,
  OpenCodexTurnDiagnosticRequest,
  OpenCodexTurnDiagnosticRequestInput
} from "@open-codex-ui/opencodex-protocol";

import { readObject, readString } from "../../mapping.js";
import {
  readBackendEventTarget,
  readNotificationTarget,
  type EventLogTarget
} from "./ThreadEventLogMapping.js";
import {
  addAnomaly,
  addBackendEventDetails,
  addMessageId,
  addNotificationDetails,
  classifyTurnStatus,
  cloneDiagnostic,
  cloneDiagnosticInput,
  createEmptyResponse,
  createRequestDetails,
  createThreadKey,
  hashText,
  isCoalescibleEvent,
  isThreadLevelDiagnosticEvent,
  mergeDetails,
  normalizeLimit,
  truncate
} from "./ThreadTurnDiagnosticHelpers.js";

const DEFAULT_MAX_DIAGNOSTICS_PER_THREAD = 32;
const DEFAULT_MAX_EVENTS_PER_DIAGNOSTIC = 256;

type DiagnosticState = {
  diagnostic: OpenCodexTurnDiagnostic;
  outputHasher: Hash;
};

/** Mutation returned when a diagnostic changed and may need to reach the UI. */
export type ThreadTurnDiagnosticMutation = {
  diagnostic: OpenCodexTurnDiagnostic;
  shouldNotify: boolean;
};

/** Runtime options for the process-local turn diagnostic buffer. */
export type ThreadTurnDiagnosticServiceOptions = {
  /** Enables capture when developer mode is active. */
  isEnabled?: () => boolean;
  /** Maximum number of turn traces retained per source/thread pair. */
  maxDiagnosticsPerThread?: number;
  /** Maximum number of causal events retained inside one turn trace. */
  maxEventsPerDiagnostic?: number;
  /** Clock injected by tests and diagnostics. */
  now?: () => string;
};

/** Stores developer-only turn traces without writing them to SQLite. */
export class ThreadTurnDiagnosticService {
  private readonly diagnosticsByThread = new Map<string, DiagnosticState[]>();
  private readonly diagnosticsById = new Map<string, DiagnosticState>();
  private readonly isEnabled: () => boolean;
  private readonly maxDiagnosticsPerThread: number;
  private readonly maxEventsPerDiagnostic: number;
  private readonly now: () => string;
  private nextDiagnosticId = 1;
  private nextEventSequence = 1;

  /** Creates a bounded turn diagnostic service. */
  constructor(options: ThreadTurnDiagnosticServiceOptions = {}) {
    this.isEnabled = options.isEnabled ?? (() => true);
    this.maxDiagnosticsPerThread = normalizeLimit(
      options.maxDiagnosticsPerThread ?? DEFAULT_MAX_DIAGNOSTICS_PER_THREAD
    );
    this.maxEventsPerDiagnostic = normalizeLimit(
      options.maxEventsPerDiagnostic ?? DEFAULT_MAX_EVENTS_PER_DIAGNOSTIC
    );
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Starts or extends the trace associated with one client turn request.
   *
   * Steering requests reuse the diagnostic of their active turn so a single
   * view contains the original prompt and every subsequent steering input.
   */
  recordTurnRequest(
    sourceId: string,
    threadId: string,
    input: OpenCodexTurnDiagnosticRequestInput
  ): ThreadTurnDiagnosticMutation | null {
    if (!this.isEnabled()) {
      return null;
    }

    const state = input.turnId === null
      ? this.createDiagnostic(sourceId, threadId, null)
      : this.findByTurnId(sourceId, threadId, input.turnId)
        ?? this.createDiagnostic(sourceId, threadId, input.turnId);
    const capturedAt = this.now();
    const request: OpenCodexTurnDiagnosticRequest = {
      ...input,
      input: input.input.map(cloneDiagnosticInput),
      capturedAt,
      textHash: hashText(input.text),
      response: {
        status: "pending",
        turnId: null,
        errorMessage: null
      }
    };

    state.diagnostic.requests.push(request);
    if (state.diagnostic.status === "observed") {
      state.diagnostic.status = input.turnId === null ? "pending" : "active";
    }

    return this.appendEvent(
      state,
      "request",
      input.requestType,
      input.turnId,
      null,
      createRequestDetails(request)
    );
  }

  /** Records the response received for the latest request in a trace. */
  recordTurnResponse(
    diagnosticId: string,
    turnId: string | null,
    errorMessage: string | null
  ): ThreadTurnDiagnosticMutation | null {
    if (!this.isEnabled()) {
      return null;
    }

    const state = this.diagnosticsById.get(diagnosticId);

    if (state === undefined || state.diagnostic.requests.length === 0) {
      return null;
    }

    const request = state.diagnostic.requests.at(-1);
    if (request === undefined) {
      return null;
    }

    const normalizedTurnId = turnId !== null && turnId.length > 0 ? turnId : null;
    const normalizedError = errorMessage === null
      ? normalizedTurnId === null ? "Codex returned no turn id." : null
      : truncate(errorMessage);
    const succeeded = normalizedTurnId !== null && normalizedError === null;

    request.response = {
      status: succeeded ? "succeeded" : "failed",
      turnId: normalizedTurnId,
      errorMessage: normalizedError
    };

    if (normalizedTurnId !== null) {
      this.bindTurnId(state, normalizedTurnId);
      if (state.diagnostic.status !== "completed" && state.diagnostic.status !== "failed") {
        state.diagnostic.status = "active";
      }
    } else {
      state.diagnostic.status = "failed";
    }

    return this.appendEvent(
      state,
      "request",
      `${request.requestType}.response`,
      normalizedTurnId,
      null,
      {
        responseStatus: request.response.status,
        responseTurnId: normalizedTurnId,
        ...(normalizedError === null ? {} : { errorMessage: normalizedError })
      }
    );
  }

  /** Records one raw Codex notification against its matching turn trace. */
  recordNotification(
    notification: CodexNotification,
    sourceId: string
  ): ThreadTurnDiagnosticMutation | null {
    if (!this.isEnabled()) {
      return null;
    }

    const target = readNotificationTarget(notification, sourceId);
    if (target === null) {
      return null;
    }

    const state = this.findStateForTarget(target, notification.method);
    const resolvedState = state ?? this.createObservedState(target, notification.method);

    if (resolvedState === null) {
      return null;
    }

    if (target.turnId !== null && resolvedState.diagnostic.turnId === null) {
      this.bindTurnId(resolvedState, target.turnId);
    }

    this.applyRawResponseData(resolvedState, notification);
    this.applyRawTurnStatus(resolvedState, notification);
    this.recordLateNotificationAnomaly(resolvedState, notification.method, target.turnId);

    return this.appendEvent(
      resolvedState,
      "notification",
      notification.method,
      target.turnId,
      target.itemId,
      addNotificationDetails(notification, target.details)
    );
  }

  /** Records a normalized backend event for comparison with its raw source. */
  recordBackendEvent(event: OpenCodexEvent): ThreadTurnDiagnosticMutation | null {
    if (!this.isEnabled() || event.type === "thread.turnDiagnostic.updated") {
      return null;
    }

    const target = readBackendEventTarget(event);
    if (target === null) {
      return null;
    }

    const state = this.findStateForBackendEvent(event, target);
    if (state === null) {
      return null;
    }

    if (target.turnId !== null && state.diagnostic.turnId === null) {
      this.bindTurnId(state, target.turnId);
    }

    this.applyBackendTurnStatus(state, event);
    const details = addBackendEventDetails(event, target.details);

    if (event.type === "message.started") {
      this.compareRequestToMessage(state, event.message.content);
    }

    return this.appendEvent(
      state,
      "backend",
      event.type,
      target.turnId,
      target.itemId,
      details
    );
  }

  /** Reads one trace by its explicit source, thread, and turn identifiers. */
  read(
    sourceId: string | null,
    threadId: string,
    turnId: string
  ): OpenCodexTurnDiagnostic | null {
    if (!this.isEnabled()) {
      return null;
    }

    const state = this.findByTurnId(sourceId, threadId, turnId);
    return state === null ? null : cloneDiagnostic(state.diagnostic);
  }

  /** Creates and indexes a trace for a request or observed turn. */
  private createDiagnostic(
    sourceId: string | null,
    threadId: string,
    turnId: string | null
  ): DiagnosticState {
    const timestamp = this.now();
    const diagnostic: OpenCodexTurnDiagnostic = {
      id: `turn-diagnostic-${this.nextDiagnosticId++}`,
      sourceId,
      threadId,
      turnId,
      status: turnId === null ? "pending" : "active",
      startedAt: timestamp,
      lastUpdatedAt: timestamp,
      requests: [],
      response: createEmptyResponse(),
      events: [],
      anomalies: [],
      truncated: false
    };
    const state: DiagnosticState = {
      diagnostic,
      outputHasher: createHash("sha256")
    };
    const key = createThreadKey(sourceId, threadId);
    const diagnostics = this.diagnosticsByThread.get(key) ?? [];

    diagnostics.push(state);
    this.diagnosticsByThread.set(key, diagnostics);
    this.diagnosticsById.set(diagnostic.id, state);
    this.evictOldDiagnostics(diagnostics);
    return state;
  }

  /** Evicts the oldest traces while keeping the per-thread buffer bounded. */
  private evictOldDiagnostics(diagnostics: DiagnosticState[]): void {
    while (diagnostics.length > this.maxDiagnosticsPerThread) {
      const evicted = diagnostics.shift();
      if (evicted !== undefined) {
        this.diagnosticsById.delete(evicted.diagnostic.id);
      }
    }
  }

  /** Finds the newest trace with the requested turn identity. */
  private findByTurnId(
    sourceId: string | null,
    threadId: string,
    turnId: string
  ): DiagnosticState | null {
    const diagnostics = this.diagnosticsByThread.get(createThreadKey(sourceId, threadId));

    if (diagnostics === undefined) {
      return null;
    }

    return [...diagnostics].reverse().find((state) => state.diagnostic.turnId === turnId) ?? null;
  }

  /** Finds a trace for a raw notification, including a pending turn start. */
  private findStateForTarget(
    target: EventLogTarget,
    eventName: string
  ): DiagnosticState | null {
    if (target.turnId !== null) {
      const exact = this.findByTurnId(target.sourceId, target.threadId, target.turnId);
      if (exact !== null) {
        return exact;
      }
    }

    const diagnostics = this.diagnosticsByThread.get(
      createThreadKey(target.sourceId, target.threadId)
    );
    if (diagnostics === undefined) {
      return null;
    }

    const pending = [...diagnostics].reverse().find((state) => (
      state.diagnostic.turnId === null &&
      state.diagnostic.status === "pending"
    ));
    if (pending !== undefined) {
      return pending;
    }

    if (target.turnId === null && isThreadLevelDiagnosticEvent(eventName)) {
      return [...diagnostics].reverse().find((state) => state.diagnostic.status === "active") ?? null;
    }

    return null;
  }

  /** Finds a trace for a normalized backend event without inventing one. */
  private findStateForBackendEvent(
    event: OpenCodexEvent,
    target: EventLogTarget
  ): DiagnosticState | null {
    if (target.turnId !== null) {
      return this.findByTurnId(target.sourceId, target.threadId, target.turnId);
    }

    const diagnostics = this.diagnosticsByThread.get(
      createThreadKey(target.sourceId, target.threadId)
    );
    if (diagnostics === undefined) {
      return null;
    }

    if (event.type === "message.started") {
      return [...diagnostics].reverse().find((state) => state.diagnostic.turnId === null) ?? null;
    }

    if (event.type === "thread.turns.synced" || event.type === "thread.sync.completed") {
      return [...diagnostics].reverse().find((state) => state.diagnostic.status === "active") ?? null;
    }

    return null;
  }

  /** Creates an observed trace when a turn was not started by this UI. */
  private createObservedState(
    target: EventLogTarget,
    eventName: string
  ): DiagnosticState | null {
    if (eventName !== "turn/started" && eventName !== "turn/completed") {
      return null;
    }

    const state = this.createDiagnostic(target.sourceId, target.threadId, target.turnId);
    state.diagnostic.status = "observed";
    return state;
  }

  /** Associates a response turn identifier with a pending trace. */
  private bindTurnId(state: DiagnosticState, turnId: string): void {
    if (state.diagnostic.turnId !== null && state.diagnostic.turnId !== turnId) {
      addAnomaly(state.diagnostic, "turn-id-mismatch");
      return;
    }

    state.diagnostic.turnId = turnId;
  }

  /** Updates output counters and hash from raw assistant deltas only. */
  private applyRawResponseData(
    state: DiagnosticState,
    notification: CodexNotification
  ): void {
    const params = readObject(notification.params);
    const item = readObject(params.item);

    if (notification.method === "item/started" && readString(item.type) === "agentMessage") {
      addMessageId(state.diagnostic, readString(item.id));
    }

    if (notification.method !== "item/agentMessage/delta") {
      return;
    }

    const itemId = readString(params.itemId);
    const delta = readString(params.delta);
    addMessageId(state.diagnostic, itemId);

    if (delta.length === 0) {
      return;
    }

    state.outputHasher.update(delta, "utf8");
    state.diagnostic.response.outputDeltaCount += 1;
    state.diagnostic.response.outputLength += delta.length;
  }

  /** Updates the trace status from a raw turn completion notification. */
  private applyRawTurnStatus(state: DiagnosticState, notification: CodexNotification): void {
    if (notification.method === "turn/started") {
      state.diagnostic.status = "active";
      return;
    }

    if (notification.method !== "turn/completed") {
      return;
    }

    const turn = readObject(readObject(notification.params).turn);
    state.diagnostic.status = classifyTurnStatus(readString(turn.status));
    state.diagnostic.response.outputHash = state.outputHasher.copy().digest("hex");
  }

  /** Updates status when the normalized backend event is the only signal. */
  private applyBackendTurnStatus(state: DiagnosticState, event: OpenCodexEvent): void {
    if (event.type === "turn.started") {
      state.diagnostic.status = "active";
    }

    if (event.type === "turn.completed") {
      state.diagnostic.status = classifyTurnStatus(event.turnStatus ?? "completed");
      state.diagnostic.response.outputHash = state.outputHasher.copy().digest("hex");
    }
  }

  /** Detects a mismatch between the captured prompt and the synthetic UI input event. */
  private compareRequestToMessage(state: DiagnosticState, messageText: string): void {
    const request = state.diagnostic.requests.at(-1);

    if (request === undefined || request.textHash === hashText(messageText)) {
      return;
    }

    addAnomaly(state.diagnostic, "message-content-mismatch");
  }

  /** Flags live notifications that arrive after a terminal turn event. */
  private recordLateNotificationAnomaly(
    state: DiagnosticState,
    eventName: string,
    turnId: string | null
  ): void {
    if (
      turnId !== null &&
      (state.diagnostic.status === "completed" || state.diagnostic.status === "failed") &&
      eventName !== "turn/completed"
    ) {
      addAnomaly(state.diagnostic, "notification-after-completion");
    }
  }

  /** Appends one causal event and coalesces adjacent streaming notifications. */
  private appendEvent(
    state: DiagnosticState,
    source: OpenCodexTurnDiagnosticEvent["source"],
    eventName: string,
    turnId: string | null,
    itemId: string | null,
    details: Record<string, OpenCodexThreadEventLogValue>
  ): ThreadTurnDiagnosticMutation {
    const occurredAt = this.now();
    const previous = state.diagnostic.events.at(-1);
    const canCoalesce = previous !== undefined &&
      previous.source === source &&
      previous.eventName === eventName &&
      previous.threadId === state.diagnostic.threadId &&
      previous.turnId === turnId &&
      previous.itemId === itemId &&
      isCoalescibleEvent(eventName);

    if (canCoalesce && previous !== undefined) {
      previous.lastOccurredAt = occurredAt;
      previous.count += 1;
      previous.details = mergeDetails(previous.details, details);
      state.diagnostic.lastUpdatedAt = occurredAt;
      return this.createMutation(state, false);
    }

    const event: OpenCodexTurnDiagnosticEvent = {
      id: `${state.diagnostic.id}:event-${this.nextEventSequence}`,
      sequence: this.nextEventSequence++,
      source,
      eventName,
      threadId: state.diagnostic.threadId,
      turnId,
      itemId,
      occurredAt,
      lastOccurredAt: occurredAt,
      count: 1,
      details
    };
    state.diagnostic.events.push(event);
    state.diagnostic.lastUpdatedAt = occurredAt;

    if (state.diagnostic.events.length > this.maxEventsPerDiagnostic) {
      state.diagnostic.events.shift();
      state.diagnostic.truncated = true;
    }

    return this.createMutation(state, true);
  }

  /** Creates a cloned mutation safe to send through the UI transport. */
  private createMutation(
    state: DiagnosticState,
    shouldNotify: boolean
  ): ThreadTurnDiagnosticMutation {
    return {
      diagnostic: cloneDiagnostic(state.diagnostic),
      shouldNotify
    };
  }
}
