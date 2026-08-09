import type {
  OpenCodexEvent,
  OpenCodexLogEntry,
  OpenCodexRequest,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import { CodexProcessError } from "@open-codex-ui/codex-rpc";

import {
  normalizeError,
  toError
} from "./errors.js";

/** Dependencies used to normalize, report, and recover runtime errors. */
export type RuntimeErrorCoordinatorOptions = {
  /** Reads the language used for user-facing error labels. */
  getLanguage(): OpenCodexSettings["language"];
  /** Persists an error without making persistence failures observable here. */
  persistLog(type: OpenCodexLogEntry["type"], message: string, details: unknown): void;
  /** Emits an error event through the runtime's journal-aware event boundary. */
  emit(event: OpenCodexEvent): void;
  /** Recovers a thread after a recoverable Codex process failure. */
  recoverThread(threadId: string): Promise<unknown>;
};

/** Coordinates normalized runtime errors and best-effort thread recovery. */
export class RuntimeErrorCoordinator {
  /** Creates an error coordinator from narrow runtime callbacks. */
  constructor(
    /** Language, logging, event, and recovery dependencies. */
    private readonly options: RuntimeErrorCoordinatorOptions
  ) {}

  /**
   * Normalizes a failed request, reports it, and starts recovery when possible.
   *
   * @param request Request that failed.
   * @param error Unknown thrown value.
   * @returns Never returns because it rethrows the normalized error.
   */
  handleRequestError(request: OpenCodexRequest, error: unknown): never {
    const normalized = normalizeError(error, this.options.getLanguage());
    const recoverableThreadId = this.readRecoverableThreadId(request, error);
    this.options.persistLog("error", normalized.message, normalized.details);
    this.options.emit({
      type: "error",
      message: normalized.message,
      details: normalized.details,
      recoverable: recoverableThreadId !== null,
      sourceId: this.readRequestSourceId(request),
      threadId: recoverableThreadId ?? undefined
    });

    if (recoverableThreadId !== null) {
      void this.options.recoverThread(recoverableThreadId).catch((recoverError: unknown) => {
        this.handleClientError(toError(recoverError));
      });
    }

    throw normalized;
  }

  /**
   * Normalizes and reports an error raised outside a request response.
   *
   * @param error Client error.
   * @returns Nothing.
   */
  handleClientError(error: Error): void {
    const normalized = normalizeError(error, this.options.getLanguage());
    this.options.persistLog("error", normalized.message, normalized.details);
    this.options.emit({ type: "error", message: normalized.message, details: normalized.details });
  }

  /**
   * Reads the recoverable thread identifier for a failed request.
   *
   * @param request Request that failed.
   * @param error Unknown thrown value.
   * @returns Thread identifier, or `null` when recovery is not applicable.
   */
  private readRecoverableThreadId(request: OpenCodexRequest, error: unknown): string | null {
    if (!(error instanceof CodexProcessError)) {
      return null;
    }

    if (request.type === "turn.start") {
      return request.threadId;
    }

    if (
      request.type === "threads.open" ||
      request.type === "threads.recover" ||
      request.type === "thread.review" ||
      request.type === "thread.compact"
    ) {
      return request.threadId;
    }

    return null;
  }

  /**
   * Reads the source attached to a request without applying the default source.
   *
   * @param request Request that failed.
   * @returns Source identifier, or `null` when unavailable.
   */
  private readRequestSourceId(request: OpenCodexRequest): string | null {
    if (!("sourceId" in request)) {
      return null;
    }

    return typeof request.sourceId === "string" ? request.sourceId : null;
  }
}
