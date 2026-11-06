import { describe, expect, it, vi } from "vitest";

import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";

import { AppSettingsStore } from "../src/stores/app/AppSettingsStore";
import { SourcesStore } from "../src/stores/app/SourcesStore";
import type { RootStore } from "../src/stores/RootStore";

describe("SourcesStore settings synchronization", () => {
  it("should apply a deferred release check without replacing settings edited since bootstrap", () => {
    const request = vi.fn();
    const settingsStore = new AppSettingsStore({ request });
    settingsStore.replaceSettings({ ...settingsStore.settings, language: "fr", defaultModel: "gpt-5.5" });
    const root = {
      appStore: { settingsStore },
      homeStore: { selectedSourceId: null, setSelectedSourceId: vi.fn() }, request
    } as unknown as RootStore;
    const store = new SourcesStore(root);
    const releaseCheck = { latestVersion: "0.200.0", checkedAt: "2026-11-06T00:00:00.000Z", error: null };

    store.handleEvent({ type: "sources.updated", sources: [], defaultSourceId: "local", codexReleaseCheck: releaseCheck });

    expect(settingsStore.settings).toMatchObject({
      language: "fr", defaultModel: "gpt-5.5", defaultSourceId: "local", codexReleaseCheck: releaseCheck
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("should preserve settings and avoid persistence when the default source changes", () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const settingsStore = new AppSettingsStore({ request });
    settingsStore.replaceSettings({
      ...settingsStore.settings,
      defaultSourceId: "source-a",
      defaultModel: "gpt-5.5",
      language: "fr"
    });
    const initialSettings = { ...settingsStore.settings };
    const replaceSettings = vi.spyOn(settingsStore, "replaceSettings");
    const setSelectedSourceId = vi.fn();
    const root = {
      appStore: { settingsStore },
      homeStore: {
        selectedSourceId: null,
        setSelectedSourceId
      },
      request
    } as unknown as RootStore;
    const store = new SourcesStore(root);

    store.handleEvent({
      type: "sources.updated",
      defaultSourceId: "source-b",
      sources: []
    });

    expect(settingsStore.settings).toEqual({
      ...initialSettings,
      defaultSourceId: "source-b"
    });
    expect(settingsStore.settings.defaultModel).toBe("gpt-5.5");
    expect(settingsStore.settings.language).toBe("fr");
    expect(replaceSettings).toHaveBeenCalledWith({
      ...initialSettings,
      defaultSourceId: "source-b"
    });
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "settings.update"
    }));
  });
});
