import { action, makeObservable, observable } from "mobx";

import type {
  OpenCodexCodexReleaseCheck,
  OpenCodexColorScheme,
  OpenCodexCommitMessageLanguage,
  OpenCodexEnterKeyBehavior,
  OpenCodexLanguage,
  OpenCodexRequest,
  OpenCodexReasoningEffort,
  OpenCodexSettings,
  OpenCodexVersioningVocabulary
} from "@open-codex-ui/opencodex-protocol";

import { applyOpenCodexLanguage } from "../../i18n/i18n";

/** Backend request capability required by application settings actions. */
export type AppSettingsRequestPort = {
  request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse>;
};

/**
 * Stores persisted application settings and their optimistic UI mutations.
 *
 * Backend responses are intentionally not awaited: the settings screen has
 * historically updated optimistically and relies on a later authoritative
 * bootstrap/event to replace its local snapshot.
 */
export class AppSettingsStore {
  /** Current application settings snapshot. */
  settings: OpenCodexSettings = createDefaultSettings();

  /**
   * Creates the application settings store.
   *
   * @param root Backend request port used by persistence actions.
   */
  constructor(private readonly root: AppSettingsRequestPort) {
    makeObservable<AppSettingsStore, "root">(this, {
      root: false,
      settings: observable,
      replaceSettings: action,
      applyBootstrap: action,
      completeOnboarding: action,
      setLanguage: action,
      setAllowTurnSteering: action,
      setDesktopTurnCompletedNotifications: action,
      setDesktopApprovalNotifications: action,
      setColorScheme: action,
      setEnterKeyBehavior: action,
      setVersioningVocabulary: action,
      setDiscordRichPresenceEnabled: action,
      setAllowOutdatedCodex: action,
      setDeveloperMode: action,
      setPerformanceMonitoringEnabled: action,
      setAdvancedPerformanceMonitoringEnabled: action,
      setDefaultUsageLimitId: action,
      setDefaultSourceId: action,
      setCommitMessageModelAndEffort: action,
      setCommitMessageReasoningEffort: action,
      setCommitMessageLanguage: action,
      setCodexReleaseCheck: action
    });
  }

  /**
   * Replaces the local settings snapshot without persisting it.
   *
   * This is the compatibility path used by backend/bootstrap reducers and by
   * the historical public `settings` setter. A fresh DTO is stored so callers
   * cannot mutate the observable state through the object they supplied.
   *
   * @param settings Authoritative settings snapshot.
   * @returns Nothing.
   */
  replaceSettings(settings: OpenCodexSettings): void {
    this.settings = cloneSettings(settings);
  }

  /**
   * Applies settings received during bootstrap without sending them back.
   *
   * Bootstrap payloads are merged with the local defaults for compatibility
   * with older backends that may omit fields introduced by the UI. The backend
   * remains authoritative for every field present in the payload.
   *
   * Language application is intentionally orchestrated by
   * `AppLifecycleStore` after all lifecycle fields have been updated.
   *
   * @param settings Settings returned by the backend.
   * @returns Nothing.
   */
  applyBootstrap(settings: OpenCodexSettings): void {
    this.replaceSettings({ ...this.settings, ...settings });
  }

  /**
   * Marks onboarding completed locally and persists the minimal patch.
   *
   * @returns Nothing.
   */
  completeOnboarding(): void {
    this.settings = { ...this.settings, onboardingCompleted: true };
    this.persistPatch({ onboardingCompleted: true });
  }

  /**
   * Updates the UI language before starting its fire-and-forget persistence.
   *
   * @param language Language setting to apply.
   * @returns Nothing.
   */
  setLanguage(language: OpenCodexLanguage): void {
    this.settings = { ...this.settings, language };
    applyOpenCodexLanguage(language);
    this.persistPatch({ language });
  }

  /**
   * Updates whether active turns can receive steering messages.
   *
   * @param allowTurnSteering Whether steering is enabled.
   * @returns Nothing.
   */
  setAllowTurnSteering(allowTurnSteering: boolean): void {
    this.updateSettings({ allowTurnSteering });
  }

