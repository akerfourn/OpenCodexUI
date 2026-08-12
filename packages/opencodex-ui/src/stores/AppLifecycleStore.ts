import { action, computed, makeObservable, observable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexReasoningEffort,
  OpenCodexSettings,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";

import { applyOpenCodexLanguage } from "../i18n/i18n";
import { AppSettingsStore, type AppSettingsRequestPort } from "./AppSettingsStore";

/** Backend request capability required by application lifecycle state. */
export type AppLifecycleRequestPort = AppSettingsRequestPort;

/**
 * Stores application bootstrap, connection, and host diagnostic state.
 *
 * Bootstrap-owned application fields live here as well, while `AppStore`
 * inherits them to preserve its historical public surface.
 */
export class AppLifecycleStore {
  /** Dedicated owner of the observable settings DTO and its mutations. */
  readonly settingsStore: AppSettingsStore;
  /** Project path supplied by the host launch request. */
  launchProjectPath: string | null = null;
  /** Model selected for application-level new chats. */
  selectedModel: string | null = null;
  /** Reasoning effort selected for application-level new chats. */
  reasoningEffort: OpenCodexReasoningEffort = "medium";
  /** Current backend connection status. */
  connectionStatus = "stopped";
  /** Whether the initial application request is still being bootstrapped. */
  isBootstrapping = false;
  /** Version of the desktop application reported by the host. */
  appVersion: string | null = null;
  /** Whether the running desktop application is a prerelease build. */
  isPrerelease = false;
  /** Last Git executable diagnostic returned by the host. */
  gitVersionStatus: OpenCodexToolVersionStatus | null = null;
  /** Whether a Git executable diagnostic is currently in flight. */
  isLoadingGitVersion = false;

  /**
   * Creates the application lifecycle store.
   *
   * @param root Backend request port used by lifecycle actions.
   */
  constructor(protected readonly root: AppLifecycleRequestPort) {
    this.settingsStore = new AppSettingsStore(root);
    makeObservable<AppLifecycleStore, "root">(this, {
      root: false,
      settingsStore: false,
      settings: computed,
      launchProjectPath: observable,
      selectedModel: observable,
      reasoningEffort: observable,
      connectionStatus: observable,
      isBootstrapping: observable,
      appVersion: observable,
      isPrerelease: observable,
      gitVersionStatus: observable,
      isLoadingGitVersion: observable,
      bootstrap: action,
      loadGitVersion: action,
      handleEvent: action
    });
  }

  /**
   * Reads the settings DTO through the dedicated settings store.
   *
   * This getter preserves the historical public `AppStore.settings` API while
   * keeping the mutable observable state owned by `settingsStore`.
   *
   * @deprecated Use `settingsStore.settings` instead.
   *
   * @returns Current application settings snapshot.
   */
  get settings(): OpenCodexSettings {
    return this.settingsStore.settings;
  }

  /**
   * Replaces settings through the dedicated store without persisting them.
   *
   * @param settings Authoritative settings snapshot.
   * @deprecated Use `settingsStore.replaceSettings(settings)` instead.
   * @returns Nothing.
   */
  set settings(settings: OpenCodexSettings) {
    this.settingsStore.replaceSettings(settings);
  }

  /**
   * Requests initial application state from the backend.
   *
   * The completion event clears `isBootstrapping`; request failures retain the
   * historical behavior of clearing it locally and swallowing the error.
   *
   * @returns Promise resolved when the request completes.
   */
  async bootstrap(): Promise<void> {
    this.isBootstrapping = true;

    try {
      await this.root.request({ type: "app.bootstrap" });
    } catch {
      this.isBootstrapping = false;
    }
  }

  /**
   * Detects the Git command available to the host runtime.
   *
   * @returns Promise resolved when the diagnostic is stored.
   */
  async loadGitVersion(): Promise<void> {
    if (this.isLoadingGitVersion) {
      return;
    }

    this.isLoadingGitVersion = true;

    try {
      const gitVersionStatus = await this.root.request<OpenCodexToolVersionStatus>({
        type: "git.version"
      });
      runInAction(() => {
        this.gitVersionStatus = gitVersionStatus;
      });
    } finally {
      runInAction(() => {
        this.isLoadingGitVersion = false;
      });
    }
  }

  /**
   * Applies backend events owned by application lifecycle state.
   *
   * `models.updated` intentionally does not belong here: its receiver must
   * remain `AppStore` so the root can reconcile project chat settings next.
   *
   * @param event Event payload to process.
   * @returns Nothing.
   */
  handleEvent(event: OpenCodexEvent): void {
    switch (event.type) {
      case "connection.status":
        this.connectionStatus = event.status;
        return;
      case "app.bootstrap":
        this.applyBootstrap(event.settings, event.projectPath, event.appVersion);
        this.isPrerelease = event.isPrerelease;
        return;
      case "projects.updated":
        this.isBootstrapping = false;
        return;
      default:
        return;
    }
  }

  /**
   * Applies bootstrap data to lifecycle-owned application fields.
   *
   * @param settings Settings returned by the backend.
   * @param launchProjectPath Project path supplied by the host launch request.
   * @param appVersion Desktop application version.
   * @returns Nothing.
   */
  private applyBootstrap(
    settings: OpenCodexSettings,
    launchProjectPath: string | null,
    appVersion: string | null
  ): void {
    this.settingsStore.applyBootstrap(settings);
    this.launchProjectPath = launchProjectPath;
    this.selectedModel = settings.defaultModel;
    this.reasoningEffort = settings.defaultReasoningEffort ?? "medium";
    this.appVersion = appVersion;
    applyOpenCodexLanguage(settings.language);
  }
}
