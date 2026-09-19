import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { autoUpdater as nativeAutoUpdater } from "electron";
import { AppImageUpdater } from "electron-updater";
import type { InstallOptions } from "electron-updater/out/BaseUpdater.js";
import { installAppImage } from "./installAppImage.js";

const execFileAsync = promisify(execFile);

/** Starts the replacement independently, waiting for confirmation that spawning succeeded. */
async function launchAppImage(file: string, env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(file, [], { env, detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** Retains upstream download verification while making every installation I/O asynchronous. */
export class AsyncAppImageUpdater extends AppImageUpdater {
  /** Prevents concurrent replacements until installation and restart have completed. */
  private isInstalling = false;

  /** Keeps Electron running until the asynchronous replacement has succeeded. */
  protected override doInstall(options: InstallOptions): boolean {
    if (this.isInstalling) return false;
    const currentPath = process.env.APPIMAGE;
    const installerPath = this.installerPath;
    if (currentPath === undefined || currentPath.length === 0 || installerPath === null) {
      this.dispatchError(new Error("The current AppImage or downloaded update is unavailable."));
      return false;
    }
    this.isInstalling = true;
    void this.installAndRestart(installerPath, currentPath, options);
    return false;
  }

  /** Reports replacement and launch failures without closing the running application. */
  private async installAndRestart(
    installerPath: string,
    currentPath: string,
    options: InstallOptions,
  ): Promise<void> {
    try {
      const destination = await installAppImage(installerPath, currentPath);
      if (destination !== currentPath) this.emit("appimage-filename-updated", destination);
      const env = { ...process.env, APPIMAGE_SILENT_INSTALL: "true" };
      if (options.isForceRunAfter) {
        await launchAppImage(destination, env);
      } else {
        await execFileAsync(destination, [], {
          env: { ...env, APPIMAGE_EXIT_AFTER_INSTALL: "true" },
        });
      }
      nativeAutoUpdater.emit("before-quit-for-update");
      this.app.quit();
    } catch (error) {
      this.isInstalling = false;
      this.dispatchError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
