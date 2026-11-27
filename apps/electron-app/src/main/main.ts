/**
 * Boots the Electron main process and connects the application window to the backend bridge.
 */
import path from "node:path";
import { existsSync } from "node:fs";

import { app, autoUpdater, BrowserWindow, dialog, Menu } from "electron";

import type {
  OpenCodexApplicationCloseRequest,
  OpenCodexLanguage
} from "@open-codex-ui/opencodex-protocol";

import { createWindow } from "./createWindow.js";
import { buildAppCloseConfirmationOptions } from "./appCloseConfirmation.js";
import {
  resolveContextMenuLanguage,
  type ContextMenuLanguage
} from "./contextMenuLocale.js";
import { setContextMenuLanguage } from "./contextMenu.js";
import { ElectronBridgeServer } from "./electronBridgeServer.js";
import { RustDaemonProcess } from "./RustDaemonProcess.js";
import { SettingsStore } from "./settingsStore.js";

let bridgeServer: ElectronBridgeServer | null = null;
let rustDaemon: RustDaemonProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let usageHistoryWindow: BrowserWindow | null = null;
let contextMenuLanguage: ContextMenuLanguage = "fr";
let isDisposing = false;
let isDisposed = false;
let isCloseConfirmationOpen = false;
let isApplicationUpdateInstallInProgress = false;
/** Only the native updater may close the application during installation. */
let isApplicationUpdateRestartReady = false;

const SHUTDOWN_RENDER_DELAY_MS = 100;
const SHUTDOWN_CLEANUP_TIMEOUT_MS = 5_000;

app.setName("OpenCodexUI");
app.setAppUserModelId("io.opencodexui.app");

/**
 * Starts the Electron application once the runtime is ready.
 *
 * @returns Promise resolved after the main window and bridge are initialized.
 */
