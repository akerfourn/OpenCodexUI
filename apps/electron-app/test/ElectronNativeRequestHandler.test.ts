import type {
  OpenCodexAppUpdateState,
  OpenCodexDictationInput,
  OpenCodexEmojiCatalogOverrides,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import {
  ElectronNativeRequestHandler,
  type ElectronNativeRequestHandlerOptions
} from "../src/main/ElectronNativeRequestHandler.js";

const input: OpenCodexDictationInput = {
  sessionId: "recording-1", sourceId: "source-1", backend: "codex", language: "auto", audioBase64: "AAA="
};
const dictationRequests: OpenCodexRequest[] = [
  { type: "dictation.transcribe", input },
  { type: "dictation.cancel", sessionId: input.sessionId },
  { type: "dictation.models.state" },
  { type: "dictation.models.install", modelId: "whisper-base" },
  { type: "dictation.models.remove" },
  { type: "dictation.models.cancel" }
];

/** Replaces host effects with service ports while keeping the request dispatcher real. */
function createFixture() {
  const overrides: OpenCodexEmojiCatalogOverrides = { schemaVersion: 1, overrides: {} };
  const state: OpenCodexAppUpdateState = {
    currentVersion: "1.16.0", isSupported: true, status: "idle", availableVersion: null,
    releaseName: null, releaseDate: null, progress: null, errorMessage: null, checkedAt: null
  };
  const options = {
    dictation: { handle: vi.fn().mockResolvedValue(undefined) },
    emojiCatalog: {
      get: vi.fn().mockResolvedValue(overrides),
      update: vi.fn().mockResolvedValue(overrides)
    },
    appUpdates: {
      getState: vi.fn(() => state), check: vi.fn().mockResolvedValue(state),
      download: vi.fn().mockResolvedValue(state), install: vi.fn(() => state)
    },
    discordPresence: { reconnect: vi.fn().mockResolvedValue(undefined) },
    getMainWebContentsId: vi.fn<() => number | undefined>(() => 10),
    openDeveloperTools: vi.fn(() => ({ ok: true as const })),
    openUsageHistory: vi.fn(),
    handleBackendRequest: vi.fn().mockResolvedValue(undefined)
  } satisfies ElectronNativeRequestHandlerOptions;
  return { handler: new ElectronNativeRequestHandler(options), options, overrides, state };
}

describe("Electron native request handler", () => {
  it("should pass a main-window recording unchanged to dictation and return its response", async () => {
    const { handler, options } = createFixture();
    const response = { text: "bonjour" };
    const request: OpenCodexRequest = { type: "dictation.transcribe", input };
    options.dictation.handle.mockResolvedValue(response);

    expect(await handler.handle(request, 10)).toBe(response);
    expect(options.dictation.handle).toHaveBeenCalledWith(request);
    expect(options.handleBackendRequest).not.toHaveBeenCalled();
  });

  it.each(dictationRequests)("should reject $type from a secondary renderer before invoking any service", async (request) => {
    const { handler, options } = createFixture();

    await expect(handler.handle(request, 20)).rejects.toThrow("Dictation is only available in the main window.");
    expect(options.dictation.handle).not.toHaveBeenCalled();
    expect(options.handleBackendRequest).not.toHaveBeenCalled();
  });

  it("should deny dictation when no main window is attached", async () => {
    const { handler, options } = createFixture();
    options.getMainWebContentsId.mockReturnValue(undefined);

    await expect(handler.handle({ type: "dictation.models.state" }, 10)).rejects.toThrow("main window");
    expect(options.dictation.handle).not.toHaveBeenCalled();
  });

  it("should keep an undefined native response from falling through to the backend", async () => {
    const { handler, options } = createFixture();
    const request: OpenCodexRequest = { type: "dictation.cancel", sessionId: input.sessionId };

    expect(await handler.handle(request, 10)).toBeUndefined();
    expect(options.dictation.handle).toHaveBeenCalledWith(request);
    expect(options.handleBackendRequest).not.toHaveBeenCalled();
  });

  it("should read and update the emoji catalog without using the backend", async () => {
    const { handler, options, overrides } = createFixture();
    const patch: OpenCodexEmojiCatalogOverrides = {
      schemaVersion: 1, overrides: { "🙂": { addedAliases: ["hello"], removedDefaultAliases: [] } }
    };

    expect(await handler.handle({ type: "emojiCatalog.get" }, 20)).toBe(overrides);
    expect(await handler.handle({ type: "emojiCatalog.update", overrides: patch }, 20)).toBe(overrides);
    expect(options.emojiCatalog.get).toHaveBeenCalledTimes(1);
    expect(options.emojiCatalog.update).toHaveBeenCalledWith(patch);
    expect(options.handleBackendRequest).not.toHaveBeenCalled();
  });

  it("should delegate DevTools authorization and propagate its refusal", async () => {
    const { handler, options } = createFixture();

    expect(await handler.handle({ type: "app.openDevTools" }, 10)).toEqual({ ok: true });
    const error = new Error("Developer mode is disabled.");
    options.openDeveloperTools.mockImplementation(() => { throw error; });
    await expect(handler.handle({ type: "app.openDevTools" }, 10)).rejects.toBe(error);
    expect(options.handleBackendRequest).not.toHaveBeenCalled();
  });

  it.each([
    { type: "app.update.state", method: "getState" },
    { type: "app.update.download", method: "download" },
    { type: "app.update.install", method: "install" }
  ] as const)("should return the native update result for $type", async ({ type, method }) => {
    const { handler, options, state } = createFixture();

    expect(await handler.handle({ type }, 20)).toBe(state);
    expect(options.appUpdates[method]).toHaveBeenCalledTimes(1);
    expect(options.handleBackendRequest).not.toHaveBeenCalled();
  });

  it.each([undefined, false, true])("should normalize the update check force flag %s", async (force) => {
    const { handler, options, state } = createFixture();

    expect(await handler.handle({ type: "app.update.check", force }, 10)).toBe(state);
    expect(options.appUpdates.check).toHaveBeenCalledWith(force === true);
  });

  it("should open usage history for the request's explicit source", async () => {
    const { handler, options } = createFixture();

    expect(await handler.handle({ type: "app.openUsageHistory", sourceId: "source-2" }, 20)).toEqual({ ok: true });
    expect(options.openUsageHistory).toHaveBeenCalledWith("source-2");
    expect(options.handleBackendRequest).not.toHaveBeenCalled();
  });

  it("should wait for Discord reconnect before acknowledging success", async () => {
    const { handler, options } = createFixture();
    let finishReconnect!: () => void;
    options.discordPresence.reconnect.mockReturnValue(new Promise<void>((resolve) => { finishReconnect = resolve; }));
    const settled = vi.fn();
    const pending = handler.handle({ type: "discord.reconnect" }, 10).then(settled);

    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    finishReconnect();
    await pending;
    expect(settled).toHaveBeenCalledWith({ ok: true });
    expect(options.handleBackendRequest).not.toHaveBeenCalled();
  });

  it("should propagate native asynchronous failures without a backend retry", async () => {
    const { handler, options } = createFixture();
    const error = new Error("Host service failed");
    options.dictation.handle.mockRejectedValue(error);
    options.emojiCatalog.update.mockRejectedValue(error);
    options.appUpdates.download.mockRejectedValue(error);
    options.discordPresence.reconnect.mockRejectedValue(error);

    await expect(handler.handle({ type: "dictation.models.state" }, 10)).rejects.toBe(error);
    await expect(handler.handle({ type: "emojiCatalog.update", overrides: { schemaVersion: 1, overrides: {} } }, 10))
      .rejects.toBe(error);
    await expect(handler.handle({ type: "app.update.download" }, 10)).rejects.toBe(error);
    await expect(handler.handle({ type: "discord.reconnect" }, 10)).rejects.toBe(error);
    expect(options.handleBackendRequest).not.toHaveBeenCalled();
  });

  it("should pass other requests unchanged to the backend and preserve its response or error", async () => {
    const { handler, options } = createFixture();
    const request: OpenCodexRequest = { type: "settings.update", patch: { developerMode: true } };
    const response = { developerMode: true };
    options.handleBackendRequest.mockResolvedValueOnce(response);

    expect(await handler.handle(request, 20)).toBe(response);
    expect(options.handleBackendRequest).toHaveBeenCalledWith(request);
    const error = new Error("Backend unavailable");
    options.handleBackendRequest.mockRejectedValueOnce(error);
    await expect(handler.handle(request, 20)).rejects.toBe(error);
  });
});
