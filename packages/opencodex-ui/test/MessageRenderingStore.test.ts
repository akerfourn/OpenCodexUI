import { describe, expect, it, vi } from "vitest";
import { observable, runInAction, toJS } from "mobx";
import { normalizeMessageRenderingDefaults, type OpenCodexRequest, type OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { MessageRenderingStore } from "../src/stores/chat/MessageRenderingStore";

const context = { sourceId: "local", threadId: "thread" };
const entry = { turnId: "turn", itemId: "message", markdown: null, math: true };

/** Minimal transport fixture keeps actual preference resolution and state logic under test. */
function fixture(request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => [])) {
  const root = observable({ settings: {} as OpenCodexSettings });
  const store = new MessageRenderingStore({ get settings() { return root.settings; },
    request: async <T>(payload: OpenCodexRequest) => await request(payload) as T });
  return { root, request, store };
}

describe("message rendering store", () => {
  it("should default user math off and assistant math on without requiring migrated settings", () => {
    const { store } = fixture();
    expect(store.resolve(context, "turn", "message", "user")).toEqual({ markdown: true, math: false });
    expect(store.resolve(context, "turn", "message", "assistant")).toEqual({ markdown: true, math: true });
  });

  it("should retain explicit overrides while inherited values follow later global changes", async () => {
    const { store, root } = fixture();
    await store.save(context, entry);
    runInAction(() => { root.settings.messageRendering = normalizeMessageRenderingDefaults();
      root.settings.messageRendering.user.markdown = false; });
    expect(store.resolve(context, "turn", "message", "user")).toEqual({ markdown: false, math: true });
    await store.save(context, { ...entry, math: null });
    expect(store.resolve(context, "turn", "message", "user")).toEqual({ markdown: false, math: false });
  });

  it("should retain confirmed settings and release the pending state after a failed save", async () => {
    const request = vi.fn(async (payload: OpenCodexRequest): Promise<unknown> => {
      if (payload.type === "messageRendering.set") throw new Error("Disk full");
      return [{ ...entry, math: false }];
    });
    const { store } = fixture(request);
    await expect(store.save(context, entry)).rejects.toThrow("Disk full");
    expect(store.override(context, "turn", "message")).toEqual({ markdown: null, math: false });
    expect(store.pending.size).toBe(0);
  });

  it("should isolate late reads from other threads and load each thread only once", async () => {
    let resolve!: (value: unknown) => void;
    const response = new Promise(done => { resolve = done; });
    const request = vi.fn(async (payload: OpenCodexRequest): Promise<unknown> => {
      if (payload.type === "messageRendering.read" && payload.context.threadId === "thread") return await response;
      return [];
    });
    const { store } = fixture(request);
    const oldRead = store.load(context);
    const duplicate = store.load(context);
    const other = { ...context, threadId: "other" };
    await store.load(other);
    resolve([entry]);
    await Promise.all([oldRead, duplicate]);
    expect(store.override(other, "turn", "message")).toEqual({ markdown: null, math: null });
    expect(store.override(context, "turn", "message").math).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("should await an initial read before writing and send plain DTOs from observable inputs", async () => {
    const { store, request } = fixture();
    const input = observable({ ...entry });
    await store.save(observable({ ...context }), input);
    const payload = request.mock.calls[1][0];
    expect(structuredClone(payload)).toEqual(toJS(payload));
    expect(payload).toEqual({ type: "messageRendering.set", context, entry });
    expect(input).toEqual(entry);
  });

  it("should retry a failed read without pretending an unknown override was successfully saved", async () => {
    const request = vi.fn(async (_payload: OpenCodexRequest): Promise<unknown> => []);
    request.mockRejectedValueOnce(new Error("Unavailable"));
    const { store } = fixture(request);
    await expect(store.save(context, entry)).rejects.toThrow("Unavailable");
    expect(store.error(context)).toContain("Unavailable");
    await store.save(context, entry);
    expect(store.error(context)).toBeNull();
    expect(store.override(context, "turn", "message").math).toBe(true);
  });
});