async function main(): Promise<void> {
  await app.whenReady();
  if (process.argv.includes("--check-rust-daemon")) {
    await checkRustDaemon();
    app.exit(0);
    return;
  }

  Menu.setApplicationMenu(null);

  const settingsStore = new SettingsStore(app.getPath("userData"));
  const settings = await settingsStore.load();
  const projectPath = resolveProjectPath();
  const userDataPath = app.getPath("userData");
  const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? null;
  const iconPath = resolveWindowIconPath();
  contextMenuLanguage = resolveContextMenuLanguage(settings.language, app.getLocale());
  const window = createWindow({
    preloadPath: path.join(__dirname, "preload.cjs"),
    rendererPath: path.join(__dirname, "..", "renderer"),
    devServerUrl,
    iconPath,
    contextMenuLanguage
  });
  attachMainWindow(window);

  const rustCodexDaemonPath = resolveRustCodexDaemonPath();
  bridgeServer = new ElectronBridgeServer({
    settings,
    projectPath,
    appVersion: app.getVersion(),
    userDataPath,
    rustCodexDaemonPath,
    saveSettings: (nextSettings) => settingsStore.save(nextSettings),
    onSettingsUpdated: (nextSettings) => {
      applyContextMenuLanguage(nextSettings.language);
    },
    onApplicationCloseResponse: handleApplicationCloseResponse,
    onApplicationUpdateInstallStateChanged: (installing) => {
      isApplicationUpdateInstallInProgress = installing;
      isApplicationUpdateRestartReady = false;
    },
    prepareApplicationUpdateInstall: stopRustDaemon,
    openUsageHistory: (sourceId) => {
      openUsageHistoryWindow({
        sourceId,
        preloadPath: path.join(__dirname, "preload.cjs"),
        rendererPath: path.join(__dirname, "..", "renderer"),
        devServerUrl,
        iconPath
      });
    }
  });
  bridgeServer.attachWindow(window);
  bridgeServer.register();
  bridgeServer.startApplicationUpdates();
  if (rustCodexDaemonPath === undefined) {
    rustDaemon = launchRustDaemon();
    void rustDaemon.waitUntilReady().catch(handleRustDaemonStartupError);
  }

  app.on("activate", () => {
    if (mainWindow === null || mainWindow.isDestroyed()) {
      const nextWindow = createWindow({
        preloadPath: path.join(__dirname, "preload.cjs"),
        rendererPath: path.join(__dirname, "..", "renderer"),
        devServerUrl,
        iconPath,
        contextMenuLanguage
      });
      attachMainWindow(nextWindow);
      bridgeServer?.attachWindow(nextWindow);
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    void disposeAndExit(0);
  }
});

autoUpdater.on("before-quit-for-update", () => {
  isApplicationUpdateRestartReady = true;
});

app.on("before-quit", (event) => {
  if (isApplicationUpdateInstallInProgress && !isApplicationUpdateRestartReady) {
    event.preventDefault();
    return;
  }
  if (isDisposed || isDisposing || isApplicationUpdateRestartReady) {
    return;
  }

  event.preventDefault();
  requestApplicationClose(mainWindow);
});

process.once("SIGTERM", () => {
  void disposeAndExit(0);
});

process.once("SIGINT", () => {
  void disposeAndExit(0);
});

void main().catch((error: unknown) => {
  console.error(`[OpenCodexUI] startup failed: ${String(error)}`);
  void disposeAndExit(1);
});

/** Starts the companion from the development build or the installed resource directory. */
function launchRustDaemon(): RustDaemonProcess {
  return new RustDaemonProcess(resolveRustDaemonPath());
}

/** Selects the development relay at startup before the source pool can open Codex. */
function resolveRustCodexDaemonPath(): string | undefined {
  if (app.isPackaged || process.env.OPENCODEX_RUST_CODEX_TRANSPORT !== "1") {
    return undefined;
  }
  return resolveRustDaemonPath();
}

/** Resolves the daemon executable for either desktop launch mode. */
function resolveRustDaemonPath(): string {
  const resources = app.isPackaged
    ? path.join(process.resourcesPath, "daemon")
    : path.join(__dirname, "..", "..", "build", "daemon", "dev");
  const filename = process.platform === "win32" ? "opencodex-daemon.exe" : "opencodex-daemon";
  return path.join(resources, filename);
}

/** Exercises the installed companion through the same launcher, with no user profile loaded. */
async function checkRustDaemon(): Promise<void> {
  const daemon = launchRustDaemon();
  rustDaemon = daemon;
  await daemon.waitUntilReady();
  const exit = await daemon.dispose();
  rustDaemon = null;
  if (exit.code !== 0) {
    throw new Error(`Rust daemon did not stop cleanly (code ${exit.code}, signal ${exit.signal}).`, {
      cause: exit.error
    });
  }

  console.info("[OpenCodexUI] Rust daemon IPC and shutdown verified");
}

/** Reports a failed startup while keeping the desktop backend available. */
async function handleRustDaemonStartupError(error: unknown): Promise<void> {
  console.error(`[OpenCodexUI] Rust daemon startup failed: ${String(error)}`);
  try {
    await stopRustDaemon();
  } catch (cleanupError) {
    console.error(`[OpenCodexUI] Rust daemon cleanup failed: ${String(cleanupError)}`);
  }
}

/** Releases the companion before application exit or replacement of its executable. */
async function stopRustDaemon(): Promise<void> {
  const daemon = rustDaemon;
  if (daemon === null) return;

  const exit = await daemon.dispose();
  if (rustDaemon !== daemon) return;

  rustDaemon = null;
  if (exit.code !== 0) {
    console.error(`[OpenCodexUI] Rust daemon stopped with code ${exit.code}, signal ${exit.signal}`, exit.error);
  }
}

/**
 * Disposes backend resources before the Electron process exits.
 *
 * @param code Process exit code.
 * @returns Promise resolved once resources have been closed.
 */
async function disposeAndExit(code: number): Promise<void> {
  if (isDisposed) {
    app.exit(code);
    return;
  }

  if (isDisposing) {
    return;
  }

  isDisposing = true;

  try {
    let cleanupTimedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const cleanupTimeout = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        cleanupTimedOut = true;
        resolve();
      }, SHUTDOWN_CLEANUP_TIMEOUT_MS);
    });

    try {
      const results = await Promise.race([
        Promise.allSettled([bridgeServer?.dispose(), stopRustDaemon()]),
        cleanupTimeout
      ]);
      for (const result of results ?? []) {
        if (result.status === "rejected") {
          console.error(`[OpenCodexUI] cleanup failed during shutdown: ${String(result.reason)}`);
        }
      }
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }

    if (cleanupTimedOut) {
      console.error(
        `[OpenCodexUI] cleanup exceeded ${SHUTDOWN_CLEANUP_TIMEOUT_MS}ms; forcing exit`
      );
    }
  } catch (error) {
    console.error(`[OpenCodexUI] cleanup failed during shutdown: ${String(error)}`);
  } finally {
    isDisposed = true;
    app.exit(code);
  }
}

/**
 * Attaches lifecycle handlers to the main application window.
 *
 * @param window Main application window.
 * @returns Nothing.
 */
