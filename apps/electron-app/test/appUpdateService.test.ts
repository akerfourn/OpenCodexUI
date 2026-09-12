import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import type { AppUpdater } from "electron-updater";
import type { OpenCodexAppUpdateState } from "@open-codex-ui/opencodex-protocol";

import { AppUpdateService } from "../src/main/appUpdateService";

vi.mock("electron-updater", () => ({ autoUpdater: {} }));

describe("AppUpdateService", () => {
  it("should keep prereleases opt-in and expose an available update", async () => {
    const updater = createFakeUpdater();
    const states: OpenCodexAppUpdateState[] = [];
    const updateInfo = createUpdateInfo("1.15.0-alpha.2");
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit("checking-for-update");
      updater.emit("update-available", updateInfo);
      return { isUpdateAvailable: true, updateInfo };
    });
    const service = createService(updater, states, true);

    expect(updater.allowPrerelease).toBe(true);
    expect(updater.allowDowngrade).toBe(false);

    const state = await service.check(true);

    expect(state).toMatchObject({
      status: "available",
      availableVersion: "1.15.0-alpha.2",
      isSupported: true
    });
    expect(states.at(-1)?.status).toBe("available");
    service.dispose();
  });

  it("should publish download progress and require explicit installation", async () => {
    const updater = createFakeUpdater();
    const states: OpenCodexAppUpdateState[] = [];
    const updateInfo = createUpdateInfo("1.15.0");
    const installRequested = vi.fn();
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit("update-available", updateInfo);
      return { isUpdateAvailable: true, updateInfo };
    });
    updater.downloadUpdate.mockImplementation(async () => {
      updater.emit("download-progress", {
        percent: 42,
        transferred: 42,
        total: 100,
        bytesPerSecond: 10
      });
      updater.emit("update-downloaded", updateInfo);
      return ["/tmp/update.AppImage"];
    });
    const service = new AppUpdateService({
      currentVersion: "1.14.0",
      isPackaged: true,
      allowPrerelease: false,
      emit: (state) => states.push(state),
      log: vi.fn(),
      onInstallRequested: installRequested
    }, updater as unknown as AppUpdater);

    await service.check(true);
    await service.download();

    expect(states.some((state) => state.status === "downloading")).toBe(true);
    expect(service.getState().status).toBe("downloaded");
    expect(updater.quitAndInstall).not.toHaveBeenCalled();

    service.install();

    expect(installRequested).toHaveBeenCalledOnce();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
    service.dispose();
  });

  it("should convert provider failures into a recoverable error state", async () => {
    const updater = createFakeUpdater();
    updater.checkForUpdates.mockRejectedValue(
      createUpdaterError("GitHub unavailable", "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")
    );
    const service = createService(updater, [], false);

    const state = await service.check(true);

    expect(state).toMatchObject<Partial<OpenCodexAppUpdateState>>({
      status: "error",
      errorMessage: "GitHub unavailable"
    });
    service.dispose();
  });

  it.each([
    "ERR_UPDATER_LATEST_VERSION_NOT_FOUND",
    "ERR_UPDATER_NO_PUBLISHED_VERSIONS"
  ])("should ignore a missing release for a prerelease build (%s)", async (code) => {
    const updater = createFakeUpdater();
    const error = createUpdaterError(
      "Unable to find latest version on GitHub",
      code
    );
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit("error", error);
      throw error;
    });
    const service = createService(updater, [], false, "1.14.0-alpha.2");

    const state = await service.check(true);

    expect(state).toMatchObject<Partial<OpenCodexAppUpdateState>>({
      status: "not-available",
      availableVersion: null,
      errorMessage: null
    });
    service.dispose();
  });
});

type FakeUpdater = EventEmitter & {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  logger: unknown;
  isUpdaterActive: ReturnType<typeof vi.fn>;
  checkForUpdates: ReturnType<typeof vi.fn>;
  downloadUpdate: ReturnType<typeof vi.fn>;
  quitAndInstall: ReturnType<typeof vi.fn>;
};

/** Creates a small updater double with controllable provider events. */
function createFakeUpdater(): FakeUpdater {
  const updater = new EventEmitter() as FakeUpdater;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.logger = null;
  updater.isUpdaterActive = vi.fn(() => true);
  updater.checkForUpdates = vi.fn(async () => null);
  updater.downloadUpdate = vi.fn(async () => []);
  updater.quitAndInstall = vi.fn();
  return updater;
}

/** Creates the service with deterministic host callbacks. */
function createService(
  updater: FakeUpdater,
  states: OpenCodexAppUpdateState[],
  allowPrerelease: boolean,
  currentVersion = "1.14.0"
): AppUpdateService {
  return new AppUpdateService({
    currentVersion,
    isPackaged: true,
    allowPrerelease,
    emit: (state) => states.push(state),
    log: vi.fn(),
    onInstallRequested: vi.fn()
  }, updater as unknown as AppUpdater);
}

/** Creates an updater error with the code used by electron-updater providers. */
function createUpdaterError(message: string, code: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

/** Creates the smallest provider metadata accepted by the updater contract. */
function createUpdateInfo(version: string): {
  version: string;
  releaseName: string;
  releaseDate: string;
} {
  return {
    version,
    releaseName: `OpenCodexUI ${version}`,
    releaseDate: "2026-09-12T12:00:00.000Z"
  };
}
