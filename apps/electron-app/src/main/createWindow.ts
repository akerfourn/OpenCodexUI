import path from "node:path";

import { BrowserWindow } from "electron";

type CreateWindowOptions = {
  preloadPath: string;
  rendererPath: string;
  devServerUrl?: string | null;
};

export function createWindow(options: CreateWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: options.preloadPath
    }
  });

  if (options.devServerUrl !== undefined && options.devServerUrl !== null) {
    void window.loadURL(options.devServerUrl);
    window.webContents.once("did-finish-load", () => {
      window.webContents.openDevTools({ mode: "detach" });
    });
  } else {
    void window.loadFile(path.join(options.rendererPath, "index.html"));
  }

  return window;
}
