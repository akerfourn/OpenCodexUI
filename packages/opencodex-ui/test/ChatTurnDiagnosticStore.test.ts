/**
 * Covers selection and source-aware updates for the turn diagnostic store.
 */
import type {
  OpenCodexEvent,
  OpenCodexTurnDiagnostic
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { ChatTurnDiagnosticStore } from "../src/stores/chat/ChatTurnDiagnosticStore";
import type { RootStore } from "../src/stores/RootStore";

describe("ChatTurnDiagnosticStore", () => {
  it("should load the selected source-aware turn diagnostic", async () => {
    const diagnostic = createDiagnostic("source-1", "thread-1", "turn-1");
    const request = vi.fn().mockResolvedValue(diagnostic);
    const store = new ChatTurnDiagnosticStore({ request } as unknown as RootStore);

    store.open("thread-1", "source-1", "turn-1");
    await vi.waitFor(() => expect(store.diagnostic).toEqual(diagnostic));

    expect(request).toHaveBeenCalledWith({
      type: "threads.turnDiagnostic.read",
      threadId: "thread-1",
      sourceId: "source-1",
      turnId: "turn-1"
    });
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("should ignore a live diagnostic update for another turn or source", () => {
    const currentDiagnostic = createDiagnostic("source-1", "thread-1", "turn-1");
    const otherDiagnostic = createDiagnostic("source-2", "thread-1", "turn-2");
    const store = new ChatTurnDiagnosticStore({
      request: vi.fn().mockResolvedValue(currentDiagnostic)
    } as unknown as RootStore);

    store.open("thread-1", "source-1", "turn-1");
    store.handleEvent(createDiagnosticEvent(otherDiagnostic));

    expect(store.diagnostic).toBeNull();
  });

  it("should clear the selected diagnostic when closed", async () => {
    const diagnostic = createDiagnostic("source-1", "thread-1", "turn-1");
    const store = new ChatTurnDiagnosticStore({
      request: vi.fn().mockResolvedValue(diagnostic)
    } as unknown as RootStore);

    store.open("thread-1", "source-1", "turn-1");
    await vi.waitFor(() => expect(store.diagnostic).toEqual(diagnostic));
    store.close();

    expect(store.activeThreadId).toBeNull();
    expect(store.activeSourceId).toBeNull();
    expect(store.activeTurnId).toBeNull();
    expect(store.diagnostic).toBeNull();
  });
});

/** Creates the smallest diagnostic accepted by the renderer store. */
function createDiagnostic(
  sourceId: string,
  threadId: string,
  turnId: string
): OpenCodexTurnDiagnostic {
  return {
    id: `diagnostic-${turnId}`,
    sourceId,
    threadId,
    turnId,
    status: "active",
    startedAt: "2026-09-03T00:00:00.000Z",
    lastUpdatedAt: "2026-09-03T00:00:01.000Z",
    requests: [],
    response: {
      assistantMessageIds: [],
      outputDeltaCount: 0,
      outputLength: 0,
      outputHash: null
    },
    events: [],
    anomalies: [],
    truncated: false
  };
}

/** Creates one live diagnostic event fixture. */
function createDiagnosticEvent(
  diagnostic: OpenCodexTurnDiagnostic
): Extract<OpenCodexEvent, { type: "thread.turnDiagnostic.updated" }> {
  return {
    type: "thread.turnDiagnostic.updated",
    sourceId: diagnostic.sourceId,
    threadId: diagnostic.threadId,
    turnId: diagnostic.turnId,
    diagnostic
  };
}
