import { describe, expect, it, vi } from "vitest";
import type { OpenCodexSettings, OpenCodexWorkspaceRoot } from "@open-codex-ui/opencodex-protocol";
import { SettingsApi } from "../src/backend/runtime/api/SupportApis";
import { RuntimeSettingsStore } from "../src/backend/runtime/RuntimeSettingsStore";

const root: OpenCodexWorkspaceRoot = { id: "root", sourceId: "source", label: "Storage", path: "/storage", isDefault: true };

describe("workspace storage settings persistence", () => {
  it("should preserve the old runtime locations when persistence fails and allow a subsequent retry", async () => {
    const settings = new RuntimeSettingsStore({ workspaceRoots: [] } as unknown as OpenCodexSettings);
    const save = vi.fn().mockRejectedValueOnce(new Error("Disk unavailable")).mockResolvedValue(undefined);
    const api = new SettingsApi(settings, save);
    await expect(api.update({ workspaceRoots: [root] })).rejects.toThrow("Disk unavailable");
    expect(settings.getSettings().workspaceRoots).toEqual([]);
    await api.update({ workspaceRoots: [root] });
    expect(settings.getSettings().workspaceRoots).toEqual([root]);
  });

  it("should retain concurrent unrelated patches after saving storage preferences", async () => {
    const settings = new RuntimeSettingsStore({ workspaceRoots: [], language: "fr" } as unknown as OpenCodexSettings);
    const api = new SettingsApi(settings, vi.fn());
    await Promise.all([api.update({ workspaceRoots: [root] }), api.update({ language: "en" })]);
    expect(settings.getSettings()).toMatchObject({ workspaceRoots: [root], language: "en" });
  });

  it("should reject invalid default preferences before saving anything", async () => {
    const settings = new RuntimeSettingsStore({ workspaceRoots: [] } as unknown as OpenCodexSettings);
    const save = vi.fn();
    const api = new SettingsApi(settings, save);
    await expect(api.update({ workspaceRoots: [{ ...root, isDefault: false }] })).rejects.toThrow("exactly one default");
    expect(save).not.toHaveBeenCalled();
  });
});
