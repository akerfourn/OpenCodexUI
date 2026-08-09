import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexThreadEventLogPage
} from "@open-codex-ui/opencodex-protocol";

import {
  ThreadEventLogService,
  type ThreadEventLogMutation
} from "../ThreadEventLogService.js";
import type { RuntimeEventPort } from "./runtimePorts.js";

/** Dependencies used by the runtime event dispatcher. */
export type RuntimeEventDispatcherOptions = {
  /** Emits events to the host transport. */
  emitToHost(event: OpenCodexEvent): void;
  /** Optional event journal, primarily useful for deterministic tests. */
  threadEventLogService?: ThreadEventLogService;
};

/** Emits backend events and owns the bounded thread event journal. */
export class RuntimeEventDispatcher implements RuntimeEventPort {
  /** Bounded metadata trace shared by raw and backend event recording. */
  private readonly threadEventLogService: ThreadEventLogService;

  /**
   * Creates a runtime event dispatcher.
   *
   * @param options Host transport and optional event-journal dependencies.
   */
  constructor(private readonly options: RuntimeEventDispatcherOptions) {
    this.threadEventLogService = options.threadEventLogService ?? new ThreadEventLogService();
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
    if (event.type !== "thread.eventLog.updated") {
      this.notifyThreadEventLog(this.threadEventLogService.recordBackendEvent(event));
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
    this.notifyThreadEventLog(this.threadEventLogService.recordNotification(notification, sourceId));
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
}
