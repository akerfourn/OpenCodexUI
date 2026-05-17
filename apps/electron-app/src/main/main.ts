/**
 * Boots the Electron main process and connects the application window to the backend bridge.
 */
import path from "node:path";
import { existsSync } from "node:fs";

import { app, BrowserWindow, Menu } from "electron";

import { createWindow } from "./createWindow.js";
import { ElectronBridgeServer } from "./electronBridgeServer.js";
import { SettingsStore } from "./settingsStore.js";

let bridgeServer: ElectronBridgeServer | null = null;
let isDisposing = false;
let isDisposed = false;

app.setName("OpenCodexUI");
app.setAppUserModelId("io.opencodexui.app");

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
  const iconPath = resolveWindowIconPath();
  const window = createWindow({
    preloadPath: path.join(__dirname, "preload.cjs"),
    rendererPath: path.join(__dirname, "..", "renderer"),
    devServerUrl,
    iconPath
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
        devServerUrl,
        iconPath
      });
      bridgeServer?.attachWindow(nextWindow);
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    void disposeAndExit(0);
  }
});

app.on("before-quit", (event) => {
  if (isDisposed) {
    return;
  }

  event.preventDefault();
  void disposeAndExit(0);
});

process.once("SIGTERM", () => {
  void disposeAndExit(0);
});

process.once("SIGINT", () => {
  void disposeAndExit(0);
});

void main();

/**
 * Disposes backend resources before the Electron process exits.
 *
 * @param code Process exit code.
 * @returns Promise resolved once resources have been closed.
 */
async function disposeAndExit(code: number): Promise<void> {
  if (isDisposed) {
    app.exit(code);
    return;
  }

  if (isDisposing) {
    return;
  }

  isDisposing = true;

  try {
    await bridgeServer?.dispose();
  } finally {
    isDisposed = true;
    app.exit(code);
  }
}

/**
 * Resolves the explicitly configured project path associated with the current
 * Electron session.
 *
 * @returns Project path from the environment, or `null` when none is provided.
 */
function resolveProjectPath(): string | null {
  return process.env.OPENCODEX_PROJECT_PATH ?? null;
}

/**
 * Resolves the generated PNG icon used for the runtime window when available.
 *
 * @returns Absolute icon path when the generated icon exists, otherwise null.
 */
function resolveWindowIconPath(): string | null {
  const iconFileName = process.platform === "win32" ? "icon.ico" : "icon.png";
  const iconCandidates = [
    path.join(process.resourcesPath, iconFileName),
    path.join(__dirname, "..", "..", "build", iconFileName)
  ];

  for (const iconPath of iconCandidates) {
    if (existsSync(iconPath)) {
      return iconPath;
    }
  }

  return null;
}
