import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { DebugPreferences, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { DebugService } from "../../../packages/opencodex-core/src/backend/debug/DebugService.js";
import { SettingsStore, defaultSettings } from "../src/main/settingsStore.js";

const context = { sourceId: "local", projectId: "project", workspaceId: "primary", workspacePath: "/project" };
const preferences: DebugPreferences = {
  configurations: [{ id: "node", name: "API", adapter: "javascript", target: "node", request: "launch",
    program: "index.js", context }],
  breakpoints: [{ id: "breakpoint", context, path: "index.js", line: 2, enabled: true }],
  watches: ["count"]
};

describe("legacy debugger settings migration", () => {
  let directory: string;
  let cache: OpenCodexCacheRepository;
  let settingsStore: SettingsStore;
  let settings: OpenCodexSettings;
  let service: DebugService;
  let update: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "debug-settings-"));
    cache = createOpenCodexSqliteCacheRepository({ directory });
    settingsStore = new SettingsStore(directory);
    await settingsStore.save({ ...defaultSettings, language: "fr", debug: preferences });
    settings = await settingsStore.load();
    update = vi.fn(async (patch: Partial<OpenCodexSettings>) => {
      const next = { ...settings, ...patch };
      await settingsStore.save(next);
      settings = next;
      return settings;
    });
    service = new DebugService(cache.debug, async () => undefined, () => undefined, undefined,
      { get: () => settings, update });
  });
  afterEach(async () => {
    await service.dispose();
    await cache.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("should migrate once, clean the JSON and persist subsequent changes through database reopen", async () => {
    await Promise.all([service.initialize(), service.initialize()]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(service.snapshot().preferences).toEqual(preferences);
    expect(JSON.parse(await readFile(join(directory, "settings.json"), "utf8")))
      .toEqual({ ...defaultSettings, language: "fr", fileLinkGrants: [], disabledFileLanguages: [] });
    await service.execute({ kind: "saveConfiguration", configuration: { ...preferences.configurations[0], name: "Changed" } });
    expect(update).toHaveBeenCalledTimes(1);
    await cache.close();
    cache = createOpenCodexSqliteCacheRepository({ directory });
    expect((await cache.debug.read()).configurations[0].name).toBe("Changed");
  });

  it("should retain legacy JSON when the database import fails and retry successfully", async () => {
    vi.spyOn(cache.debug, "importLegacy").mockRejectedValueOnce(new Error("Database is read-only"));
    await expect(service.initialize()).rejects.toThrow("Database is read-only");
    expect((await settingsStore.load()).debug).toEqual(preferences);
    expect(update).not.toHaveBeenCalled();
    await service.initialize();
    expect(service.snapshot().preferences).toEqual(preferences);
    expect((await settingsStore.load()).debug).toBeUndefined();
  });

  it("should retry JSON cleanup without resurrecting deleted database profiles", async () => {
    update.mockRejectedValueOnce(new Error("Settings are read-only"));
    await expect(service.initialize()).rejects.toThrow("Settings are read-only");
    expect((await settingsStore.load()).debug).toEqual(preferences);
    expect(await cache.debug.read()).toEqual(preferences);
    await cache.debug.deleteConfiguration("node");
    await service.initialize();
    expect(service.snapshot().preferences.configurations).toEqual([]);
    expect((await settingsStore.load()).debug).toBeUndefined();
  });

  it("should reject new saves when the database is unavailable and leave legacy JSON intact", async () => {
    const unavailable = new DebugService(null, async () => undefined, () => undefined, undefined,
      { get: () => settings, update });
    await expect(unavailable.execute({ kind: "saveConfiguration", configuration: preferences.configurations[0] }))
      .rejects.toThrow("Debug storage is unavailable");
    expect(update).not.toHaveBeenCalled();
    expect((await settingsStore.load()).debug).toEqual(preferences);
  });
});
