import { autoUpdater as nativeAutoUpdater } from "electron";
import { autoUpdater, AppImageUpdater, DebUpdater, type AppUpdater } from "electron-updater";
import type { InstallOptions } from "electron-updater/out/BaseUpdater.js";
import { installDebPackage } from "./installDebPackage.js";
import { AsyncAppImageUpdater } from "./asyncAppImageUpdater.js";

/** Preserves updater download verification while keeping Debian installation asynchronous. */
export class AsyncDebUpdater extends DebUpdater {
  /** Prevents re-entry while the package manager or elevation dialog is running. */
  private isInstalling = false;

  /** Defers quitting until the package manager has actually completed successfully. */
  protected override doInstall(options: InstallOptions): boolean {
    if (this.isInstalling) return false;
    const file = this.downloadedUpdateHelper?.file;
    if (file === undefined || file === null) {
      this.dispatchError(new Error("No downloaded Debian update is available."));
      return false;
    }
    this.isInstalling = true;
    void this.installAndRestart(file, options);
    // BaseUpdater must not quit synchronously while installation is still pending.
    return false;
  }

  /** Reports installation failures through the updater's existing error channel. */
  private async installAndRestart(file: string, options: InstallOptions): Promise<void> {
    try {
      await installDebPackage(file, this.app.name);
      if (options.isForceRunAfter) this.app.relaunch();
      nativeAutoUpdater.emit("before-quit-for-update");
      this.app.quit();
    } catch (error) {
      this.isInstalling = false;
      this.dispatchError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** Replaces blocking Linux installers while retaining the standard updater on other platforms. */
export function createNativeAppUpdater(): AppUpdater {
  const updater = autoUpdater;
  if (updater instanceof DebUpdater) return new AsyncDebUpdater();
  if (updater instanceof AppImageUpdater) return new AsyncAppImageUpdater();
  return updater;
}
