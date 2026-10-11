import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type { OpenCodexRequest, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The bridge and native dispatcher stay real; host services and the backend are effect boundaries.
const mocks = vi.hoisted(() => ({
  ipc: { on: vi.fn(), handle: vi.fn(), off: vi.fn(), removeHandler: vi.fn() },
  backend: vi.fn(),
  runtime: {
    settings: { get: vi.fn() }, dictation: { dispose: vi.fn() },
    logs: { create: vi.fn() }, approvals: { resolve: vi.fn() }, dispose: vi.fn()
  },
  dictation: { handle: vi.fn(), local: { dispose: vi.fn() } },
  emoji: { get: vi.fn(), update: vi.fn() },
  updates: {
    getState: vi.fn(), check: vi.fn(), download: vi.fn(), install: vi.fn(),
    setAllowPrerelease: vi.fn(), dispose: vi.fn()
  },
  discord: { reconnect: vi.fn(), setEnabled: vi.fn(), handleEvent: vi.fn(), dispose: vi.fn() },
  performance: { setSettings: vi.fn(), recordBackendEvent: vi.fn(), dispose: vi.fn() },
  notifications: { setSettings: vi.fn(), handleEvent: vi.fn(), dispose: vi.fn() }
}));

vi.mock("electron", () => ({ app: { isPackaged: false, getAppPath: () => "app" }, ipcMain: mocks.ipc }));
vi.mock("@open-codex-ui/opencodex-core", () => ({
  OpenCodexBackendRuntime: vi.fn(function () { return mocks.runtime; }),
  OpenCodexRequestRouter: vi.fn(function () { return { handleRequest: mocks.backend }; })
}));
vi.mock("../src/main/electronCacheRepository.js", () => ({ createCacheRepository: () => null }));
vi.mock("../src/main/asyncDebUpdater.js", () => ({ createNativeAppUpdater: vi.fn() }));
vi.mock("../src/main/dictation/DictationHostService.js", () => ({
  DictationHostService: vi.fn(function () { return mocks.dictation; })
}));
vi.mock("../src/main/emojiCatalogStore.js", () => ({
  EmojiCatalogStore: vi.fn(function () { return mocks.emoji; })
}));
vi.mock("../src/main/appUpdateService.js", () => ({
  AppUpdateService: vi.fn(function () { return mocks.updates; })
}));
vi.mock("../src/main/discordPresenceService.js", () => ({
  DiscordPresenceService: vi.fn(function () { return mocks.discord; })
}));
vi.mock("../src/main/performanceMonitoringService.js", () => ({
  PerformanceMonitoringService: vi.fn(function () { return mocks.performance; })
}));
vi.mock("../src/main/desktopNotificationService.js", () => ({
  DesktopNotificationService: vi.fn(function () { return mocks.notifications; })
}));

import { ElectronBridgeServer } from "../src/main/electronBridgeServer.js";
import { defaultSettings } from "../src/main/settingsStore.js";

/** Creates an inert renderer with the identity and native actions used by the bridge. */
function createWindow(id: number) {
  const window = {
    webContents: {
      id, on: vi.fn(), send: vi.fn(), isDestroyed: () => false,
      openDevTools: vi.fn(), closeDevTools: vi.fn()
    },
    on: vi.fn(), isDestroyed: () => false
  };
  return { window: window as unknown as BrowserWindow, webContents: window.webContents };
}

describe("Electron bridge request wiring", () => {
  let bridge: ElectronBridgeServer;
  let invoke: (event: IpcMainInvokeEvent, request: OpenCodexRequest) => Promise<unknown>;
  let onSettingsUpdated: ReturnType<typeof vi.fn>;
  let openUsageHistory: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backend.mockReset();
    mocks.emoji.get.mockReset();
    mocks.dictation.handle.mockReset();
    mocks.runtime.settings.get.mockReturnValue({ ...defaultSettings, developerMode: true });
    mocks.updates.getState.mockReturnValue({
      currentVersion: "test", isSupported: false, status: "idle", availableVersion: null,
      releaseName: null, releaseDate: null, progress: null, errorMessage: null, checkedAt: null
    });
    onSettingsUpdated = vi.fn();
    openUsageHistory = vi.fn();
    bridge = new ElectronBridgeServer({
      settings: defaultSettings, projectPath: null, appVersion: "test", userDataPath: "unused",
      saveSettings: vi.fn(), openUsageHistory, onSettingsUpdated,
      onApplicationCloseResponse: vi.fn(), onApplicationUpdateInstallStateChanged: vi.fn()
    });
    bridge.register();
    const registration = mocks.ipc.handle.mock.calls.find(([channel]) => channel === "opencodex:request");
    expect(registration).toBeDefined();
    invoke = registration![1];
  });

  afterEach(async () => {
    await bridge.dispose();
  });

  /** Sends a request through the handler actually registered with Electron IPC. */
  function request(payload: OpenCodexRequest, senderId = 10): Promise<unknown> {
    const event = { sender: { id: senderId } } as IpcMainInvokeEvent;
    return invoke(event, payload);
  }

  it("should honor the current main renderer after attachment, replacement and disposal", async () => {
    const payload: OpenCodexRequest = { type: "dictation.cancel", sessionId: "recording-1" };
    await expect(request(payload)).rejects.toThrow("Dictation is only available in the main window.");
    expect(mocks.dictation.handle).not.toHaveBeenCalled();

    bridge.attachWindow(createWindow(10).window);
    expect(await request(payload)).toBeUndefined();
    bridge.attachWindow(createWindow(20).window);
    await expect(request(payload, 10)).rejects.toThrow("main window");
    expect(await request(payload, 20)).toBeUndefined();
    expect(mocks.dictation.handle).toHaveBeenCalledTimes(2);
    expect(mocks.backend).not.toHaveBeenCalled();

    await bridge.dispose();
    await expect(request(payload, 20)).rejects.toThrow("main window");
    expect(mocks.dictation.handle).toHaveBeenCalledTimes(2);
    expect(mocks.ipc.removeHandler).toHaveBeenCalledWith("opencodex:request");
  });

  it("should wire native services without forwarding their requests to the backend", async () => {
    const window = createWindow(10);
    bridge.attachWindow(window.window);
    const catalog = { schemaVersion: 1, overrides: {} };
    mocks.emoji.get.mockResolvedValue(catalog);

    expect(await request({ type: "emojiCatalog.get" })).toBe(catalog);
    expect(await request({ type: "app.update.check", force: true })).toBeUndefined();
    expect(mocks.updates.check).toHaveBeenCalledWith(true);
    expect(await request({ type: "discord.reconnect" })).toEqual({ ok: true });
    expect(mocks.discord.reconnect).toHaveBeenCalledTimes(1);
    expect(await request({ type: "app.openUsageHistory", sourceId: "source-2" })).toEqual({ ok: true });
    expect(openUsageHistory).toHaveBeenCalledWith("source-2");
    expect(await request({ type: "app.openDevTools" })).toEqual({ ok: true });
    expect(window.webContents.openDevTools).toHaveBeenCalledWith({ mode: "detach" });
    expect(mocks.backend).not.toHaveBeenCalled();
  });

  it("should evaluate developer mode at request time and keep windowless behavior", async () => {
    expect(await request({ type: "app.openDevTools" })).toEqual({ ok: true });
    const window = createWindow(10);
    bridge.attachWindow(window.window);
    mocks.runtime.settings.get.mockReturnValue({ ...defaultSettings, developerMode: false });

    await expect(request({ type: "app.openDevTools" })).rejects.toThrow("Developer mode is disabled.");
    expect(window.webContents.openDevTools).not.toHaveBeenCalled();
    expect(mocks.backend).not.toHaveBeenCalled();
  });

  it("should apply returned settings to every host service only after the backend finishes", async () => {
    const window = createWindow(10);
    bridge.attachWindow(window.window);
    const settings: OpenCodexSettings = {
      ...defaultSettings, developerMode: false, discordRichPresenceEnabled: false, allowPrereleaseUpdates: true
    };
    let complete!: (settings: OpenCodexSettings) => void;
    mocks.backend.mockReturnValue(new Promise<OpenCodexSettings>((resolve) => { complete = resolve; }));
    const payload: OpenCodexRequest = { type: "settings.update", patch: { developerMode: false } };
    const pending = request(payload);
    expect(mocks.backend).toHaveBeenCalledWith(payload);
    expect(onSettingsUpdated).not.toHaveBeenCalled();
    expect(mocks.notifications.setSettings).not.toHaveBeenCalled();

    complete(settings);
    expect(await pending).toBe(settings);
    expect(mocks.discord.setEnabled).toHaveBeenCalledWith(false);
    expect(mocks.performance.setSettings).toHaveBeenCalledWith(settings);
    expect(mocks.notifications.setSettings).toHaveBeenCalledWith(settings);
    expect(mocks.updates.setAllowPrerelease).toHaveBeenCalledWith(true);
    expect(window.webContents.closeDevTools).toHaveBeenCalledTimes(1);
    expect(onSettingsUpdated).toHaveBeenCalledWith(settings);
    expect(onSettingsUpdated.mock.invocationCallOrder[0])
      .toBeGreaterThan(window.webContents.closeDevTools.mock.invocationCallOrder[0]!);
  });

  it("should keep DevTools open and default prereleases to false when returned settings request it", async () => {
    const window = createWindow(10);
    bridge.attachWindow(window.window);
    const settings = { ...defaultSettings, developerMode: true, allowPrereleaseUpdates: undefined };
    mocks.backend.mockResolvedValue(settings);

    expect(await request({ type: "settings.update", patch: { developerMode: true } })).toBe(settings);
    expect(mocks.updates.setAllowPrerelease).toHaveBeenCalledWith(false);
    expect(window.webContents.closeDevTools).not.toHaveBeenCalled();
    expect(onSettingsUpdated).toHaveBeenCalledWith(settings);
  });

  it("should preserve backend responses without applying settings for other request types", async () => {
    const response = { ...defaultSettings };
    mocks.backend.mockResolvedValue(response);
    const payload: OpenCodexRequest = { type: "settings.get" };

    expect(await request(payload, 20)).toBe(response);
    expect(mocks.backend).toHaveBeenCalledWith(payload);
    expect(onSettingsUpdated).not.toHaveBeenCalled();
    expect(mocks.performance.setSettings).not.toHaveBeenCalled();
  });

  it("should leave host settings untouched when the backend returns undefined or rejects", async () => {
    const window = createWindow(10);
    bridge.attachWindow(window.window);
    const payload: OpenCodexRequest = { type: "settings.update", patch: { developerMode: false } };
    expect(await request(payload)).toBeUndefined();
    const error = new Error("Backend update failed");
    mocks.backend.mockRejectedValueOnce(error);

    await expect(request(payload)).rejects.toBe(error);
    expect(mocks.discord.setEnabled).not.toHaveBeenCalled();
    expect(mocks.performance.setSettings).not.toHaveBeenCalled();
    expect(mocks.notifications.setSettings).not.toHaveBeenCalled();
    expect(mocks.updates.setAllowPrerelease).not.toHaveBeenCalled();
    expect(window.webContents.closeDevTools).not.toHaveBeenCalled();
    expect(onSettingsUpdated).not.toHaveBeenCalled();
  });
});
