/**
 * Creates and configures the main Electron application window.
 */
import path from "node:path";

import { BrowserWindow } from "electron";

type CreateWindowOptions = {
  preloadPath: string;
  rendererPath: string;
  devServerUrl?: string | null;
};

/**
 * Creates the desktop window and loads either the dev server or the built renderer.
 *
 * @param options Preload script path, renderer assets path, and optional dev server URL.
 * @returns Configured Electron browser window instance.
 */
export function createWindow(options: CreateWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    title: "OpenCodexUI",
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 700,
    webPreferences: {
      contextIsolation: true,
      devTools: options.devServerUrl !== undefined && options.devServerUrl !== null,
      nodeIntegration: false,
      preload: options.preloadPath
    }
  });

  if (options.devServerUrl !== undefined && options.devServerUrl !== null) {
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

  if (options.devServerUrl !== undefined && options.devServerUrl !== null) {
    void window.loadURL(options.devServerUrl);
  } else {
    void window.loadFile(path.join(options.rendererPath, "index.html"));
  }

  return window;
}
