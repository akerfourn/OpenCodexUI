import { BrowserWindow, ipcMain } from "electron";

import { OpenCodexBackend } from "@open-codex-ui/opencodex-core";
import type { OpenCodexEvent, OpenCodexRequest, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";

type ElectronBridgeServerOptions = {
  settings: OpenCodexSettings;
  projectPath: string | null;
  saveSettings(settings: OpenCodexSettings): Promise<void>;
};

export class ElectronBridgeServer {
  private readonly backend: OpenCodexBackend;
  private window: BrowserWindow | null = null;

  constructor(options: ElectronBridgeServerOptions) {
    this.backend = new OpenCodexBackend({
      settings: options.settings,
      projectPath: options.projectPath,
      saveSettings: options.saveSettings,
      logger: (message) => console.log(`[OpenCodexUI] ${message}`),
      emit: (event) => this.emit(event)
    });
  }

  attachWindow(window: BrowserWindow): void {
    this.window = window;
  }

  register(): void {
    ipcMain.handle("opencodex:request", async (_event, request: OpenCodexRequest) => {
      return this.backend.handleRequest(request);
    });
  }

  async dispose(): Promise<void> {
    ipcMain.removeHandler("opencodex:request");
    await this.backend.dispose();
  }

  private emit(event: OpenCodexEvent): void {
    this.window?.webContents.send("opencodex:event", event);
  }
}
