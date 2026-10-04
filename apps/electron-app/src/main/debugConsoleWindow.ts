import type { BrowserWindow } from "electron";
import { registerContextMenu } from "./contextMenu.js";
import type { ContextMenuLanguage } from "./contextMenuLocale.js";

/** Allows only the same-origin blank console surface rendered by the main UI. */
export function configureDebugConsoleWindow(parent: BrowserWindow, language?: ContextMenuLanguage): void {
  parent.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (url !== "about:blank" || frameName !== "opencodex-debug-console") return { action: "deny" };
    return { action: "allow", outlivesOpener: false, overrideBrowserWindowOptions: {
      width: 1040, height: 720, minWidth: 480, minHeight: 320, autoHideMenuBar: true
    } };
  });
  parent.webContents.on("did-create-window", (child) => {
    registerContextMenu(child, language);
    child.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    child.webContents.on("will-navigate", (event) => event.preventDefault());
    child.webContents.on("will-redirect", (event) => event.preventDefault());
  });
}
