/**
 * Creates and configures the main Electron application window.
 */
import path from "node:path";

import { BrowserWindow } from "electron";

import type { ContextMenuLanguage } from "./contextMenuLocale.js";
import { registerContextMenu } from "./contextMenu.js";

type CreateWindowOptions = {
  preloadPath: string;
  rendererPath: string;
  devServerUrl?: string | null;
  iconPath?: string | null;
  contextMenuLanguage?: ContextMenuLanguage;
  windowKind?: "main" | "usage-history";
  rendererQuery?: Record<string, string>;
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
  const windowKind = options.windowKind ?? "main";
  const baseTitle = windowKind === "usage-history"
    ? "OpenCodexUI — Usage history"
    : "OpenCodexUI";
  const title = isDevMode ? `${baseTitle} [dev mode]` : baseTitle;
  const dimensions = windowKind === "usage-history"
    ? { width: 1280, height: 900, minWidth: 960, minHeight: 640 }
    : { width: 1440, height: 960, minWidth: 960, minHeight: 700 };
  const window = new BrowserWindow({
    title,
    ...dimensions,
    icon: options.iconPath ?? undefined,
    webPreferences: {
      contextIsolation: true,
      devTools: true,
      nodeIntegration: false,
      preload: options.preloadPath
    }
  });

  window.on("page-title-updated", (event) => {
    event.preventDefault();
    window.setTitle(title);
  });
  window.setTitle(title);
  registerContextMenu(window, options.contextMenuLanguage);

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

    if (isDevMode) {
      window.webContents.toggleDevTools();
    }
  });

  if (isDevMode) {
    void window.loadURL(buildRendererUrl(devServerUrl, options.rendererQuery));
  } else {
    void window.loadFile(path.join(options.rendererPath, "index.html"), {
      query: options.rendererQuery
    });
  }

  return window;
}

/**
 * Adds renderer query parameters to a Vite development URL.
 *
 * @param devServerUrl Vite development URL.
 * @param query Query parameters identifying the renderer view.
 * @returns URL used to load the renderer.
 */
function buildRendererUrl(
  devServerUrl: string,
  query: Record<string, string> | undefined
): string {
  if (query === undefined) {
    return devServerUrl;
  }

  const url = new URL(devServerUrl);
  Object.entries(query).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}
