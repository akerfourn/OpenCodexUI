import { describe, expect, it, vi } from "vitest";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { normalizeMessageRenderingDefaults } from "@open-codex-ui/opencodex-protocol";
import { MessageRenderingService } from "../src/backend/support/MessageRenderingService.js";
import { SettingsApi } from "../src/backend/runtime/api/SupportApis.js";
import { RuntimeSettingsStore } from "../src/backend/runtime/RuntimeSettingsStore.js";

const context = { sourceId: "local", threadId: "thread" };
const entry = { turnId: "turn", itemId: "message", markdown: null, math: true };

/** Supplies only local persistence; no Codex connection is needed to change presentation. */
function fixture() {
  const messageRendering = { read: vi.fn(async () => [entry]), set: vi.fn(async () => undefined) };
  const getThread = vi.fn(async () => ({ thread: { sourceId: "local" } }));
  const cache = { messageRendering, getThread } as unknown as OpenCodexCacheRepository;
  return { service: new MessageRenderingService(cache), messageRendering, getThread };
}

describe("message rendering service", () => {
  it("should read and save against an explicit source and local conversation", async () => {
    const { service, messageRendering } = fixture();
    expect(await service.execute({ type: "messageRendering.read", context })).toEqual([entry]);
    await service.execute({ type: "messageRendering.set", context, entry });
    expect(messageRendering.set).toHaveBeenCalledWith(context, entry);
  });

  it("should reject invalid flags and mismatched sources without writing", async () => {
    const { service, messageRendering } = fixture();
    await expect(service.execute({ type: "messageRendering.set", context, entry: { ...entry, math: 1 as never } }))
      .rejects.toThrow("Invalid message rendering override");
    await expect(service.execute({ type: "messageRendering.set", context: { ...context, sourceId: "other" }, entry }))
      .rejects.toThrow("source changed");
    expect(messageRendering.set).not.toHaveBeenCalled();
  });

  it("should persist global defaults independently and preserve them on write failure", async () => {
    const runtime = new RuntimeSettingsStore({ language: "fr" } as OpenCodexSettings);
    const persist = vi.fn(async () => undefined);
    const api = new SettingsApi(runtime, persist);
    const defaults = normalizeMessageRenderingDefaults();
    const saved = await api.update({ messageRendering: defaults });
    expect(saved).toMatchObject({ language: "fr", messageRendering: defaults });
    persist.mockRejectedValueOnce(new Error("Disk full"));
    await expect(api.update({ messageRendering: { ...defaults, user: { markdown: false, math: true } } }))
      .rejects.toThrow("Disk full");
    expect(runtime.getSettings().messageRendering).toEqual(defaults);
    await expect(api.update({ messageRendering: { ...defaults, user: { markdown: true, math: "yes" as never } } }))
      .rejects.toThrow("Invalid message rendering preference");
  });
});
