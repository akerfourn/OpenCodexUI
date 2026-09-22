import { isObservable, observable } from "mobx";
import { describe, expect, it, vi } from "vitest";
import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { FileLanguagesStore } from "../src/stores/files/FileLanguagesStore";

describe("FileLanguagesStore", () => {
  it("should persist plain preferences and wait for confirmation", async () => {
    let complete!: (settings: OpenCodexSettings) => void;
    const root = {
      settings: observable({ disabledFileLanguages: ["python"] }) as OpenCodexSettings,
      request: vi.fn(input => {
        expect(isObservable(input.patch.disabledFileLanguages)).toBe(false);
        return new Promise<OpenCodexSettings>(resolve => { complete = resolve; });
      })
    };
    const store = new FileLanguagesStore(root);
    const pending = store.setEnabled("toml", false);
    expect(store.isEnabled("toml")).toBe(true);
    expect(store.saving).toBe(true);
    await store.setEnabled("just", false);
    expect(root.request).toHaveBeenCalledOnce();
    complete({ disabledFileLanguages: ["python", "toml"] } as OpenCodexSettings);
    await pending;
    expect(store.isEnabled("toml")).toBe(false);
    expect(store.isEnabled("python")).toBe(false);
    expect(store.saving).toBe(false);
    expect(root.request).toHaveBeenCalledWith({ type: "settings.update", patch: { disabledFileLanguages: ["python", "toml"] } });
  });

  it("should keep the previous preference when persistence fails", async () => {
    const root = { settings: {} as OpenCodexSettings, request: vi.fn().mockRejectedValue(new Error("Disk full")) };
    const store = new FileLanguagesStore(root);
    await store.setEnabled("toml", false);
    expect(store.isEnabled("toml")).toBe(true);
    expect(store.error).toBe("Error: Disk full");
    expect(store.saving).toBe(false);
  });
});
