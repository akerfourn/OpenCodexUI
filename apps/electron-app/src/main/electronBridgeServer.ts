/**
 * Hosts the Electron-side bridge between renderer IPC requests and the backend.
 */
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

/**
 * Wires Electron IPC to the backend and forwards backend events to the renderer window.
 */
export class ElectronBridgeServer {
  private readonly backend: OpenCodexBackend;
  private window: BrowserWindow | null = null;

  /**
   * Creates the bridge server with the current settings and cache repository.
   *
   * @param options Settings, project context, and persistence callbacks used by the backend.
   */
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

  /**
   * Registers the browser window that should receive backend events.
   *
   * @param window Renderer window connected to the OpenCodexUI session.
   */
  attachWindow(window: BrowserWindow): void {
    this.window = window;
  }

  /**
   * Registers the IPC handler used by the renderer to send backend requests.
   *
   * @returns Nothing.
   */
  register(): void {
    ipcMain.handle("opencodex:request", async (_event, request: OpenCodexRequest) => {
      return this.backend.handleRequest(request);
    });
  }

  /**
   * Releases the IPC handler and disposes the backend resources.
   *
   * @returns Promise resolved once cleanup is complete.
   */
  async dispose(): Promise<void> {
    ipcMain.removeHandler("opencodex:request");
    await this.backend.dispose();
  }

  /**
   * Forwards a backend event to the attached renderer window when available.
   *
   * @param event Backend event to send to the renderer process.
   * @returns Nothing.
   */
  private emit(event: OpenCodexEvent): void {
    this.window?.webContents.send("opencodex:event", event);
  }
}

/**
 * Creates the optional SQLite cache repository used by the Electron bridge.
 *
 * @param userDataPath Electron user data directory.
 * @returns Cache repository instance, or `null` when SQLite initialization fails.
 */
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

/**
 * Opens an external URL or a local file path from the renderer.
 *
 * @param href Link value requested by the user interface.
 * @param projectPath Current project path used to resolve relative file links.
 * @returns Promise resolved once Electron has handled the request.
 */
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

/**
 * Resolves a link into either a URL target or a filesystem path target.
 *
 * @param href Link value emitted by the UI.
 * @param projectPath Current project path used as the base for relative paths.
 * @returns Normalized target description that can be opened by Electron.
 */
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

/**
 * Removes editor location suffixes from a path-like value.
 *
 * @param value File path or URL-derived path that may include line or column hints.
 * @returns Clean filesystem path without location metadata.
 */
function stripLocationSuffix(value: string): string {
  return value
    .replace(/#L\d+(?:-L\d+)?$/i, "")
    .replace(/:(\d+)(?::(\d+))?$/, "");
}
