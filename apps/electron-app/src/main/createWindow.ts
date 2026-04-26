import path from "node:path";

import { BrowserWindow } from "electron";

type CreateWindowOptions = {
  preloadPath: string;
  rendererPath: string;
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

  void window.loadFile(path.join(options.rendererPath, "index.html"));
  window.webContents.openDevTools({ mode: "detach" });

  return window;
}
