import { CodexProcessError } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { RuntimeErrorCoordinator } from "../src/backend/RuntimeErrorCoordinator";
import type {
  ApplicationLogPort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "../src/backend/runtime/runtimePorts";

describe("RuntimeErrorCoordinator", () => {
  it("should persist, emit, recover, and rethrow in the original synchronous order", () => {
    const operations: string[] = [];
    const persistLog = vi.fn((_type: string, message: string, _details: unknown) => {
      operations.push(`log:${message}`);
    });
    const emit = vi.fn((event: OpenCodexEvent) => {
      operations.push(`emit:${event.type}`);
    });
    const recoverThread = vi.fn(async (threadId: string) => {
      operations.push(`recover:${threadId}`);
      return { ok: true };
    });
    const coordinator = createCoordinator({ persistLog, emit, recoverThread });
    const request = {
      type: "threads.open",
      threadId: "thread-1",
      sourceId: "source-1"
    } satisfies OpenCodexRequest;
    const processError = new CodexProcessError("Codex stopped.");

    const thrown = captureThrown(() => coordinator.handleRequestError(request, processError));

    expect(thrown).toEqual({
      message: "Codex stopped.",
      details: "Check that Codex CLI is installed and that codexCommand points to the right executable."
    });
    expect(operations).toEqual([
      "log:Codex stopped.",
      "emit:error",
      "recover:thread-1"
    ]);
    expect(persistLog).toHaveBeenCalledWith(
      "error",
      "Codex stopped.",
      "Check that Codex CLI is installed and that codexCommand points to the right executable."
    );
    expect(emit).toHaveBeenCalledWith({
      type: "error",
      message: "Codex stopped.",
      details: "Check that Codex CLI is installed and that codexCommand points to the right executable.",
      recoverable: true,
      sourceId: "source-1",
      threadId: "thread-1"
    });
    expect(recoverThread).toHaveBeenCalledWith("thread-1");
  });

  it("should recover each process-failure request that identifies a thread", () => {
    const requests: Array<{ request: OpenCodexRequest; threadId: string }> = [
      {
        request: { type: "threads.open", threadId: "thread-open" },
        threadId: "thread-open"
      },
      {
        request: { type: "threads.recover", threadId: "thread-recover" },
        threadId: "thread-recover"
      },
      {
        request: { type: "thread.review", threadId: "thread-review" },
        threadId: "thread-review"
      },
      {
        request: { type: "thread.compact", threadId: "thread-compact" },
        threadId: "thread-compact"
      },
      {
        request: {
          type: "turn.start",
          threadId: "thread-turn",
          text: "Continue"
        },
        threadId: "thread-turn"
      }
    ];

    for (const { request, threadId } of requests) {
      const recoverThread = vi.fn(async () => ({ ok: true }));
      const emit = vi.fn<(event: OpenCodexEvent) => void>();
      const coordinator = createCoordinator({ recoverThread, emit });

      captureThrown(() => coordinator.handleRequestError(request, new CodexProcessError("stopped")));

      expect(recoverThread).toHaveBeenCalledWith(threadId);
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({
        type: "error",
        recoverable: true,
        threadId
      }));
    }
  });

  it("should leave a new turn without a thread nonrecoverable", () => {
    const recoverThread = vi.fn(async () => ({ ok: true }));
    const emit = vi.fn<(event: OpenCodexEvent) => void>();
    const coordinator = createCoordinator({ recoverThread, emit });
    const request = {
      type: "turn.start",
      threadId: null,
      text: "Start"
    } satisfies OpenCodexRequest;

    captureThrown(() => coordinator.handleRequestError(request, new CodexProcessError("stopped")));

    expect(recoverThread).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith({
      type: "error",
      message: "stopped",
      details: "Check that Codex CLI is installed and that codexCommand points to the right executable.",
      recoverable: false,
      sourceId: null,
      threadId: undefined
    });
  });

  it("should not recover non-process failures or requests without a recoverable thread", () => {
    const cases: Array<{ request: OpenCodexRequest; error: unknown }> = [
      { request: { type: "threads.open", threadId: "thread-1" }, error: new Error("network") },
      { request: { type: "app.bootstrap" }, error: new CodexProcessError("stopped") }
    ];

    for (const { request, error } of cases) {
      const recoverThread = vi.fn(async () => ({ ok: true }));
      const emit = vi.fn<(event: OpenCodexEvent) => void>();
      const coordinator = createCoordinator({ recoverThread, emit });

      captureThrown(() => coordinator.handleRequestError(request, error));

      expect(recoverThread).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({
        type: "error",
        recoverable: false,
        sourceId: null
      }));
    }
  });

  it("should preserve an explicit source without falling back to the configured source", () => {
    const emit = vi.fn<(event: OpenCodexEvent) => void>();
    const coordinator = createCoordinator({ emit });
    const request = {
      type: "threads.open",
      threadId: "thread-1",
      sourceId: "requested-source"
    } satisfies OpenCodexRequest;

    captureThrown(() => coordinator.handleRequestError(request, new Error("failed")));

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "error",
      sourceId: "requested-source"
    }));
  });

  it("should normalize client errors in log-before-event order", () => {
    const operations: string[] = [];
    const persistLog = vi.fn((_type: string, message: string, _details: unknown) => {
      operations.push(`log:${message}`);
    });
    const emit = vi.fn((event: OpenCodexEvent) => {
      operations.push(`emit:${event.type}`);
    });
    const coordinator = createCoordinator({ persistLog, emit });
    const error = new Error("client failed");

    coordinator.handleClientError(error);

    expect(operations).toEqual(["log:client failed", "emit:error"]);
    expect(persistLog).toHaveBeenCalledWith("error", "client failed", error.stack);
    expect(emit).toHaveBeenCalledWith({
      type: "error",
      message: "client failed",
      details: error.stack
    });
  });

  it("should report a recovery rejection as a second client error", async () => {
    const recoveryFailure = "recovery failed";
    const emit = vi.fn<(event: OpenCodexEvent) => void>();
    const persistLog = vi.fn();
    const recoverThread = vi.fn(() => Promise.reject(recoveryFailure));
    const coordinator = createCoordinator({ persistLog, emit, recoverThread });
    const request = {
      type: "threads.open",
      threadId: "thread-1"
    } satisfies OpenCodexRequest;

    captureThrown(() => coordinator.handleRequestError(request, new CodexProcessError("stopped")));
    await flushMicrotasks();

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(2, {
      type: "error",
      message: recoveryFailure,
      details: expect.any(String)
    });
    expect(persistLog).toHaveBeenNthCalledWith(
      2,
      "error",
      recoveryFailure,
      expect.any(String)
    );
  });
});

