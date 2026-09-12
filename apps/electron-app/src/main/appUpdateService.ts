/**
 * Coordinates explicit application updates through electron-updater.
 *
 * This service deliberately exposes immutable protocol snapshots. The
 * renderer never receives the updater instance or provider-specific objects.
 */
import { autoUpdater } from "electron-updater";
import type { AppUpdater, ProgressInfo, UpdateInfo } from "electron-updater";

import type {
  OpenCodexAppUpdateProgress,
  OpenCodexAppUpdateState
} from "@open-codex-ui/opencodex-protocol";

const INITIAL_CHECK_DELAY_MS = 10_000;
const CHECK_COOLDOWN_MS = 30 * 60 * 1_000;
const MISSING_RELEASE_ERROR_CODES = new Set([
  "ERR_UPDATER_LATEST_VERSION_NOT_FOUND",
  "ERR_UPDATER_NO_PUBLISHED_VERSIONS"
]);
const MISSING_RELEASE_ERROR_PATTERNS = [
  /Unable to find latest version on GitHub .*please ensure a production release exists/i,
  /No published versions on GitHub/i
];

type AppUpdateLogLevel = "info" | "warning" | "error";

type AppUpdateServiceOptions = {
  currentVersion: string;
  isPackaged: boolean;
  allowPrerelease: boolean;
  emit(state: OpenCodexAppUpdateState): void;
  log(level: AppUpdateLogLevel, message: string): void;
  onInstallRequested(): void;
};

/**
 * Owns the native updater lifecycle and keeps update operations user-driven.
 */
export class AppUpdateService {
  private readonly updater: AppUpdater;
  private readonly options: AppUpdateServiceOptions;
  private state: OpenCodexAppUpdateState;
  private checkPromise: Promise<OpenCodexAppUpdateState> | null = null;
  private initialCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCheckAtMs: number | null = null;
  private isStarted = false;
  private isDisposed = false;

  /** Creates the updater service with the packaged application settings. */
  constructor(options: AppUpdateServiceOptions, updater: AppUpdater = autoUpdater) {
    this.options = options;
    this.updater = updater;
    this.state = createInitialState(options.currentVersion, options.isPackaged);
    this.configureUpdater(options.allowPrerelease);
    this.attachUpdaterEvents();
  }

  /** Starts the delayed background check used after the renderer is ready. */
  start(): void {
    if (this.isStarted || this.isDisposed) {
      return;
    }

    this.isStarted = true;
    this.publishState();

    if (!this.state.isSupported) {
      return;
    }

    this.initialCheckTimer = setTimeout(() => {
      this.initialCheckTimer = null;
      void this.check(false);
    }, INITIAL_CHECK_DELAY_MS);
  }

  /** Returns a plain snapshot suitable for an IPC response. */
  getState(): OpenCodexAppUpdateState {
    return cloneState(this.state);
  }

  /** Updates prerelease selection for future checks. */
  setAllowPrerelease(allowPrerelease: boolean): void {
    if (this.isDisposed) {
      return;
    }

    this.updater.allowPrerelease = allowPrerelease;
    this.updater.allowDowngrade = false;
  }

  /** Checks GitHub releases unless a recent check is still fresh. */
  async check(force: boolean): Promise<OpenCodexAppUpdateState> {
    if (this.isDisposed || !this.state.isSupported) {
      return this.getState();
    }

    const now = Date.now();

    if (!force && this.lastCheckAtMs !== null && now - this.lastCheckAtMs < CHECK_COOLDOWN_MS) {
      return this.getState();
    }

    if (this.checkPromise !== null) {
      return this.checkPromise;
    }

    this.checkPromise = this.performCheck();
    try {
      return await this.checkPromise;
    } finally {
      this.checkPromise = null;
    }
  }

  /** Downloads the currently offered update after explicit user action. */
  async download(): Promise<OpenCodexAppUpdateState> {
    if (this.isDisposed || !this.state.isSupported || this.state.status !== "available") {
      return this.getState();
    }

    this.publishState({
      status: "downloading",
      errorMessage: null,
      progress: null
    });

    try {
      await this.updater.downloadUpdate();
    } catch (error) {
      this.applyError(error);
    }

    return this.getState();
  }

  /** Installs a downloaded update and lets the native installer relaunch the app. */
  install(): OpenCodexAppUpdateState {
    if (this.isDisposed || !this.state.isSupported || this.state.status !== "downloaded") {
      return this.getState();
    }

    this.options.onInstallRequested();
    this.updater.quitAndInstall(false, true);
    return this.getState();
  }

