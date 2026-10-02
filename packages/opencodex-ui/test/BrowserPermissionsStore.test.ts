import { isObservable, observable } from "mobx";
import { describe, expect, it, vi } from "vitest";
import type { BrowserPermissionsContext, BrowserPermissionsSnapshot, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { BrowserPermissionsStore } from "../src/stores/app/BrowserPermissionsStore";
import type { RootStore } from "../src/stores/RootStore";

const context: BrowserPermissionsContext = { sourceId: "source", threadId: "chat" };

/** Provides the smallest plain permissions response needed to exercise transport state. */
function snapshot(revision = "first"): BrowserPermissionsSnapshot {
  return { context: { ...context }, file: { path: "/codex/browser/sessions/chat.toml", revision,
    entries: [{ resource: "origins", pattern: "https://site.example", decision: "denied" }] }, global: null };
}

describe("BrowserPermissionsStore", () => {
  it("should send plain explicit identities and changes rather than observable payloads", async () => {
    const request = vi.fn(async (input: OpenCodexRequest) => {
      expect(isObservable(input)).toBe(false);
      if (input.type === "browserPermissions.read" || input.type === "browserPermissions.change") {
        expect(isObservable(input.context)).toBe(false);
        expect(input.context).toEqual(context);
      }
      if (input.type === "browserPermissions.change") {
        expect(isObservable(input.change)).toBe(false);
        expect(input.revision).toBe("first");
      }
      return snapshot();
    });
    const store = new BrowserPermissionsStore({ request } as unknown as RootStore, observable({ ...context }));
    await store.load();
    await store.change(observable({ resource: "origins" as const, pattern: "https://site.example", decision: "reset" as const }));
    expect(store.needsReload).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("should retain the reviewed snapshot and explain conflicts after a rejected save", async () => {
    const request = vi.fn().mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new Error("BROWSER_CONFLICT: Changed"));
    const store = new BrowserPermissionsStore({ request } as unknown as RootStore, context);
    await store.load();
    await store.change({ resource: "origins", pattern: "https://site.example", decision: "allowed" });
    expect(store.snapshot?.file.revision).toBe("first");
    expect(store.errorKey).toBe("browserPermissions.errors.conflict");
    expect(store.needsReload).toBe(false);
    expect(store.busy).toBe(false);
  });

  it("should ignore a stale load that resolves after a newer refresh", async () => {
    let completeFirst!: (value: BrowserPermissionsSnapshot) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise(resolve => { completeFirst = resolve; }))
      .mockResolvedValueOnce(snapshot("newest"));
    const store = new BrowserPermissionsStore({ request } as unknown as RootStore, context);
    const first = store.load();
    await store.load();
    completeFirst(snapshot("old"));
    await first;
    expect(store.snapshot?.file.revision).toBe("newest");
    expect(store.busy).toBe(false);
  });

  it("should retain the reload notice when an active agent prevents restarting Codex", async () => {
    const request = vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot("saved"))
      .mockRejectedValueOnce(new Error("BROWSER_BUSY: Active turn"));
    const store = new BrowserPermissionsStore({ request } as unknown as RootStore, context);
    await store.load();
    await store.change({ resource: "origins", pattern: "https://site.example", decision: "reset" });
    await store.reloadConnection();
    expect(request).toHaveBeenLastCalledWith({ type: "browserPermissions.reload", sourceId: "source" });
    expect(store.needsReload).toBe(true);
    expect(store.errorKey).toBe("browserPermissions.errors.busy");
  });
});
