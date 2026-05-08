/**
 * Boots the Electron main process and connects the application window to the backend bridge.
 */
import path from "node:path";

import { app, BrowserWindow, Menu } from "electron";

import { createWindow } from "./createWindow.js";
import { ElectronBridgeServer } from "./electronBridgeServer.js";
import { SettingsStore } from "./settingsStore.js";

let bridgeServer: ElectronBridgeServer | null = null;

app.setName("OpenCodexUI");

/**
 * Starts the Electron application once the runtime is ready.
 *
 * @returns Promise resolved after the main window and bridge are initialized.
 */
async function main(): Promise<void> {
  await app.whenReady();
  Menu.setApplicationMenu(null);

  const settingsStore = new SettingsStore(app.getPath("userData"));
  const settings = await settingsStore.load();
  const projectPath = resolveProjectPath();
  const userDataPath = app.getPath("userData");
  const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? null;
  const window = createWindow({
    preloadPath: path.join(__dirname, "preload.cjs"),
    rendererPath: path.join(__dirname, "..", "renderer"),
    devServerUrl
  });

  bridgeServer = new ElectronBridgeServer({
    settings,
    projectPath,
    userDataPath,
    saveSettings: (nextSettings) => settingsStore.save(nextSettings)
  });
  bridgeServer.attachWindow(window);
  bridgeServer.register();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const nextWindow = createWindow({
        preloadPath: path.join(__dirname, "preload.cjs"),
        rendererPath: path.join(__dirname, "..", "renderer"),
        devServerUrl
      });
      bridgeServer?.attachWindow(nextWindow);
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void bridgeServer?.dispose();
});

void main();

/**
 * Resolves the project path associated with the current Electron session.
 *
 * @returns Project path derived from the environment or the current working directory.
 */
function resolveProjectPath(): string {
  return process.env.OPENCODEX_PROJECT_PATH
    ?? process.env.INIT_CWD
    ?? process.cwd();
}