function attachMainWindow(window: BrowserWindow): void {
  mainWindow = window;
  window.on("close", (event) => {
    if (isApplicationUpdateInstallInProgress && !isApplicationUpdateRestartReady) {
      event.preventDefault();
      return;
    }
    if (isDisposed || isDisposing || isApplicationUpdateRestartReady) {
      return;
    }

    event.preventDefault();
    requestApplicationClose(window);
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
}

/**
 * Starts one guarded, localized application-close confirmation.
 *
 * @param window Window used as the native dialog parent, when available.
 * @returns Nothing.
 */
function requestApplicationClose(window: BrowserWindow | null): void {
  if (isDisposed || isDisposing || isCloseConfirmationOpen) {
    return;
  }

  if (window === null || window.isDestroyed()) {
    void disposeAndExit(0);
    return;
  }

  isCloseConfirmationOpen = true;
  const hasActiveTurns = bridgeServer?.hasActiveTurns() ?? false;
  const hasPendingProjectActivity = bridgeServer?.hasPendingProjectActivity() ?? false;
  const closeRequest: OpenCodexApplicationCloseRequest = {
    hasActiveTurns,
    hasPendingProjectActivity
  };

  if (bridgeServer?.emitApplicationCloseRequested(closeRequest) === true) {
    return;
  }

  showNativeCloseConfirmation(window, hasActiveTurns, hasPendingProjectActivity);
}

/** Handles the renderer's answer to the custom close confirmation dialog. */
function handleApplicationCloseResponse(shouldClose: boolean): void {
  if (!isCloseConfirmationOpen) {
    return;
  }

  if (!shouldClose) {
    isCloseConfirmationOpen = false;
    return;
  }

  void completeApplicationClose()
    .catch((error: unknown) => {
      console.error(`[OpenCodexUI] close confirmation failed: ${String(error)}`);
    })
    .finally(() => {
      isCloseConfirmationOpen = false;
    });
}

/** Shows the native dialog used only when the renderer cannot answer. */
function showNativeCloseConfirmation(
  window: BrowserWindow,
  hasActiveTurns: boolean,
  hasPendingProjectActivity: boolean
): void {
  const options = buildAppCloseConfirmationOptions(
    contextMenuLanguage,
    hasActiveTurns,
    hasPendingProjectActivity
  );

  void dialog.showMessageBox(window, options)
    .then(async (result) => {
      if (result.response === 0) {
        await completeApplicationClose();
      }
    })
    .catch((error: unknown) => {
      console.error(`[OpenCodexUI] close confirmation failed: ${String(error)}`);
    })
    .finally(() => {
      isCloseConfirmationOpen = false;
    });
}

/** Starts the common renderer shutdown transition after confirmation. */
async function completeApplicationClose(): Promise<void> {
  bridgeServer?.emitShutdownStarted();
  await waitForShutdownRender();
  await disposeAndExit(0);
}

/**
 * Gives the renderer one paint opportunity for the shutdown state.
 *
 * @returns Promise resolved after the short render grace period.
 */
function waitForShutdownRender(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, SHUTDOWN_RENDER_DELAY_MS);
  });
}

/**
 * Resolves the explicitly configured project path associated with the current
 * Electron session.
 *
 * @returns Project path from the environment, or `null` when none is provided.
 */
function resolveProjectPath(): string | null {
  return process.env.OPENCODEX_PROJECT_PATH ?? null;
}

/**
 * Opens or focuses the dedicated usage history window.
 *
 * @param options Renderer paths and source selected by the user.
 * @returns Nothing.
 */
function openUsageHistoryWindow(options: {
  sourceId: string;
  preloadPath: string;
  rendererPath: string;
  devServerUrl: string | null;
  iconPath: string | null;
}): void {
  if (usageHistoryWindow !== null && !usageHistoryWindow.isDestroyed()) {
    if (usageHistoryWindow.isMinimized()) {
      usageHistoryWindow.restore();
    }
    usageHistoryWindow.show();
    usageHistoryWindow.focus();
    return;
  }

  const window = createWindow({
    preloadPath: options.preloadPath,
    rendererPath: options.rendererPath,
    devServerUrl: options.devServerUrl,
    iconPath: options.iconPath,
    contextMenuLanguage,
    windowKind: "usage-history",
    rendererQuery: {
      view: "usage-history",
      sourceId: options.sourceId
    }
  });
  usageHistoryWindow = window;
  window.on("closed", () => {
    if (usageHistoryWindow === window) {
      usageHistoryWindow = null;
    }
  });
}

/**
 * Applies a changed application language to all currently open windows.
 *
 * @param language Persisted OpenCodexUI language setting.
 * @returns Nothing.
 */
function applyContextMenuLanguage(language: OpenCodexLanguage): void {
  contextMenuLanguage = resolveContextMenuLanguage(language, app.getLocale());
  updateWindowContextMenuLanguage(mainWindow);
  updateWindowContextMenuLanguage(usageHistoryWindow);
}

/**
 * Updates one window when it has a registered native context menu.
 *
 * @param window Window to update, or null when it is closed.
 * @returns Nothing.
 */
function updateWindowContextMenuLanguage(window: BrowserWindow | null): void {
  if (window === null || window.isDestroyed()) {
    return;
  }

  setContextMenuLanguage(window, contextMenuLanguage);
}

/**
 * Resolves the generated PNG icon used for the runtime window when available.
 *
 * @returns Absolute icon path when the generated icon exists, otherwise null.
 */
function resolveWindowIconPath(): string | null {
  const iconFileName = process.platform === "win32" ? "icon.ico" : "icon.png";
  const iconCandidates = [
    path.join(process.resourcesPath, iconFileName),
    path.join(__dirname, "..", "..", "build", iconFileName)
  ];

  for (const iconPath of iconCandidates) {
    if (existsSync(iconPath)) {
      return iconPath;
    }
  }

  return null;
}
