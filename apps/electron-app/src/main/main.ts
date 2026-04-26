import path from "node:path";

import { app, BrowserWindow } from "electron";

import { createWindow } from "./createWindow.js";
import { ElectronBridgeServer } from "./electronBridgeServer.js";
import { SettingsStore } from "./settingsStore.js";

let bridgeServer: ElectronBridgeServer | null = null;

async function main(): Promise<void> {
  await app.whenReady();

  const settingsStore = new SettingsStore(app.getPath("userData"));
  const settings = await settingsStore.load();
  const projectPath = resolveProjectPath();
  const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? null;
  const window = createWindow({
    preloadPath: path.join(__dirname, "preload.cjs"),
    rendererPath: path.join(__dirname, "..", "renderer"),
    devServerUrl
  });

  bridgeServer = new ElectronBridgeServer({
    settings,
    projectPath,
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

function resolveProjectPath(): string {
  return process.env.OPENCODEX_PROJECT_PATH
    ?? process.env.INIT_CWD
    ?? process.cwd();
}