  /**
   * Updates notifications shown when a response has completed.
   *
   * @param turnCompleted Whether completed-response notifications are enabled.
   * @returns Nothing.
   */
  setDesktopTurnCompletedNotifications(turnCompleted: boolean): void {
    const desktopNotifications = {
      ...this.settings.desktopNotifications,
      turnCompleted
    };
    this.updateSettings({ desktopNotifications });
  }

  /**
   * Updates notifications shown for pending approvals.
   *
   * @param approvalRequested Whether approval notifications are enabled.
   * @returns Nothing.
   */
  setDesktopApprovalNotifications(approvalRequested: boolean): void {
    const desktopNotifications = {
      ...this.settings.desktopNotifications,
      approvalRequested
    };
    this.updateSettings({ desktopNotifications });
  }

  /**
   * Updates the UI color scheme.
   *
   * @param colorScheme Color scheme setting.
   * @returns Nothing.
   */
  setColorScheme(colorScheme: OpenCodexColorScheme): void {
    this.updateSettings({ colorScheme });
  }

  /**
   * Updates the Enter key behavior used by the chat composer.
   *
   * @param enterKeyBehavior Enter key behavior setting.
   * @returns Nothing.
   */
  setEnterKeyBehavior(enterKeyBehavior: OpenCodexEnterKeyBehavior): void {
    this.updateSettings({ enterKeyBehavior });
  }

  /**
   * Updates the versioning vocabulary used by Git-related UI.
   *
   * @param versioningVocabulary Vocabulary mode.
   * @returns Nothing.
   */
  setVersioningVocabulary(versioningVocabulary: OpenCodexVersioningVocabulary): void {
    this.updateSettings({ versioningVocabulary });
  }

  /**
   * Updates Discord Rich Presence usage.
   *
   * @param discordRichPresenceEnabled Whether Rich Presence is enabled.
   * @returns Nothing.
   */
  setDiscordRichPresenceEnabled(discordRichPresenceEnabled: boolean): void {
    this.updateSettings({ discordRichPresenceEnabled });
  }

  /**
   * Updates whether outdated Codex CLI versions remain usable.
   *
   * @param allowOutdatedCodex Whether outdated Codex sources are usable.
   * @returns Nothing.
   */
  setAllowOutdatedCodex(allowOutdatedCodex: boolean): void {
    this.updateSettings({ allowOutdatedCodex });
  }

  /**
   * Updates developer mode and enforces its advanced-monitoring dependency.
   *
   * @param developerMode Whether developer-only actions are enabled.
   * @returns Nothing.
   */
  setDeveloperMode(developerMode: boolean): void {
    const advancedPerformanceMonitoringEnabled = developerMode
      ? this.settings.advancedPerformanceMonitoringEnabled
      : false;
    this.updateSettings({ developerMode, advancedPerformanceMonitoringEnabled });
  }

  /**
   * Updates lightweight performance monitoring and its advanced dependency.
   *
   * @param performanceMonitoringEnabled Whether monitoring is enabled.
   * @returns Nothing.
   */
  setPerformanceMonitoringEnabled(performanceMonitoringEnabled: boolean): void {
    const advancedPerformanceMonitoringEnabled = performanceMonitoringEnabled
      ? this.settings.advancedPerformanceMonitoringEnabled
      : false;
    this.updateSettings({ performanceMonitoringEnabled, advancedPerformanceMonitoringEnabled });
  }

  /**
   * Updates advanced monitoring only when both prerequisite settings are active.
   *
   * @param advancedPerformanceMonitoringEnabled Whether advanced monitoring is enabled.
   * @returns Nothing.
   */
  setAdvancedPerformanceMonitoringEnabled(
    advancedPerformanceMonitoringEnabled: boolean
  ): void {
    if (!this.settings.developerMode || !this.settings.performanceMonitoringEnabled) {
      return;
    }

    this.updateSettings({ advancedPerformanceMonitoringEnabled });
  }

  /**
   * Updates the usage limit displayed as the default account usage.
   *
   * @param defaultUsageLimitId Usage limit identifier, or `null` for Codex.
   * @returns Nothing.
   */
  setDefaultUsageLimitId(defaultUsageLimitId: string | null): void {
    this.updateSettings({ defaultUsageLimitId });
  }