  /** Releases timers and updater event listeners during application shutdown. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    if (this.initialCheckTimer !== null) {
      clearTimeout(this.initialCheckTimer);
      this.initialCheckTimer = null;
    }

    this.updater.off("checking-for-update", this.handleCheckingForUpdate);
    this.updater.off("update-available", this.handleUpdateAvailable);
    this.updater.off("update-not-available", this.handleUpdateNotAvailable);
    this.updater.off("download-progress", this.handleDownloadProgress);
    this.updater.off("update-downloaded", this.handleUpdateDownloaded);
    this.updater.off("update-cancelled", this.handleUpdateCancelled);
    this.updater.off("error", this.handleUpdaterError);
  }

  /** Configures conservative updater defaults before any check can start. */
  private configureUpdater(allowPrerelease: boolean): void {
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowPrerelease = allowPrerelease;
    this.updater.allowDowngrade = false;
    this.updater.logger = {
      info: (message?: unknown) => this.options.log("info", String(message ?? "")),
      warn: (message?: unknown) => this.options.log("warning", String(message ?? "")),
      error: (message?: unknown) => {
        if (shouldIgnoreMissingRelease(message, this.options.currentVersion)) {
          return;
        }

        this.options.log("error", String(message ?? ""));
      }
    };
  }

  /** Subscribes to updater events and converts them to protocol snapshots. */
  private attachUpdaterEvents(): void {
    this.updater.on("checking-for-update", this.handleCheckingForUpdate);
    this.updater.on("update-available", this.handleUpdateAvailable);
    this.updater.on("update-not-available", this.handleUpdateNotAvailable);
    this.updater.on("download-progress", this.handleDownloadProgress);
    this.updater.on("update-downloaded", this.handleUpdateDownloaded);
    this.updater.on("update-cancelled", this.handleUpdateCancelled);
    this.updater.on("error", this.handleUpdaterError);
  }

  /** Runs one provider check and normalizes the result when no event was emitted. */
  private async performCheck(): Promise<OpenCodexAppUpdateState> {
    if (!this.updater.isUpdaterActive()) {
      this.publishState({ isSupported: false, status: "idle", errorMessage: null });
      return this.getState();
    }

    this.publishState({
      status: "checking",
      errorMessage: null,
      progress: null
    });

    try {
      const result = await this.updater.checkForUpdates();
      this.lastCheckAtMs = Date.now();

      if (result === null || !result.isUpdateAvailable) {
        if (this.state.status === "checking") {
          this.publishState({
            status: "not-available",
            availableVersion: null,
            releaseName: null,
            releaseDate: null,
            checkedAt: new Date().toISOString()
          });
        }
      } else if (this.state.status === "checking") {
        this.publishAvailableUpdate(result.updateInfo);
      }
    } catch (error) {
      this.handleCheckError(error);
    }

    return this.getState();
  }

  /** Publishes a partial state update and keeps the emitted DTO detached. */
  private publishState(patch: Partial<OpenCodexAppUpdateState> = {}): void {
    this.state = { ...this.state, ...patch };
    this.options.emit(this.getState());
  }

  /** Converts provider metadata into the small update payload used by the UI. */
  private publishAvailableUpdate(info: UpdateInfo): void {
    this.publishState({
      status: "available",
      availableVersion: info.version,
      releaseName: info.releaseName ?? null,
      releaseDate: info.releaseDate ?? null,
      progress: null,
      errorMessage: null,
      checkedAt: new Date().toISOString()
    });
  }

  /** Stores a provider error without exposing the provider-specific error object. */
  private applyError(error: unknown): void {
    const message = error instanceof Error && error.message.length > 0
      ? error.message
      : String(error);

    if (this.state.status === "error" && this.state.errorMessage === message) {
      return;
    }

    this.publishState({
      status: "error",
      progress: null,
      errorMessage: message,
      checkedAt: new Date().toISOString()
    });
  }

  /** Treats the absence of a published release as normal for prerelease builds. */
  private handleCheckError(error: unknown): void {
    this.lastCheckAtMs = Date.now();

    if (shouldIgnoreMissingRelease(error, this.options.currentVersion)) {
      this.publishNoUpdateAvailable();
      return;
    }

    this.applyError(error);
  }

