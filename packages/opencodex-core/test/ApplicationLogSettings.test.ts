import { describe, expect, it, vi } from "vitest";
import type { OpenCodexLogPolicies, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { SettingsApi } from "../src/backend/runtime/api/SupportApis";
import { RuntimeSettingsStore } from "../src/backend/runtime/RuntimeSettingsStore";
import { ApplicationLogService } from "../src/backend/support/ApplicationLogService";

/** Creates an independent initial policy snapshot for persistence tests. */
function initialPolicies(): OpenCodexLogPolicies {
  return {
    info: { mode: "session", maxEntries: 200 },
    performanceSlowdown: { mode: "retained", retentionDays: 7 }
  };
}

describe("log policy settings publication", () => {
  it("should preserve the active session policy when saving its replacement fails", async () => {
    const settings = new RuntimeSettingsStore({ logPolicies: initialPolicies() } as OpenCodexSettings);
    const service = new ApplicationLogService({ cacheRepository: null, settings, events: { emit: vi.fn() } });
    const save = vi.fn().mockRejectedValueOnce(new Error("Disk unavailable")).mockResolvedValue(undefined);
    const api = new SettingsApi(settings, save, (saved) => service.applySettings(saved));
    const replacement: OpenCodexLogPolicies = { ...initialPolicies(), info: { mode: "disabled" } };
    try {
      await expect(api.update({ logPolicies: replacement })).rejects.toThrow("Disk unavailable");
      await service.createLog("info", "Still retained in memory", null);
      expect((await service.listLogs(null, 30)).logs).toHaveLength(1);
      expect(settings.getSettings().logPolicies).toEqual(initialPolicies());

      await api.update({ logPolicies: replacement });
      await service.createLog("info", "Disabled", null);
      expect((await service.listLogs(null, 30)).logs).toEqual([]);
      expect(settings.getSettings().logPolicies).toEqual(replacement);
    } finally {
      await service.dispose();
    }
  });

  it.each([0, 1.5, 10_001])("should reject an unsafe session limit %s before persistence", async (maxEntries) => {
    const settings = new RuntimeSettingsStore({ logPolicies: initialPolicies() } as OpenCodexSettings);
    const save = vi.fn();
    const api = new SettingsApi(settings, save);
    await expect(api.update({ logPolicies: {
      ...initialPolicies(), info: { mode: "session", maxEntries }
    } })).rejects.toThrow("safe integer");
    expect(save).not.toHaveBeenCalled();
    expect(settings.getSettings().logPolicies).toEqual(initialPolicies());
  });

  it("should retain a successful save even if maintenance and its diagnostic logger fail", async () => {
    const settings = new RuntimeSettingsStore({ logPolicies: initialPolicies() } as OpenCodexSettings);
    const maintenance = vi.fn().mockRejectedValue(new Error("Cleanup failed"));
    const logger = vi.fn(() => { throw new Error("Logger unavailable"); });
    const api = new SettingsApi(settings, vi.fn(), maintenance, logger);
    const replacement: OpenCodexLogPolicies = { ...initialPolicies(), info: { mode: "unlimited" } };
    await expect(api.update({ logPolicies: replacement })).resolves.toMatchObject({ logPolicies: replacement });
    expect(settings.getSettings().logPolicies).toEqual(replacement);
  });
});