  /**
   * Updates the default Codex source used when a request omits a source id.
   *
   * @param defaultSourceId Source identifier.
   * @returns Nothing.
   */
  setDefaultSourceId(defaultSourceId: string): void {
    this.updateSettings({ defaultSourceId });
  }

  /**
   * Updates the model and effort used for one-shot commit message generation.
   *
   * The caller resolves the effort against the selected model; this method
   * keeps both fields and their persistence patch atomic.
   *
   * @param commitMessageModel Model identifier, or `null` for backend default.
   * @param commitMessageReasoningEffort Resolved effort, or `null` for default.
   * @returns Nothing.
   */
  setCommitMessageModelAndEffort(
    commitMessageModel: string | null,
    commitMessageReasoningEffort: OpenCodexReasoningEffort | null
  ): void {
    this.updateSettings({ commitMessageModel, commitMessageReasoningEffort });
  }

  /**
   * Updates the reasoning effort used for commit message generation.
   *
   * @param commitMessageReasoningEffort Reasoning effort, or `null` for default.
   * @returns Nothing.
   */
  setCommitMessageReasoningEffort(
    commitMessageReasoningEffort: OpenCodexReasoningEffort | null
  ): void {
    this.updateSettings({ commitMessageReasoningEffort });
  }

  /**
   * Updates the output language used for generated commit messages.
   *
   * @param commitMessageLanguage Output language.
   * @returns Nothing.
   */
  setCommitMessageLanguage(commitMessageLanguage: OpenCodexCommitMessageLanguage): void {
    this.updateSettings({ commitMessageLanguage });
  }

  /**
   * Stores release-check metadata received from a local Codex update check.
   *
   * This is deliberately local: release-check results are persisted by the
   * update service, not by the settings controls.
   *
   * @param codexReleaseCheck Latest release-check metadata.
   * @returns Nothing.
   */
  setCodexReleaseCheck(codexReleaseCheck: OpenCodexCodexReleaseCheck): void {
    this.settings = { ...this.settings, codexReleaseCheck };
  }

  /**
   * Applies a settings patch locally and sends it without awaiting a response.
   *
   * @param patch Settings fields to update.
   * @returns Nothing.
   */
  private updateSettings(patch: Partial<OpenCodexSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.persistPatch(patch);
  }

  /**
   * Sends a settings patch while intentionally ignoring its normalized result.
   *
   * @param patch Settings fields to persist.
   * @returns Nothing.
   */
  private persistPatch(patch: Partial<OpenCodexSettings>): void {
    void this.root.request({ type: "settings.update", patch });
  }
}

/**
 * Creates the initial settings DTO used before the first backend bootstrap.
 *
 * @returns Default settings snapshot.
 */
function createDefaultSettings(): OpenCodexSettings {
  return {
    codexCommand: "codex",
    codexReleaseCheck: {
      latestVersion: null,
      checkedAt: null,
      error: null
    },
    defaultSourceId: null,
    defaultUsageLimitId: null,
    defaultModel: null,
    defaultReasoningEffort: "medium",
    commitMessageModel: null,
    commitMessageReasoningEffort: "medium",
    commitMessageLanguage: "en",
    showActivityPanel: true,
    experimentalApi: true,
    allowTurnSteering: false,
    language: "system",
    colorScheme: "system",
    enterKeyBehavior: "newline",
    versioningVocabulary: "simple",
    desktopNotifications: {
      turnCompleted: false,
      approvalRequested: false
    },
    discordRichPresenceEnabled: true,
    onboardingCompleted: false,
    allowOutdatedCodex: false,
    developerMode: false,
    performanceMonitoringEnabled: true,
    advancedPerformanceMonitoringEnabled: false
  };
}

/**
 * Clones settings and their nested DTOs before exposing them to MobX.
 *
 * @param settings Settings snapshot to clone.
 * @returns Independent settings snapshot.
 */
function cloneSettings(settings: OpenCodexSettings): OpenCodexSettings {
  return {
    ...settings,
    codexReleaseCheck: { ...settings.codexReleaseCheck },
    desktopNotifications: { ...settings.desktopNotifications }
  };
}
