import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import {
  ApprovalsApi,
  ModelsApi,
  SettingsApi,
  UsageApi
} from "../src/backend/runtime/api/SupportApis";

describe("support APIs", () => {
  it("should forward usage operations with concise names", async () => {
    const usage = {
      readUsageLimits: vi.fn().mockResolvedValue(null),
      readUsageHistory: vi.fn(),
      consumeUsageReset: vi.fn()
    };
    const api = new UsageApi(usage);

    await expect(api.readLimits("source-1", "request")).resolves.toBeNull();
    expect(usage.readUsageLimits).toHaveBeenCalledWith("source-1", "request");
  });

  it("should use the configured source when listing models", async () => {
    const models = {
      listModels: vi.fn().mockResolvedValue([])
    };
    const settings = {
      getSettings: vi.fn().mockReturnValue({ defaultSourceId: "source-1" } as OpenCodexSettings)
    };
    const api = new ModelsApi(models, settings);

    await expect(api.list()).resolves.toEqual([]);
    expect(models.listModels).toHaveBeenCalledWith("source-1");
  });

  it("should normalize advanced performance monitoring before saving settings", async () => {
    const currentSettings = {
      developerMode: true,
      performanceMonitoringEnabled: true,
      advancedPerformanceMonitoringEnabled: true
    } as OpenCodexSettings;
    const settings = {
      getSettings: vi.fn().mockReturnValue(currentSettings),
      setSettings: vi.fn()
    };
    const saveSettings = vi.fn();
    const api = new SettingsApi(settings, saveSettings);

    const nextSettings = await api.update({ performanceMonitoringEnabled: false });

    expect(nextSettings.advancedPerformanceMonitoringEnabled).toBe(false);
    expect(settings.setSettings).toHaveBeenCalledWith(nextSettings);
    expect(saveSettings).toHaveBeenCalledWith(nextSettings);
  });

  it("should forward approval resolutions synchronously", () => {
    const approvalService = {
      resolveApproval: vi.fn()
    };
    const api = new ApprovalsApi(approvalService);

    api.resolve("approval-1", "accept");

    expect(approvalService.resolveApproval).toHaveBeenCalledWith("approval-1", "accept");
  });
});