/** Creates a coordinator with deterministic English error labels. */
function createCoordinator(
  overrides: Partial<{
    persistLog: ApplicationLogPort["persistLog"];
    emit: (event: OpenCodexEvent) => void;
    recoverThread: (threadId: string) => Promise<unknown>;
  }> = {}
): RuntimeErrorCoordinator {
  return new RuntimeErrorCoordinator({
    settings: createSettingsPort(),
    logs: createLogPort(overrides.persistLog),
    events: createEventPort(overrides.emit),
    recoverThread: overrides.recoverThread ?? (async () => ({ ok: true }))
  });
}

/** Creates deterministic settings for error normalization tests. */
function createSettingsPort(): RuntimeSettingsPort {
  return {
    getSettings: () => ({ language: "en" } as never),
    setSettings: () => undefined
  };
}

/** Creates the application log port used by error coordinator tests. */
function createLogPort(
  persistLog: ApplicationLogPort["persistLog"] | undefined
): ApplicationLogPort {
  return {
    persistLog: persistLog ?? (() => undefined)
  };
}

/** Creates the event port used by error coordinator tests. */
function createEventPort(
  emit: ((event: OpenCodexEvent) => void) | undefined
): RuntimeEventPort {
  return {
    emit: emit ?? (() => undefined),
    recordRawNotification: () => undefined,
    readThreadEventLog: () => ({ entries: [], truncated: false })
  };
}

/** Captures the plain normalized value thrown by request error handling. */
function captureThrown(callback: () => never): unknown {
  try {
    callback();
  } catch (error) {
    return error;
  }

  throw new Error("Expected callback to throw.");
}

/** Lets fire-and-forget recovery rejection handlers complete. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
