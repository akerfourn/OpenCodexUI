/**
 * Creates and configures the main Electron application window.
 */
import path from "node:path";

import { BrowserWindow } from "electron";

type CreateWindowOptions = {
  preloadPath: string;
  rendererPath: string;
  devServerUrl?: string | null;
  iconPath?: string | null;
};

/**
 * Creates the desktop window and loads either the dev server or the built renderer.
 *
 * @param options Preload script path, renderer assets path, and optional dev server URL.
 * @returns Configured Electron browser window instance.
 */
export function createWindow(options: CreateWindowOptions): BrowserWindow {
  const devServerUrl = options.devServerUrl ?? null;
  const isDevMode = devServerUrl !== null;
  const title = isDevMode ? "OpenCodexUI [dev mode]" : "OpenCodexUI";
  const window = new BrowserWindow({
    title,
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 700,
    icon: options.iconPath ?? undefined,
    webPreferences: {
      contextIsolation: true,
      devTools: isDevMode,
      nodeIntegration: false,
      preload: options.preloadPath
    }
  });

  window.on("page-title-updated", (event) => {
    event.preventDefault();
    window.setTitle(title);
  });
  window.setTitle(title);

  if (isDevMode) {
    window.webContents.on("before-input-event", (event, input) => {
      const isDevToolsShortcut = input.key === "F12" || (
        input.control &&
        input.shift &&
        input.key.toLowerCase() === "i"
      );

      if (!isDevToolsShortcut) {
        return;
      }

      event.preventDefault();
      window.webContents.toggleDevTools();
    });
  }

  if (isDevMode) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(options.rendererPath, "index.html"));
  }

  return window;
}
