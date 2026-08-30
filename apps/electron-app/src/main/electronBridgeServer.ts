/**
 * Hosts the Electron-side bridge between renderer IPC requests and the backend.
 */
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { IpcMainEvent } from "electron";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

import { createOpenCodexSqliteCacheRepository } from "@open-codex-ui/opencodex-cache";
import { OpenCodexBackendRuntime, OpenCodexRequestRouter } from "@open-codex-ui/opencodex-core";
import type {
  OpenCodexEvent,
  OpenCodexRequest,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import { DiscordPresenceService } from "./discordPresenceService.js";
import {
  PerformanceMonitoringService,
  type OpenCodexProcessPerformanceMetric
} from "./performanceMonitoringService.js";
import { DesktopNotificationService } from "./desktopNotificationService.js";
import {
  openProjectFolder,
  openProjectTerminal
} from "./projectSystemActions.js";
import { openExternalLink } from "./externalLinkOpener.js";
import { pickImageFiles } from "./imageAttachmentPicker.js";
import { readRendererPerformanceSample } from "./rendererPerformancePayload.js";

type ElectronBridgeServerOptions = {
  settings: OpenCodexSettings;
  projectPath: string | null;
  appVersion: string;
  userDataPath: string;
  saveSettings(settings: OpenCodexSettings): Promise<void>;
  openUsageHistory(sourceId: string): void;
  onSettingsUpdated(settings: OpenCodexSettings): void;
};

/**
 * Wires Electron IPC to the backend and forwards backend events to the renderer window.
 */
export class ElectronBridgeServer {
  private readonly runtime: OpenCodexBackendRuntime;
  private readonly requestRouter: OpenCodexRequestRouter;
  private readonly discordPresenceService: DiscordPresenceService;
  private readonly performanceMonitoringService: PerformanceMonitoringService;
  private readonly desktopNotificationService: DesktopNotificationService;
  private readonly logger: (message: string) => void;
  private readonly openUsageHistoryWindow: (sourceId: string) => void;
  private readonly onSettingsUpdated: (settings: OpenCodexSettings) => void;
  private window: BrowserWindow | null = null;
  private isDisposed = false;

  /**
   * Creates the bridge server with the current settings and cache repository.
   *
   * @param options Settings, project context, and persistence callbacks used by the backend.
   */
  constructor(options: ElectronBridgeServerOptions) {
    const cacheRepository = createCacheRepository(options.userDataPath);
    const logger = (message: string) => console.log(`[OpenCodexUI] ${message}`);
    this.logger = logger;
    this.openUsageHistoryWindow = options.openUsageHistory;
    this.onSettingsUpdated = options.onSettingsUpdated;

    this.runtime = new OpenCodexBackendRuntime({
      settings: options.settings,
      projectPath: options.projectPath,
      appVersion: options.appVersion,
      cacheRepository,
      userDataPath: options.userDataPath,
      defaultCommitPromptPath: resolveDefaultCommitPromptPath(),
      generationCommitPromptPath: resolveGenerationCommitPromptPath(),
      saveSettings: options.saveSettings,
      openExternalLink: async (href, projectPath, openerCommand) => {
        await openExternalLink(href, projectPath, openerCommand);
      },
      openProjectFolder,
      openProjectTerminal,
      pickProjectDirectory: async (mode) => {
        return this.pickProjectDirectory(mode);
      },
      pickImageFiles: async () => {
        return pickImageFiles(this.window);
      },
      pickExecutableFile: async () => {
        return this.pickExecutableFile();
      },
      ensureProjectDirectory: async (projectPath, createIfMissing) => {
        return ensureProjectDirectory(projectPath, createIfMissing);
      },
      onCodexNotificationReceived: (method, estimatedBytes) => {
        this.performanceMonitoringService?.recordCodexNotification(
          method,
          estimatedBytes
        );
      },
      onCodexNotificationProcessed: (_method, durationMs) => {
        this.performanceMonitoringService?.recordCodexNotificationProcessing(durationMs);
      },
      onLiveCacheNotificationProcessed: (method, durationMs) => {
        this.performanceMonitoringService?.recordLiveCacheNotification(
          method,
          durationMs
        );
      },
      logger,
      emit: (event) => this.emit(event)
    });
    this.requestRouter = new OpenCodexRequestRouter(this.runtime);
    this.performanceMonitoringService = new PerformanceMonitoringService(options.settings, {
      createLog: async (message, details) => {
        await this.runtime.logs.create("warning", message, details);
      },
      readProcessMetrics
    });
    this.discordPresenceService = new DiscordPresenceService(
      options.settings.discordRichPresenceEnabled,
      logger
    );
    this.desktopNotificationService = new DesktopNotificationService({
      settings: options.settings,
      focusWindow: () => this.focusWindow(),
      navigateToThread: (sourceId, threadId) => this.emit({
        type: "app.navigation.requested",
        sourceId,
        threadId
      }),
      resolveApproval: (approvalId, decision) => {
        this.runtime.approvals.resolve(approvalId, decision);
      },
      logger
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
   * Checks whether the backend still has work running before application shutdown.
   *
   * @returns Whether at least one Codex turn is active across all sources.
   */
  hasActiveTurns(): boolean {
    return this.runtime.hasActiveTurns();
  }

  /**
   * Notifies the renderer that application shutdown has been confirmed.
   *
   * @returns Nothing.
   */
  emitShutdownStarted(): void {
    this.emit({ type: "app.shutdown.started" });
  }

  /**
   * Registers the IPC handler used by the renderer to send backend requests.
   *
   * @returns Nothing.
   */
  register(): void {
    ipcMain.on("opencodex:performance-sample", this.handlePerformanceSample);
    ipcMain.handle("opencodex:request", async (_event, request: OpenCodexRequest) => {
      if (request.type === "app.openDevTools") {
        return this.openDeveloperTools();
      }

      if (request.type === "app.openUsageHistory") {
        this.openUsageHistoryWindow(request.sourceId);
        return { ok: true };
      }

      if (request.type === "discord.reconnect") {
        await this.discordPresenceService.reconnect();
        return { ok: true };
      }

      const response = await this.requestRouter.handleRequest(request);

      if (request.type === "settings.update" && response !== undefined) {
        const settings = response as OpenCodexSettings;
        this.discordPresenceService.setEnabled(settings.discordRichPresenceEnabled);
        this.performanceMonitoringService.setSettings(settings);
        this.desktopNotificationService.setSettings(settings);
        this.closeDeveloperToolsWhenDisabled(settings);
        this.onSettingsUpdated(settings);
      }

      return response;
    });
  }

  /**
   * Releases the IPC handler and disposes the backend resources.
   *
   * @returns Promise resolved once cleanup is complete.
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    ipcMain.removeHandler("opencodex:request");
    ipcMain.off("opencodex:performance-sample", this.handlePerformanceSample);
    this.window = null;
    this.desktopNotificationService.dispose();
    this.performanceMonitoringService.dispose();
    const results = await Promise.allSettled([
      this.discordPresenceService.dispose(),
      this.runtime.dispose()
    ]);

    results.forEach((result) => {
      if (result.status === "rejected") {
        this.logger(`cleanup task failed during shutdown: ${String(result.reason)}`);
      }
    });
  }

  /**
   * Forwards a backend event to the attached renderer window when available.
   *
   * @param event Backend event to send to the renderer process.
   * @returns Nothing.
   */
  private emit(event: OpenCodexEvent): void {
    if (this.isDisposed) {
      return;
    }

    this.discordPresenceService.handleEvent(event);
    this.performanceMonitoringService?.recordBackendEvent(event);
    this.desktopNotificationService.handleEvent(event);
    const window = this.window;

    if (window === null || window.isDestroyed() || window.webContents.isDestroyed()) {
      return;
    }

    window.webContents.send("opencodex:event", event);
  }

  /**
   * Restores and focuses the renderer window after a notification interaction.
   */
  private focusWindow(): void {
    const window = this.window;

    if (window === null || window.isDestroyed() || window.webContents.isDestroyed()) {
      return;
    }

    if (window.isMinimized()) {
      window.restore();
    }

    if (!window.isVisible()) {
      window.show();
    }

    window.focus();
  }

  /**
   * Accepts validated aggregate renderer metrics from the attached window.
   *
   * @param event Electron IPC event carrying the sample.
   * @param value Untrusted renderer payload.
   */
  private readonly handlePerformanceSample = (event: IpcMainEvent, value: unknown): void => {
    const window = this.window;

    if (window === null || event.sender.id !== window.webContents.id) {
      return;
    }

    const sample = readRendererPerformanceSample(value);

    if (sample !== null) {
      this.performanceMonitoringService.recordRendererSample(sample);
    }
  };

  /**
   * Opens renderer DevTools when developer mode is explicitly enabled.
   *
   * @returns Confirmation payload.
   */
  private openDeveloperTools(): { ok: true } {
    if (!this.runtime.settings.get().developerMode) {
      throw new Error("Developer mode is disabled.");
    }

    this.window?.webContents.openDevTools({ mode: "detach" });
    return { ok: true };
  }

  /**
   * Closes renderer DevTools when developer mode has been disabled.
   *
   * @param settings Effective settings after an update.
   * @returns Nothing.
   */
  private closeDeveloperToolsWhenDisabled(settings: OpenCodexSettings): void {
    if (settings.developerMode) {
      return;
    }

    this.window?.webContents.closeDevTools();
  }

  /**
   * Opens a native directory picker for project selection.
   *
   * @param mode Picker mode requested by the renderer.
   * @returns Selected directory path, or `null` when cancelled.
   */
  private async pickProjectDirectory(mode: "open" | "create"): Promise<string | null> {
    const properties: Array<"openDirectory" | "createDirectory"> = ["openDirectory"];

    if (mode === "create") {
      properties.push("createDirectory");
    }

    const options = {
      properties,
      title: mode === "create" ? "Create or select project folder" : "Open project folder"
    };
    const result = this.window === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(this.window, options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0] ?? null;
  }

  /**
   * Opens a native executable picker.
   *
   * @returns Selected executable path.
   */
  private async pickExecutableFile(): Promise<string | null> {
    const options = {
      properties: ["openFile"] as Array<"openFile">,
      title: "Select Codex executable"
    };
    const result = this.window === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(this.window, options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0] ?? null;
  }
}

function resolveDefaultCommitPromptPath(): string {
  return resolvePackagedMarkdownPath("prompt-commit.default.md");
}

function resolveGenerationCommitPromptPath(): string {
  return resolvePackagedMarkdownPath("prompt-commit.generation.md");
}

function resolvePackagedMarkdownPath(fileName: string): string {
  const packagedResourcesPath = process.resourcesPath === undefined
    ? null
    : path.join(process.resourcesPath, fileName);

  const candidates = [
    packagedResourcesPath,
    path.resolve(process.cwd(), "..", "..", fileName),
    path.resolve(process.cwd(), fileName)
  ].filter((candidate): candidate is string => candidate !== null);

  return candidates.find((candidate) => fsSync.existsSync(candidate))
    ?? path.resolve(process.cwd(), "..", "..", fileName);
}

/**
 * Creates the optional SQLite cache repository used by the Electron bridge.
 *
 * @param userDataPath Electron user data directory.
 * @returns Cache repository instance, or `null` when SQLite initialization fails.
 */
function createCacheRepository(userDataPath: string) {
  try {
    const cacheDirectory = path.join(userDataPath, "opencodex-cache");
    migrateLegacyCacheDirectory(userDataPath, cacheDirectory);

    return createOpenCodexSqliteCacheRepository({
      directory: cacheDirectory
    });
  } catch (error) {
    console.log(`[OpenCodexUI] SQLite cache unavailable: ${String(error)}`);
    return null;
  }
}

/**
 * Moves the SQLite cache out of the legacy Chromium cache directory when needed.
 *
 * @param userDataPath Electron user data directory.
 * @param cacheDirectory New application cache directory.
 * @returns Nothing.
 */
function migrateLegacyCacheDirectory(userDataPath: string, cacheDirectory: string): void {
  const databaseFileName = "opencodex-cache.sqlite";
  const legacyDirectory = path.join(userDataPath, "cache");
  const legacyDatabasePath = path.join(legacyDirectory, databaseFileName);
  const targetDatabasePath = path.join(cacheDirectory, databaseFileName);

  if (!fsSync.existsSync(legacyDatabasePath) || fsSync.existsSync(targetDatabasePath)) {
    return;
  }

  fsSync.mkdirSync(cacheDirectory, { recursive: true });
  moveLegacyCacheFile(legacyDatabasePath, targetDatabasePath);
  moveLegacyCacheFile(`${legacyDatabasePath}-wal`, `${targetDatabasePath}-wal`);
  moveLegacyCacheFile(`${legacyDatabasePath}-shm`, `${targetDatabasePath}-shm`);
}

/**
 * Moves one legacy cache file when it exists.
 *
 * @param sourcePath Source file path.
 * @param targetPath Target file path.
 * @returns Nothing.
 */
function moveLegacyCacheFile(sourcePath: string, targetPath: string): void {
  if (!fsSync.existsSync(sourcePath) || fsSync.existsSync(targetPath)) {
    return;
  }

  fsSync.renameSync(sourcePath, targetPath);
}

/**
 * Ensures a project path exists and points to a directory.
 *
 * @param projectPath User-provided project path.
 * @param createIfMissing Whether missing folders should be created.
 * @returns Absolute project directory path.
 */
async function ensureProjectDirectory(projectPath: string, createIfMissing: boolean): Promise<string> {
  const trimmedPath = projectPath.trim();

  if (trimmedPath.length === 0) {
    throw new Error("Project path is required.");
  }

  const resolvedPath = path.resolve(trimmedPath);

  try {
    const stats = await fs.stat(resolvedPath);

    if (!stats.isDirectory()) {
      throw new Error(`Project path is not a directory: ${resolvedPath}`);
    }

    return resolvedPath;
  } catch (error) {
    if (isMissingPathError(error) && createIfMissing) {
      await fs.mkdir(resolvedPath, { recursive: true });
      return resolvedPath;
    }

    throw error;
  }
}

/**
 * Checks whether a filesystem error reports a missing path.
 *
 * @param error Error value to inspect.
 * @returns `true` when the path is missing.
 */
function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Reads process metrics at a low frequency for diagnostic snapshots.
 *
 * @returns Content-free CPU and working-set metrics by Electron process type.
 */
function readProcessMetrics(): OpenCodexProcessPerformanceMetric[] {
  return app.getAppMetrics().map((metric) => ({
    type: metric.type,
    cpuPercent: metric.cpu.percentCPUUsage,
    workingSetSizeKb: metric.memory.workingSetSize
  }));
}
