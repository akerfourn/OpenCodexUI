import { describe, expect, it, vi } from "vitest";
import { normalizeDisabledFileLanguages } from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { SettingsApi } from "../src/backend/runtime/api/SupportApis";
import { RuntimeSettingsStore } from "../src/backend/runtime/RuntimeSettingsStore";

describe("syntax language settings", () => {
  it("should validate and persist the file opening preference", async () => {
    const runtime = new RuntimeSettingsStore({} as OpenCodexSettings);
    const save = vi.fn();
    const api = new SettingsApi(runtime, save);
    await api.update({ fileOpeningMode: "external" });
    expect(api.get().fileOpeningMode).toBe("external");
    await expect(api.update({ fileOpeningMode: "invalid" as never })).rejects.toThrow("Invalid file opening mode");
    expect(save).toHaveBeenCalledOnce();
    expect(api.get().fileOpeningMode).toBe("external");
  });

  it("should normalize legacy and malformed persisted preferences", () => {
    expect(normalizeDisabledFileLanguages(undefined)).toEqual([]);
    expect(normalizeDisabledFileLanguages({})).toEqual([]);
    expect(normalizeDisabledFileLanguages(["toml", "toml", "python", null, "../script", 42]))
      .toEqual(["python", "toml"]);
  });

  it("should persist normalized preferences without discarding unrelated settings", async () => {
    const runtime = new RuntimeSettingsStore({ language: "fr" } as OpenCodexSettings);
    const save = vi.fn();
    const api = new SettingsApi(runtime, save);
    const saved = await api.update({ disabledFileLanguages: ["toml", "toml"] });
    expect(saved.disabledFileLanguages).toEqual(["toml"]);
    expect(saved.language).toBe("fr");
    expect(save).toHaveBeenCalledWith(saved);
  });

  it("should keep the active preferences when disk persistence fails", async () => {
    const runtime = new RuntimeSettingsStore({ disabledFileLanguages: ["python"] } as OpenCodexSettings);
    const api = new SettingsApi(runtime, async () => { throw new Error("Disk full"); });
    await expect(api.update({ disabledFileLanguages: ["toml"] })).rejects.toThrow("Disk full");
    expect(api.get().disabledFileLanguages).toEqual(["python"]);
  });
});
