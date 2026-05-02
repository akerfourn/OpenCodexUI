import { BrowserWindow, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createOpenCodexSqliteCacheRepository } from "@open-codex-ui/opencodex-cache";
import { OpenCodexBackend } from "@open-codex-ui/opencodex-core";
import type { OpenCodexEvent, OpenCodexRequest, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";

type ElectronBridgeServerOptions = {
  settings: OpenCodexSettings;
  projectPath: string | null;
  userDataPath: string;
  saveSettings(settings: OpenCodexSettings): Promise<void>;
};

export class ElectronBridgeServer {
  private readonly backend: OpenCodexBackend;
  private window: BrowserWindow | null = null;

  constructor(options: ElectronBridgeServerOptions) {
    const cacheRepository = createCacheRepository(options.userDataPath);

    this.backend = new OpenCodexBackend({
      settings: options.settings,
      projectPath: options.projectPath,
      cacheRepository,
      saveSettings: options.saveSettings,
      openExternalLink: async (href) => {
        await openExternalLink(href, options.projectPath);
      },
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

function createCacheRepository(userDataPath: string) {
  try {
    return createOpenCodexSqliteCacheRepository({
      directory: path.join(userDataPath, "cache")
    });
  } catch (error) {
    console.log(`[OpenCodexUI] SQLite cache unavailable: ${String(error)}`);
    return null;
  }
}

async function openExternalLink(href: string, projectPath: string | null): Promise<void> {
  const target = href.trim();

  if (target.length === 0) {
    return;
  }

  const resolved = resolveOpenTarget(target, projectPath);

  if (resolved.type === "url") {
    await shell.openExternal(resolved.value);
    return;
  }

  const error = await shell.openPath(resolved.value);

  if (error.length > 0) {
    shell.showItemInFolder(resolved.value);
  }
}

function resolveOpenTarget(
  href: string,
  projectPath: string | null
): { type: "url"; value: string } | { type: "path"; value: string } {
  try {
    const url = new URL(href);

    if (url.protocol === "file:") {
      return { type: "path", value: stripLocationSuffix(fileURLToPath(url)) };
    }

    return { type: "url", value: href };
  } catch {
    const cleanedPath = stripLocationSuffix(href);

    if (path.isAbsolute(cleanedPath)) {
      return { type: "path", value: cleanedPath };
    }

    if (projectPath !== null) {
      return { type: "path", value: path.resolve(projectPath, cleanedPath) };
    }

    return { type: "path", value: path.resolve(process.cwd(), cleanedPath) };
  }
}

function stripLocationSuffix(value: string): string {
  return value
    .replace(/#L\d+(?:-L\d+)?$/i, "")
    .replace(/:(\d+)(?::(\d+))?$/, "");
}
