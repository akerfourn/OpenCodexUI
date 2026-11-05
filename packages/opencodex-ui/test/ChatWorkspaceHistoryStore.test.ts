import { describe, expect, it, vi } from "vitest";
import type { OpenCodexWorkspaceTransitionEvent } from "@open-codex-ui/opencodex-protocol";
import { ChatWorkspaceHistoryStore } from "../src/stores/chat/ChatWorkspaceHistoryStore";
import type { ChatStore } from "../src/stores/chat/ChatStore";
import type { RootStore } from "../src/stores/RootStore";

/** Creates verified event metadata, without synthesizing a message or an execution. */
function event(sourceId = "source"): OpenCodexWorkspaceTransitionEvent {
  return { id: "event", threadId: "thread", projectId: "project", sourceId, afterTurnId: "turn",
    occurredAt: "2026-11-05T10:00:00Z", from: { workspaceId: "A", name: null, isPrimary: true, path: "/A" },
    to: { workspaceId: "B", name: "Feature", isPrimary: false, path: "/B" } };
}

describe("on-demand workspace history", () => {
  it("should send only the owning thread and ignore mismatched source events", async () => {
    const request = vi.fn(async () => [event(), event("other")]);
    const chat = { isLocalDraft: false, thread: { id: "thread" }, sourceId: "source" } as unknown as ChatStore;
    const store = new ChatWorkspaceHistoryStore(chat, { request } as unknown as RootStore);
    await store.load();
    expect(structuredClone(request.mock.calls[0]![0])).toEqual({ type: "threads.workspace.history", threadId: "thread" });
    expect(store.events).toEqual([event()]);
  });

  it("should retain explicitly loaded history on read failure without inventing transitions", async () => {
    const request = vi.fn(async () => [event()]);
    const chat = { isLocalDraft: false, thread: { id: "thread" }, sourceId: "source" } as unknown as ChatStore;
    const store = new ChatWorkspaceHistoryStore(chat, { request } as unknown as RootStore);
    await store.load();
    request.mockRejectedValueOnce(new Error("Cache unavailable"));
    await store.load();
    expect(store.events).toEqual([event()]);
    expect(store.error).toContain("Cache unavailable");
  });

  it("should ignore a late response after disposal and avoid requests for local drafts", async () => {
    let complete!: (events: OpenCodexWorkspaceTransitionEvent[]) => void;
    const request = vi.fn(async () => new Promise<OpenCodexWorkspaceTransitionEvent[]>(resolve => { complete = resolve; }));
    const chat = { isLocalDraft: false, thread: { id: "thread" }, sourceId: "source" };
    const store = new ChatWorkspaceHistoryStore(chat as unknown as ChatStore, { request } as unknown as RootStore);
    const loading = store.load();
    store.dispose();
    complete([event()]);
    await loading;
    expect(store.events).toEqual([]);
    chat.isLocalDraft = true;
    await store.load();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
