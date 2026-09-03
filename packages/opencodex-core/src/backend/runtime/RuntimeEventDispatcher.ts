import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexThreadEventLogPage,
  OpenCodexThreadEventLogRequestType,
  OpenCodexThreadEventLogValue,
  OpenCodexTurnDiagnostic,
  OpenCodexTurnDiagnosticRequestInput
} from "@open-codex-ui/opencodex-protocol";

import {
  ThreadEventLogService,
  type ThreadEventLogMutation
} from "../threads/ThreadEventLogService.js";
import {
  ThreadTurnDiagnosticService,
  type ThreadTurnDiagnosticMutation
} from "../threads/ThreadTurnDiagnosticService.js";
import type { RuntimeEventPort } from "./runtimePorts.js";

/** Dependencies used by the runtime event dispatcher. */
export type RuntimeEventDispatcherOptions = {
  /** Emits events to the host transport. */
  emitToHost(event: OpenCodexEvent): void;
  /** Optional event journal, primarily useful for deterministic tests. */
  threadEventLogService?: ThreadEventLogService;
  /** Optional turn diagnostic buffer, primarily useful for deterministic tests. */
  threadTurnDiagnosticService?: ThreadTurnDiagnosticService;
  /** Enables turn diagnostics while the application is in developer mode. */
  isTurnDiagnosticsEnabled?: () => boolean;
};

/** Emits backend events and owns the bounded thread event journal. */
export class RuntimeEventDispatcher implements RuntimeEventPort {
  /** Bounded metadata trace shared by raw and backend event recording. */
  private readonly threadEventLogService: ThreadEventLogService;
  /** Process-local trace used to inspect one turn without replaying a thread. */
  private readonly threadTurnDiagnosticService: ThreadTurnDiagnosticService;

  /**
   * Creates a runtime event dispatcher.
   *
   * @param options Host transport and optional event-journal dependencies.
   */
  constructor(private readonly options: RuntimeEventDispatcherOptions) {
    this.threadEventLogService = options.threadEventLogService ?? new ThreadEventLogService();
    this.threadTurnDiagnosticService = options.threadTurnDiagnosticService ??
      new ThreadTurnDiagnosticService({
        isEnabled: options.isTurnDiagnosticsEnabled ?? (() => false)
      });
  }

  /**
   * Emits an event and records thread-targeted backend events first.
   *
   * Event-log update events are deliberately excluded from the journal to
   * prevent recursive updates while preserving their host notification.
   *
   * @param event Event payload.
   * @returns Nothing.
   */
  emit(event: OpenCodexEvent): void {
    const shouldRecordEvent = event.type !== "thread.eventLog.updated" &&
      event.type !== "thread.turnDiagnostic.updated";

    if (shouldRecordEvent) {
      this.notifyThreadEventLog(this.threadEventLogService.recordBackendEvent(event));
      this.notifyTurnDiagnostic(this.threadTurnDiagnosticService.recordBackendEvent(event));
    }

    this.options.emitToHost(event);
  }

  /**
   * Records a raw notification and forwards a journal update when targeted.
   *
   * @param notification Raw Codex notification.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  recordRawNotification(notification: CodexNotification, sourceId: string): void {
    this.notifyTurnDiagnostic(
      this.threadTurnDiagnosticService.recordNotification(notification, sourceId)
    );
    this.notifyThreadEventLog(
      this.threadEventLogService.recordNotification(notification, sourceId)
    );
  }

  /**
   * Records an outgoing turn request and forwards its journal update.
   *
   * @param sourceId Source that receives the request.
   * @param threadId Thread targeted by the request.
   * @param requestType Client request name.
   * @param turnId Active turn targeted by steering, or `null` for a new turn.
   * @param details Safe scalar request metadata.
   * @returns Nothing.
   */
  recordClientRequest(
    sourceId: string,
    threadId: string,
    requestType: OpenCodexThreadEventLogRequestType,
    turnId: string | null,
    details: Record<string, OpenCodexThreadEventLogValue> = {}
  ): void {
    this.notifyThreadEventLog(
      this.threadEventLogService.recordClientRequest(
        sourceId,
        threadId,
        requestType,
        turnId,
        details
      )
    );
  }

  /** Captures one exact turn request while developer mode is enabled. */
  recordTurnDiagnosticRequest(
    sourceId: string,
    threadId: string,
    request: OpenCodexTurnDiagnosticRequestInput
  ): string | null {
    const mutation = this.threadTurnDiagnosticService.recordTurnRequest(
      sourceId,
      threadId,
      request
    );
    this.notifyTurnDiagnostic(mutation);
    return mutation?.diagnostic.id ?? null;
  }

  /** Records the response associated with a captured turn request. */
  recordTurnDiagnosticResponse(
    diagnosticId: string,
    turnId: string | null,
    errorMessage: string | null
  ): void {
    this.notifyTurnDiagnostic(
      this.threadTurnDiagnosticService.recordTurnResponse(
        diagnosticId,
        turnId,
        errorMessage
      )
    );
  }

  /** Reads one developer-mode diagnostic trace. */
  readTurnDiagnostic(
    threadId: string,
    sourceId: string | null,
    turnId: string
  ): OpenCodexTurnDiagnostic | null {
    return this.threadTurnDiagnosticService.read(sourceId, threadId, turnId);
  }

  /**
   * Reads the retained trace for one source/thread pair.
   *
   * @param threadId Thread identifier.
   * @param sourceId Source identifier, or `null` for an orphan thread.
   * @param limit Maximum number of entries to return.
   * @returns Chronological event trace.
   */
  readThreadEventLog(
    threadId: string,
    sourceId: string | null,
    limit: number
  ): OpenCodexThreadEventLogPage {
    return this.threadEventLogService.read(sourceId, threadId, limit);
  }

  /**
   * Forwards a journal mutation without recursively recording the update.
   *
   * @param mutation Journal mutation, or `null` when no update is needed.
   * @returns Nothing.
   */
  private notifyThreadEventLog(mutation: ThreadEventLogMutation | null): void {
    if (mutation === null || !mutation.shouldNotify) {
      return;
    }

    this.options.emitToHost({
      type: "thread.eventLog.updated",
      sourceId: mutation.entry.sourceId,
      threadId: mutation.entry.threadId,
      entry: mutation.entry
    });
  }

  /** Forwards a changed turn diagnostic without recording the forwarding event. */
  private notifyTurnDiagnostic(mutation: ThreadTurnDiagnosticMutation | null): void {
    if (mutation === null || !mutation.shouldNotify) {
      return;
    }

    this.options.emitToHost({
      type: "thread.turnDiagnostic.updated",
      sourceId: mutation.diagnostic.sourceId,
      threadId: mutation.diagnostic.threadId,
      turnId: mutation.diagnostic.turnId,
      diagnostic: mutation.diagnostic
    });
  }
}
