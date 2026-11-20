import { describe, expect, it, vi } from "vitest";
import { isObservable } from "mobx";
import type { RootStore } from "../src/stores/RootStore";
import { SourceResourcesStore } from "../src/stores/app/SourceResourcesStore";

/** Native resource discovery is isolated at the transport boundary. */
function fixture() {
  const snapshot = { settings: { priority: "normal", cpuLimitPercent: null },
    capabilities: { priority: true, cpuLimit: true, cpuLimitUnavailableReason: null } };
  const request = vi.fn().mockResolvedValue(snapshot);
  const store = new SourceResourcesStore({ request } as unknown as RootStore, "source-a");
  return { store, request, snapshot };
}

describe("source resource form state", () => {
  it("should discover only its explicit source on demand and send plain policy DTOs", async () => {
    const { store, request } = fixture();
    expect(request).not.toHaveBeenCalled();
    await store.load();
    store.setPriority("low");
    store.setCpuLimit("50");
    await store.save();
    expect(request.mock.calls).toEqual([
      [{ type: "sources.resources.read", sourceId: "source-a" }],
      [{ type: "sources.update", sourceId: "source-a", patch: { settings: {
        resources: { priority: "low", cpuLimitPercent: 50 }
      } } }]
    ]);
    const payload = request.mock.calls[1]![0];
    expect(isObservable(payload.patch.settings.resources)).toBe(false);
    expect(structuredClone(payload)).toEqual(payload);
    expect(store.hasChanges).toBe(false);
  });

  it("should retain invalid text as field validation and avoid operational errors or writes", async () => {
    const { store, request } = fixture();
    await store.load();
    for (const value of ["0", "101", "12.5", "invalid"]) {
      store.setCpuLimit(value);
      expect(store.isValid).toBe(false);
      await store.save();
    }
    expect(request).toHaveBeenCalledOnce();
    store.setCpuLimit(" ");
    expect(store.settings.cpuLimitPercent).toBeNull();
    expect(store.isValid).toBe(true);
  });

  it("should allow disabling a saved policy even when the host no longer supports it", async () => {
    const { store, request, snapshot } = fixture();
    request.mockResolvedValueOnce({ ...snapshot, settings: { priority: "low", cpuLimitPercent: 25 },
      capabilities: { priority: false, cpuLimit: false, cpuLimitUnavailableReason: "windowsUnavailable" } });
    await store.load();
    store.reset();
    await store.save();
    expect(request.mock.calls[1]![0].patch.settings.resources).toEqual({ priority: "normal", cpuLimitPercent: null });
  });

  it("should preserve the draft after a request failure without duplicating the shared error report", async () => {
    const { store, request } = fixture();
    await store.load();
    store.setPriority("low");
    request.mockRejectedValueOnce(new Error("Native settings write failed"));
    await store.save();
    expect(store.isSaving).toBe(false);
    expect(store.hasChanges).toBe(true);
    expect(store.priority).toBe("low");
  });
});
