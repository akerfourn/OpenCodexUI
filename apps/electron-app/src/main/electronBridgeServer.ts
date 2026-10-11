import { resolveDebugAdapterPath } from "./debugAdapterPath.js";
import { isDebugActive } from "@open-codex-ui/opencodex-protocol";
import { DictationHostService } from "./dictation/DictationHostService.js";
/**
 * Hosts the Electron-side bridge between renderer IPC requests and the backend.
 */
import { app, BrowserWindow, ipcMain } from "electron";
import { createNativeAppUpdater } from "./asyncDebUpdater.js";
import type { IpcMainEvent } from "electron";
import path from "node:path";

import { OpenCodexBackendRuntime, OpenCodexRequestRouter } from "@open-codex-ui/opencodex-core";
import type {
  OpenCodexApplicationCloseRequest,
  OpenCodexEvent,
  OpenCodexRequest,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import { DiscordPresenceService } from "./discordPresenceService.js";
import { EmojiCatalogStore } from "./emojiCatalogStore.js";
import { AppUpdateService } from "./appUpdateService.js";
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
import { pickAttachmentFiles } from "./fileAttachmentPicker.js";
import { pickExecutableFile, pickProjectDirectory } from "./projectDialogPickers.js";
import { readRendererActivityState } from "./rendererActivityPayload.js";
import { readRendererPerformanceSample } from "./rendererPerformancePayload.js";
import { createCacheRepository } from "./electronCacheRepository.js";
import { resolveCommitPromptPath } from "./commitPromptPaths.js";
import { ensureProjectDirectory } from "./projectDirectory.js";
import { ElectronNativeRequestHandler } from "./ElectronNativeRequestHandler.js";

type ElectronBridgeServerOptions = {
  settings: OpenCodexSettings;
  projectPath: string | null;
  appVersion: string;
  userDataPath: string;
  saveSettings(settings: OpenCodexSettings): Promise<void>;
  openUsageHistory(sourceId: string): void;
  onSettingsUpdated(settings: OpenCodexSettings): void;
  onApplicationCloseResponse(shouldClose: boolean): void;
  onApplicationUpdateInstallStateChanged(installing: boolean): void;
};

/**
 * Wires Electron IPC to the backend and forwards backend events to the renderer window.
 */
export class ElectronBridgeServer {
  private readonly runtime: OpenCodexBackendRuntime;
  /** Routes microphone recordings without adding them to the core request log. */
  private readonly dictation: DictationHostService;
  private readonly requestRouter: OpenCodexRequestRouter;
  /** Dispatches native IPC requests while preserving the backend fallback. */
  private readonly nativeRequestHandler: ElectronNativeRequestHandler;
  private readonly discordPresenceService: DiscordPresenceService;
  private readonly performanceMonitoringService: PerformanceMonitoringService;
  private readonly desktopNotificationService: DesktopNotificationService;
  private readonly emojiCatalogStore: EmojiCatalogStore;
  private readonly appUpdateService: AppUpdateService;
  private readonly logger: (message: string) => void;
  private readonly openUsageHistoryWindow: (sourceId: string) => void;
  private readonly onSettingsUpdated: (settings: OpenCodexSettings) => void;
  private readonly onApplicationCloseResponse: (shouldClose: boolean) => void;
  private window: BrowserWindow | null = null;
  private pendingProjectActivity = false;
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
    this.emojiCatalogStore = new EmojiCatalogStore(options.userDataPath);
    this.openUsageHistoryWindow = options.openUsageHistory;
    this.onSettingsUpdated = options.onSettingsUpdated;
    this.onApplicationCloseResponse = options.onApplicationCloseResponse;
    this.appUpdateService = new AppUpdateService({
      currentVersion: options.appVersion,
      isPackaged: isAutomaticUpdateSupported(),
      allowPrerelease: options.settings.allowPrereleaseUpdates === true,
      emit: (state) => this.emit({ type: "app.update.state", state }),
      log: (level, message) => logger(`[updater:${level}] ${message}`),
      onInstallStateChanged: options.onApplicationUpdateInstallStateChanged
    }, isAutomaticUpdateSupported() ? createNativeAppUpdater() : undefined);

    this.runtime = new OpenCodexBackendRuntime({
      debugAdapter: {
        executable: process.execPath,
        electron: true,
        entrypoint: resolveDebugAdapterPath(app.isPackaged, process.resourcesPath, app.getAppPath(), process.cwd())
      },
      settings: options.settings,
      projectPath: options.projectPath,
      appVersion: options.appVersion,
      cacheRepository,
      userDataPath: options.userDataPath,
      defaultCommitPromptPath: resolveCommitPromptPath(
        "prompt-commit.default.md", process.resourcesPath, process.cwd()
      ),
      generationCommitPromptPath: resolveCommitPromptPath(
        "prompt-commit.generation.md", process.resourcesPath, process.cwd()
      ),
      saveSettings: options.saveSettings,
      openExternalLink: async (href, projectPath, openerCommand, folders) => {
        await openExternalLink(href, projectPath, openerCommand, folders);
      },
      openProjectFolder,
      openProjectTerminal,
      pickProjectDirectory: async (mode) => {
        return pickProjectDirectory(this.window, mode);
      },
      pickAttachmentFiles: async () => {
        return pickAttachmentFiles(this.window);
      },
      pickExecutableFile: async () => {
        return pickExecutableFile(this.window);
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
    this.dictation = new DictationHostService(
      options.userDataPath, path.join(__dirname, "dictation.worker.mjs"),
      () => this.runtime.settings.get(), this.runtime.dictation,
      (state) => this.emit({ type: "dictation.models.state", state })
    );
    this.performanceMonitoringService = new PerformanceMonitoringService(options.settings, {
      createLog: async (message, details) => {
        await this.runtime.logs.create("warning", message, details, "performanceSlowdown");
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
    this.nativeRequestHandler = new ElectronNativeRequestHandler({
      dictation: this.dictation,
      emojiCatalog: this.emojiCatalogStore,
      appUpdates: this.appUpdateService,
      discordPresence: this.discordPresenceService,
      getMainWebContentsId: () => this.window?.webContents.id,
      openDeveloperTools: () => this.openDeveloperTools(),
      openUsageHistory: (sourceId) => this.openUsageHistoryWindow(sourceId),
      handleBackendRequest: (request) => this.handleBackendRequest(request)
    });
  }

  /**
   * Registers the browser window that should receive backend events.
   *
   * @param window Renderer window connected to the OpenCodexUI session.
   */
  attachWindow(window: BrowserWindow): void {
    this.window = window;
    window.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
      if (!isMainFrame || isInPlace) return;
      void this.dictation.local.dispose();
      void this.runtime.dictation.dispose();
    });
    window.webContents.on("render-process-gone", () => {
      void this.dictation.local.dispose();
      void this.runtime.dictation.dispose();
    });
    window.on("closed", () => {
      void this.dictation.local.dispose();
      void this.runtime.dictation.dispose();
    });
    this.emit({ type: "app.update.state", state: this.appUpdateService.getState() });
  }

  /** Starts the delayed update check after the main renderer has been attached. */
  startApplicationUpdates(): void {
    this.appUpdateService.start();
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
   * Checks whether the renderer reports pending activity in any project tool panel.
   *
   * @returns Whether at least one project has pending tool activity.
   */
  hasPendingProjectActivity(): boolean {
    return this.pendingProjectActivity || isDebugActive(this.runtime.debug.snapshot().session);
  }

  /**
   * Asks the main renderer to confirm application shutdown.
   *
   * @param request Activity summary to display in the renderer dialog.
   * @returns Whether the request was sent to a live renderer window.
   */
  emitApplicationCloseRequested(request: OpenCodexApplicationCloseRequest): boolean {
    const window = this.window;

    if (window === null || window.isDestroyed() || window.webContents.isDestroyed()) {
      return false;
    }

    window.webContents.send("opencodex:application-close-requested", request);
    return true;
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
    ipcMain.on("opencodex:application-activity", this.handleApplicationActivity);
    ipcMain.on("opencodex:application-close-response", this.handleApplicationCloseResponse);
    ipcMain.handle("opencodex:request", async (_event, request: OpenCodexRequest) => {
      return this.nativeRequestHandler.handle(request, _event.sender.id);
    });
  }

  /** Routes backend requests and applies successful settings updates to host services. */
  private async handleBackendRequest(request: OpenCodexRequest): Promise<unknown> {
    const response = await this.requestRouter.handleRequest(request);

    if (request.type === "settings.update" && response !== undefined) {
      const settings = response as OpenCodexSettings;
      this.discordPresenceService.setEnabled(settings.discordRichPresenceEnabled);
      this.performanceMonitoringService.setSettings(settings);
      this.desktopNotificationService.setSettings(settings);
      this.appUpdateService.setAllowPrerelease(settings.allowPrereleaseUpdates === true);
      this.closeDeveloperToolsWhenDisabled(settings);
      this.onSettingsUpdated(settings);
    }

    return response;
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
    ipcMain.off("opencodex:application-activity", this.handleApplicationActivity);
    ipcMain.off("opencodex:application-close-response", this.handleApplicationCloseResponse);
    this.window = null;
    this.appUpdateService.dispose();
    this.desktopNotificationService.dispose();
    this.performanceMonitoringService.dispose();
    const results = await Promise.allSettled([
      this.dictation.local.dispose(),
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
   * Accepts the renderer's content-free application activity state.
   *
   * @param event Electron IPC event carrying the state.
   * @param value Untrusted renderer payload.
   */
  private readonly handleApplicationActivity = (
    event: IpcMainEvent,
    value: unknown
  ): void => {
    const window = this.window;

    if (window === null || event.sender.id !== window.webContents.id) {
      return;
    }

    const state = readRendererActivityState(value);

    if (state !== null) {
      this.pendingProjectActivity = state.hasPendingProjectActivity;
    }
  };

  /**
   * Accepts a validated renderer answer to an application-close request.
   *
   * @param event Electron IPC event carrying the response.
   * @param value Untrusted renderer payload.
   */
  private readonly handleApplicationCloseResponse = (
    event: IpcMainEvent,
    value: unknown
  ): void => {
    const window = this.window;

    if (window === null || event.sender.id !== window.webContents.id) {
      return;
    }

    if (typeof value === "boolean") {
      this.onApplicationCloseResponse(value);
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
}

/** Returns whether this packaged process has a supported auto-update path. */
function isAutomaticUpdateSupported(): boolean {
  if (!app.isPackaged) {
    return false;
  }

  if (process.platform !== "win32") {
    return true;
  }

  return process.env.PORTABLE_EXECUTABLE_FILE === undefined &&
    process.env.PORTABLE_EXECUTABLE_DIR === undefined;
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
