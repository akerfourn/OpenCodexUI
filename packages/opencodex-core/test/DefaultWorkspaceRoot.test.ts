import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexSettings, OpenCodexSourceKind } from "@open-codex-ui/opencodex-protocol";
import { SettingsApi } from "../src/backend/runtime/api/SupportApis";
import { RuntimeSettingsStore } from "../src/backend/runtime/RuntimeSettingsStore";
import { initializeDefaultWorkspaceRoot } from "../src/backend/workspaces/initializeDefaultWorkspaceRoot";

const localSource = { id: "local-source", kind: "local" as const };

describe("default workspace storage", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "opencodex-default-storage-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("should create the app-data directory before persisting and survive settings reload", async () => {
    const settingsPath = path.join(directory, "settings.json");
    const rootPath = path.join(directory, "workspaces");
    const save = vi.fn(async (next: OpenCodexSettings) => {
      expect((await stat(rootPath)).isDirectory()).toBe(true);
      await writeFile(settingsPath, JSON.stringify(next), "utf8");
    });
    const settings = createSettingsApi({}, save);

    await initializeDefaultWorkspaceRoot(directory, [localSource], settings);
    const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as OpenCodexSettings;
    expect(persisted.workspaceRoots).toEqual([{
      id: "app-data", sourceId: "local-source", label: "OpenCodexUI", path: rootPath, isDefault: true
    }]);
    expect(persisted.defaultWorkspaceRootInitialized).toBe(true);
    await initializeDefaultWorkspaceRoot(directory, [localSource], createSettingsApi(persisted, save));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("should preserve a configured local space and its default choice", async () => {
    const roots = [{ id: "custom", sourceId: localSource.id, label: "Disk", path: directory, isDefault: true }];
    const settings = createSettingsApi({ workspaceRoots: roots });

    await initializeDefaultWorkspaceRoot(directory, [localSource], settings);

    expect(settings.get()).toMatchObject({ workspaceRoots: roots, defaultWorkspaceRootInitialized: true });
    await expect(stat(path.join(directory, "workspaces"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("should keep an intentional removal after restarting", async () => {
    const settings = createSettingsApi({ workspaceRoots: [], defaultWorkspaceRootInitialized: true });

    await initializeDefaultWorkspaceRoot(directory, [localSource], settings);

    expect(settings.get().workspaceRoots).toEqual([]);
    await expect(stat(path.join(directory, "workspaces"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("should not assign host storage to WSL, SSH or custom commands", async () => {
    const sources = ["wsl", "ssh", "custom"].map((kind) => ({ id: kind, kind: kind as OpenCodexSourceKind }));
    const settings = createSettingsApi({});

    await initializeDefaultWorkspaceRoot(directory, sources, settings);

    expect(settings.get().workspaceRoots).toBeUndefined();
    expect(settings.get().defaultWorkspaceRootInitialized).toBeUndefined();
    await expect(stat(path.join(directory, "workspaces"))).rejects.toMatchObject({ code: "ENOENT" });
    await initializeDefaultWorkspaceRoot(directory, [...sources, localSource], settings);
    expect(settings.get().workspaceRoots?.[0].sourceId).toBe(localSource.id);
  });

  it("should prefer the default local source and preserve remote storage identities", async () => {
    const remoteRoot = { id: "app-data", sourceId: "ssh", label: "Remote", path: "/storage", isDefault: true };
    const settings = createSettingsApi({ defaultSourceId: "preferred", workspaceRoots: [remoteRoot] });

    await initializeDefaultWorkspaceRoot(directory, [
      { id: "ssh", kind: "ssh" }, localSource, { id: "preferred", kind: "local" }
    ], settings);

    expect(settings.get().workspaceRoots).toEqual([
      remoteRoot,
      { id: "app-data-1", sourceId: "preferred", label: "OpenCodexUI", path: path.join(directory, "workspaces"), isDefault: true }
    ]);
  });

  it("should skip initialization when the host provides no app-data path", async () => {
    const save = vi.fn();
    const settings = createSettingsApi({}, save);
    await initializeDefaultWorkspaceRoot(undefined, [localSource], settings);
    expect(save).not.toHaveBeenCalled();
  });

  it("should leave initialization pending when directory creation fails", async () => {
    await writeFile(path.join(directory, "workspaces"), "a file occupies this path");
    const save = vi.fn();
    const settings = createSettingsApi({}, save);

    await expect(initializeDefaultWorkspaceRoot(directory, [localSource], settings))
      .rejects.toMatchObject({ code: "EEXIST" });

    expect(save).not.toHaveBeenCalled();
    expect(settings.get().defaultWorkspaceRootInitialized).toBeUndefined();
  });

  it("should retry without publishing an unsaved root when settings persistence fails", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Disk unavailable")).mockResolvedValue(undefined);
    const settings = createSettingsApi({}, save);

    await expect(initializeDefaultWorkspaceRoot(directory, [localSource], settings)).rejects.toThrow("Disk unavailable");
    expect(settings.get().workspaceRoots).toBeUndefined();
    expect(settings.get().defaultWorkspaceRootInitialized).toBeUndefined();

    await initializeDefaultWorkspaceRoot(directory, [localSource], settings);
    expect(settings.get().workspaceRoots).toHaveLength(1);
    expect(settings.get().defaultWorkspaceRootInitialized).toBe(true);
  });
});

/** Uses real settings normalization and publication while isolating host persistence. */
function createSettingsApi(
  initial: Partial<OpenCodexSettings>,
  save: (settings: OpenCodexSettings) => Promise<void> | void = vi.fn()
): SettingsApi {
  return new SettingsApi(new RuntimeSettingsStore(initial as OpenCodexSettings), save);
}
