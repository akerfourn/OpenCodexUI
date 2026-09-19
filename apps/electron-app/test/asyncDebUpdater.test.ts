import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppAdapter } from "electron-updater/out/AppAdapter.js";
import { AsyncDebUpdater } from "../src/main/asyncDebUpdater.js";
import { installDebPackage } from "../src/main/installDebPackage.js";

const native = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock("electron", () => ({ autoUpdater: native }));
vi.mock("../src/main/installDebPackage.js", () => ({ installDebPackage: vi.fn() }));

/** Supplies already-downloaded metadata without running a provider or installer. */
class TestUpdater extends AsyncDebUpdater {
  constructor(app: AppAdapter) {
    super(null, app);
    this.downloadedUpdateHelper = { file: "/cache/update file.deb", downloadedFileInfo: {} } as never;
    this.autoInstallOnAppQuit = false;
    this.logger = null;
  }
}

/** Replaces Electron lifecycle effects while retaining electron-updater's real install guard. */
function fixture() {
  const app = { version: "1.14.0", name: "OpenCodexUI", quit: vi.fn(), relaunch: vi.fn() };
  const updater = new TestUpdater(app as unknown as AppAdapter);
  const error = vi.fn();
  updater.on("error", error);
  return { updater, app, error };
}

describe("asynchronous Debian updater", () => {
  afterEach(() => vi.clearAllMocks());

  it("should return immediately and restart only after installation succeeds", async () => {
    let complete!: () => void;
    vi.mocked(installDebPackage).mockReturnValue(new Promise<void>((resolve) => { complete = resolve; }));
    const { updater, app } = fixture();
    updater.quitAndInstall(false, true);
    updater.quitAndInstall(false, true);
    expect(installDebPackage).toHaveBeenCalledOnce();
    expect(app.quit).not.toHaveBeenCalled();
    expect(app.relaunch).not.toHaveBeenCalled();
    expect(native.emit).not.toHaveBeenCalled();
    complete();
    await Promise.resolve();
    expect(app.relaunch).toHaveBeenCalledOnce();
    expect(native.emit).toHaveBeenCalledWith("before-quit-for-update");
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it("should keep the app open after denial and allow another explicit attempt", async () => {
    vi.mocked(installDebPackage).mockRejectedValueOnce(new Error("Authorization cancelled"));
    vi.mocked(installDebPackage).mockResolvedValueOnce();
    const { updater, app, error } = fixture();
    updater.quitAndInstall(false, true);
    await Promise.resolve();
    expect(error.mock.calls[0]?.[0]).toMatchObject({ message: "Authorization cancelled" });
    expect(app.quit).not.toHaveBeenCalled();
    expect(app.relaunch).not.toHaveBeenCalled();
    updater.quitAndInstall(false, true);
    await Promise.resolve();
    expect(app.quit).toHaveBeenCalledOnce();
  });
});