  /** Publishes a quiet result when the configured update channel has no release yet. */
  private publishNoUpdateAvailable(): void {
    if (
      this.state.status === "not-available" &&
      this.state.errorMessage === null &&
      this.state.availableVersion === null
    ) {
      return;
    }

    this.publishState({
      status: "not-available",
      availableVersion: null,
      releaseName: null,
      releaseDate: null,
      progress: null,
      errorMessage: null,
      checkedAt: new Date().toISOString()
    });
  }

  /** Receives the start of a provider check. */
  private readonly handleCheckingForUpdate = (): void => {
    if (!this.isDisposed) {
      this.publishState({ status: "checking", errorMessage: null, progress: null });
    }
  };

  /** Receives metadata for an available update. */
  private readonly handleUpdateAvailable = (info: UpdateInfo): void => {
    if (!this.isDisposed) {
      this.lastCheckAtMs = Date.now();
      this.publishAvailableUpdate(info);
    }
  };

  /** Receives a completed check without an available update. */
  private readonly handleUpdateNotAvailable = (info: UpdateInfo): void => {
    if (!this.isDisposed) {
      this.lastCheckAtMs = Date.now();
      this.publishState({
        status: "not-available",
        availableVersion: null,
        releaseName: null,
        releaseDate: info.releaseDate ?? null,
        progress: null,
        errorMessage: null,
        checkedAt: new Date().toISOString()
      });
    }
  };

  /** Receives download progress from the native updater. */
  private readonly handleDownloadProgress = (info: ProgressInfo): void => {
    if (!this.isDisposed) {
      this.publishState({
        status: "downloading",
        errorMessage: null,
        progress: normalizeProgress(info)
      });
    }
  };

  /** Receives the completed download notification. */
  private readonly handleUpdateDownloaded = (info: UpdateInfo): void => {
    if (!this.isDisposed) {
      this.publishState({
        status: "downloaded",
        availableVersion: info.version,
        releaseName: info.releaseName ?? null,
        releaseDate: info.releaseDate ?? null,
        progress: null,
        errorMessage: null
      });
    }
  };

  /** Returns to the available state when a download is cancelled. */
  private readonly handleUpdateCancelled = (info: UpdateInfo): void => {
    if (!this.isDisposed) {
      this.publishAvailableUpdate(info);
    }
  };

  /** Receives an updater error and turns it into a safe UI message. */
  private readonly handleUpdaterError = (error: Error): void => {
    if (!this.isDisposed) {
      if (
        this.state.status === "checking" &&
        shouldIgnoreMissingRelease(error, this.options.currentVersion)
      ) {
        this.lastCheckAtMs = Date.now();
        this.publishNoUpdateAvailable();
        return;
      }

      this.applyError(error);
    }
  };
}

/** Creates the initial state shared before the first update check. */
function createInitialState(
  currentVersion: string,
  isPackaged: boolean
): OpenCodexAppUpdateState {
  return {
    currentVersion,
    isSupported: isPackaged,
    status: "idle",
    availableVersion: null,
    releaseName: null,
    releaseDate: null,
    progress: null,
    errorMessage: null,
    checkedAt: null
  };
}

/** Copies nested progress data before it crosses the main/renderer boundary. */
function cloneState(state: OpenCodexAppUpdateState): OpenCodexAppUpdateState {
  return {
    ...state,
    progress: state.progress === null ? null : { ...state.progress }
  };
}

/** Normalizes updater progress so the renderer always receives finite values. */
function normalizeProgress(info: ProgressInfo): OpenCodexAppUpdateProgress {
  return {
    percent: normalizeNumber(info.percent),
    transferred: normalizeNumber(info.transferred),
    total: normalizeNumber(info.total),
    bytesPerSecond: normalizeNumber(info.bytesPerSecond)
  };
}

/** Replaces invalid numeric values emitted by an updater implementation. */
function normalizeNumber(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Returns whether a version is a semantic-version prerelease. */
function isPrereleaseVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/.test(version);
}

/** Reads an updater error code without leaking provider-specific types. */
function getErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/** Identifies the expected no-release case for an unstable application build. */
function shouldIgnoreMissingRelease(error: unknown, currentVersion: string): boolean {
  if (!isPrereleaseVersion(currentVersion)) {
    return false;
  }

  const code = getErrorCode(error);
  if (code !== null && MISSING_RELEASE_ERROR_CODES.has(code)) {
    return true;
  }

  const message = getErrorMessage(error);
  return MISSING_RELEASE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/** Returns a safe textual representation for updater log filtering. */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "";
}
