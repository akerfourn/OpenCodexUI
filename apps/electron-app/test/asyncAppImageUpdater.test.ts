import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppAdapter } from "electron-updater/out/AppAdapter.js";
import { AsyncAppImageUpdater } from "../src/main/asyncAppImageUpdater.js";
import { installAppImage } from "../src/main/installAppImage.js";

const native = vi.hoisted(() => ({ emit: vi.fn(), spawn: vi.fn(), execFile: vi.fn() }));
vi.mock("electron", () => ({ autoUpdater: { emit: native.emit } }));
vi.mock("node:child_process", () => ({ spawn: native.spawn, execFile: native.execFile }));
vi.mock("../src/main/installAppImage.js", () => ({ installAppImage: vi.fn() }));

/** Supplies verified download metadata without network access. */
class TestUpdater extends AsyncAppImageUpdater {
  /** Replaces only the download state, preserving the real upstream install guard. */
  constructor(app: AppAdapter) {
    super(null, app);
    this.downloadedUpdateHelper = { file: "/cache/new.AppImage", downloadedFileInfo: {} } as never;
    this.autoInstallOnAppQuit = false;
    this.logger = null;
  }
}

/** Isolates process effects while exercising the real updater lifecycle. */
function fixture() {
  const app = { version: "1.14.0", name: "OpenCodexUI", quit: vi.fn() };
  const updater = new TestUpdater(app as unknown as AppAdapter);
  const error = vi.fn();
  updater.on("error", error);
  const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
  native.spawn.mockReturnValue(child);
  return { updater, app, error, child };
}

/** Flushes the short promise chain without timers or launching processes. */
async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

describe("asynchronous AppImage updater", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("APPIMAGE", "/apps/old.AppImage");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("should wait for replacement and successful spawn before quitting, ignoring duplicate requests", async () => {
    let complete!: (file: string) => void;
    vi.mocked(installAppImage).mockReturnValue(new Promise<string>((resolve) => { complete = resolve; }));
    const { updater, app, child } = fixture();
    const renamed = vi.fn();
    updater.on("appimage-filename-updated", renamed);
    updater.quitAndInstall(false, true);
    updater.quitAndInstall(false, true);
    expect(installAppImage).toHaveBeenCalledOnce();
    expect(native.spawn).not.toHaveBeenCalled();
    expect(app.quit).not.toHaveBeenCalled();
    complete("/apps/new.AppImage");
    await flush();
    expect(renamed).toHaveBeenCalledWith("/apps/new.AppImage");
    expect(native.spawn).toHaveBeenCalledWith("/apps/new.AppImage", [], expect.objectContaining({
      detached: true, env: expect.objectContaining({ APPIMAGE_SILENT_INSTALL: "true" }),
    }));
    expect(app.quit).not.toHaveBeenCalled();
    child.emit("spawn");
    await flush();
    expect(child.unref).toHaveBeenCalledOnce();
    expect(native.emit).toHaveBeenCalledWith("before-quit-for-update");
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it("should keep the application open after replacement fails and allow retry", async () => {
    vi.mocked(installAppImage).mockRejectedValueOnce(new Error("Disk full"));
    vi.mocked(installAppImage).mockResolvedValueOnce("/apps/new.AppImage");
    const { updater, app, error, child } = fixture();
    updater.quitAndInstall(false, true);
    await flush();
    expect(error.mock.calls[0]?.[0]).toMatchObject({ message: "Disk full" });
    expect(app.quit).not.toHaveBeenCalled();
    updater.quitAndInstall(false, true);
    await flush();
    child.emit("spawn");
    await flush();
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it("should report launch failures without quitting", async () => {
    vi.mocked(installAppImage).mockResolvedValue("/apps/new.AppImage");
    const { updater, app, error, child } = fixture();
    updater.quitAndInstall(false, true);
    await flush();
    child.emit("error", new Error("Permission denied"));
    await flush();
    expect(error.mock.calls[0]?.[0]).toMatchObject({ message: "Permission denied" });
    expect(app.quit).not.toHaveBeenCalled();
    expect(native.emit).not.toHaveBeenCalled();
  });

  it("should await asynchronous integration when restarting is disabled", async () => {
    vi.mocked(installAppImage).mockResolvedValue("/apps/new.AppImage");
    const { updater, app } = fixture();
    updater.quitAndInstall(true, false);
    await flush();
    expect(native.spawn).not.toHaveBeenCalled();
    expect(native.execFile).toHaveBeenCalledWith("/apps/new.AppImage", [], {
      env: expect.objectContaining({ APPIMAGE_EXIT_AFTER_INSTALL: "true" }),
    }, expect.any(Function));
    expect(app.quit).not.toHaveBeenCalled();
    const callback = native.execFile.mock.calls[0]![3];
    callback(null, "", "");
    await flush();
    expect(app.quit).toHaveBeenCalledOnce();
  });
});
