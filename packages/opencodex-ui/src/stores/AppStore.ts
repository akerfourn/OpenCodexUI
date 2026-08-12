import { action, computed, makeObservable, observable, override } from "mobx";

import type {
  OpenCodexColorScheme,
  OpenCodexCodexReleaseCheck,
  OpenCodexCommitMessageLanguage,
  OpenCodexEnterKeyBehavior,
  OpenCodexEvent,
  OpenCodexLanguage,
  OpenCodexModel,
  OpenCodexModelServiceTier,
  OpenCodexReasoningEffortOption,
  OpenCodexReasoningEffort,
  OpenCodexVersioningVocabulary
} from "@open-codex-ui/opencodex-protocol";

import {
  getCommitMessageModelOptions,
  getModelOptions,
  getReasoningEffortOptions,
  getServiceTierOptions,
  resolveReasoningEffort
} from "./modelSelection";
import { AppOnboardingStore } from "./AppOnboardingStore";
import type { RootStore } from "./RootStore";
import type { RootChildStore } from "./RootChildStore";

/**
 * Stores application-wide settings, startup state, and model selection.
 */
export class AppStore extends AppOnboardingStore implements RootChildStore {
  models: OpenCodexModel[] = [];
  errorMessage: string | null = null;
  warningMessage: string | null = null;

  /**
   * Creates the application store.
   *
   * @param root Root store used for backend requests and cross-store updates.
   */
  constructor(root: RootStore) {
    super(root);
    makeObservable<AppStore>(this, {
      models: observable,
      errorMessage: observable,
      warningMessage: observable,
      modelOptions: computed,
      commitMessageModelOptions: computed,
      handleEvent: override,
      applyError: action,
      clearErrorMessage: action,
      showWarningMessage: action,
      clearWarningMessage: action,
      setSelectedModel: action,
      setReasoningEffort: action,
      setLanguage: action,
      setAllowTurnSteering: action,
      setDesktopTurnCompletedNotifications: action,
      setDesktopApprovalNotifications: action,
      setColorScheme: action,
      setEnterKeyBehavior: action,
      setVersioningVocabulary: action,
      setDiscordRichPresenceEnabled: action,
      reconnectDiscordRichPresence: action,
      setAllowOutdatedCodex: action,
      setDeveloperMode: action,
      setPerformanceMonitoringEnabled: action,
      setAdvancedPerformanceMonitoringEnabled: action,
      setDefaultUsageLimitId: action,
      setDefaultSourceId: action,
      openDeveloperTools: action,
      setCommitMessageModel: action,
      setCommitMessageReasoningEffort: action,
      setCommitMessageLanguage: action,
      setCodexReleaseCheck: action
    });
  }

  /**
   * Returns available model choices while preserving the current selection.
   *
   * @returns Model option list.
   */
  get modelOptions(): string[] {
    return getModelOptions(this.models, this.selectedModel);
  }

  /**
   * Returns model choices available for commit message generation.
   *
   * @returns Model option list.
   */
  get commitMessageModelOptions(): string[] {
    return getCommitMessageModelOptions(this.models, this.settings.commitMessageModel);
  }

  /**
   * Applies backend events owned by the application store.
   *
   * @param event Event payload to process.
   *
   * @returns Nothing.
   */
  override handleEvent(event: OpenCodexEvent): void {
    if (event.type === "models.updated") {
      this.models = event.models;
      this.selectedModel = this.selectedModel ?? event.models[0]?.model ?? null;
      return;
    }

    super.handleEvent(event);
  }

  /**
   * Stores an error event as user-visible text.
   *
   * @param event Error event payload.
   *
   * @returns Nothing.
   */
  applyError(event: Extract<OpenCodexEvent, { type: "error" }>): void {
    this.errorMessage = event.details === undefined
      ? event.message
      : `${event.message}\n${JSON.stringify(event.details, null, 2)}`;
  }

  /**
   * Clears the current user-visible error notification.
   *
   * @returns Nothing.
   */
  clearErrorMessage(): void {
    this.errorMessage = null;
  }

  /**
   * Shows a user-visible warning notification.
   *
   * @param message Warning text.
   *
   * @returns Nothing.
   */
  showWarningMessage(message: string): void {
    this.warningMessage = message;
  }

  /**
   * Clears the current user-visible warning notification.
   *
   * @returns Nothing.
   */
  clearWarningMessage(): void {
    this.warningMessage = null;
  }

  /**
   * Updates the selected model in UI state.
   *
   * @param value Model identifier, or `null` for backend default.
   *
   * @returns Nothing.
   */
  setSelectedModel(value: string | null): void {
    this.selectedModel = value;
  }

  /**
   * Updates the selected reasoning effort in UI state.
   *
   * @param value Reasoning effort to use for future turns.
   *
   * @returns Nothing.
   */
  setReasoningEffort(value: OpenCodexReasoningEffort): void {
    this.reasoningEffort = value;
  }

  /**
   * Returns service tier choices for the provided model.
   *
   * @param model Model identifier.
   *
   * @returns Service tiers advertised by Codex.
   */
  getServiceTierOptions(model: string | null): OpenCodexModelServiceTier[] {
    return getServiceTierOptions(this.models, model);
  }

  /**
   * Returns reasoning efforts supported by the selected model.
   *
   * @param model Model identifier, or `null` for the current default.
   * @returns Model-specific efforts, or conservative fallback efforts.
   */
  getReasoningEffortOptions(model: string | null): OpenCodexReasoningEffortOption[] {
    return getReasoningEffortOptions(
      this.models,
      model,
      this.selectedModel,
      this.settings.defaultModel
    );
  }

  /**
   * Keeps a reasoning effort valid when the selected model changes.
   *
   * @param model Model identifier, or `null` for the current default.
   * @param reasoningEffort Current effort.
   * @returns Current effort when supported, otherwise the model default.
   */
  resolveReasoningEffort(
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort
  ): OpenCodexReasoningEffort {
    return resolveReasoningEffort(
      this.models,
      model,
      this.selectedModel,
      this.settings.defaultModel,
      reasoningEffort
    );
  }

  /**
   * Updates the UI language and persists it through the backend.
   *
   * @param language Language setting to apply.
   *
   * @deprecated Use `settingsStore.setLanguage` instead.
   *
   * @returns Nothing.
   */
  setLanguage(language: OpenCodexLanguage): void {
    this.settingsStore.setLanguage(language);
  }

  /**
   * Updates whether active turns can receive steering messages.
   *
   * @param allowTurnSteering Whether steering is enabled.
   *
   * @deprecated Use `settingsStore.setAllowTurnSteering` instead.
   *
   * @returns Nothing.
   */
  setAllowTurnSteering(allowTurnSteering: boolean): void {
    this.settingsStore.setAllowTurnSteering(allowTurnSteering);
  }

  /**
   * Enables or disables notifications when a response has completed.
   *
   * @param turnCompleted Whether completed-response notifications are enabled.
   * @deprecated Use `settingsStore.setDesktopTurnCompletedNotifications` instead.
   * @returns Nothing.
   */
  setDesktopTurnCompletedNotifications(turnCompleted: boolean): void {
    this.settingsStore.setDesktopTurnCompletedNotifications(turnCompleted);
  }

  /**
   * Enables or disables notifications for pending approvals.
   *
   * @param approvalRequested Whether approval notifications are enabled.
   * @deprecated Use `settingsStore.setDesktopApprovalNotifications` instead.
   * @returns Nothing.
   */
  setDesktopApprovalNotifications(approvalRequested: boolean): void {
    this.settingsStore.setDesktopApprovalNotifications(approvalRequested);
  }

  /**
   * Updates the UI color scheme and persists it through the backend.
   *
   * @param colorScheme Color scheme setting to apply.
   *
   * @deprecated Use `settingsStore.setColorScheme` instead.
   *
   * @returns Nothing.
   */
  setColorScheme(colorScheme: OpenCodexColorScheme): void {
    this.settingsStore.setColorScheme(colorScheme);
  }

  /**
   * Updates the Enter key behavior used by the chat composer.
   *
   * @param enterKeyBehavior Enter key behavior setting.
   *
   * @deprecated Use `settingsStore.setEnterKeyBehavior` instead.
   *
   * @returns Nothing.
   */
  setEnterKeyBehavior(enterKeyBehavior: OpenCodexEnterKeyBehavior): void {
    this.settingsStore.setEnterKeyBehavior(enterKeyBehavior);
  }

  /**
   * Updates the versioning vocabulary used by Git-related UI.
   *
   * @param versioningVocabulary Vocabulary mode.
   *
   * @deprecated Use `settingsStore.setVersioningVocabulary` instead.
   *
   * @returns Nothing.
   */
  setVersioningVocabulary(versioningVocabulary: OpenCodexVersioningVocabulary): void {
    this.settingsStore.setVersioningVocabulary(versioningVocabulary);
  }

  /**
   * Updates Discord Rich Presence usage.
   *
   * @param discordRichPresenceEnabled Whether Discord Rich Presence is enabled.
   *
   * @deprecated Use `settingsStore.setDiscordRichPresenceEnabled` instead.
   *
   * @returns Nothing.
   */
  setDiscordRichPresenceEnabled(discordRichPresenceEnabled: boolean): void {
    this.settingsStore.setDiscordRichPresenceEnabled(discordRichPresenceEnabled);
  }

  /**
   * Forces Discord Rich Presence to reconnect.
   *
   * @returns Nothing.
   */
  reconnectDiscordRichPresence(): void {
    void this.root.request({ type: "discord.reconnect" });
  }

  /**
   * Updates whether outdated Codex CLI versions can still be used.
   *
   * @param allowOutdatedCodex Whether outdated Codex sources are usable.
   *
   * @deprecated Use `settingsStore.setAllowOutdatedCodex` instead.
   *
   * @returns Nothing.
   */
  setAllowOutdatedCodex(allowOutdatedCodex: boolean): void {
    this.settingsStore.setAllowOutdatedCodex(allowOutdatedCodex);
  }

  /**
   * Updates whether developer-only actions are visible and available.
   *
   * @param developerMode Whether developer mode is enabled.
   *
   * @deprecated Use `settingsStore.setDeveloperMode` instead.
   *
   * @returns Nothing.
   */
  setDeveloperMode(developerMode: boolean): void {
    this.settingsStore.setDeveloperMode(developerMode);
  }

  /**
   * Enables or disables lightweight automatic performance monitoring.
   *
   * @param performanceMonitoringEnabled Whether monitoring is enabled.
   * @deprecated Use `settingsStore.setPerformanceMonitoringEnabled` instead.
   */
  setPerformanceMonitoringEnabled(performanceMonitoringEnabled: boolean): void {
    this.settingsStore.setPerformanceMonitoringEnabled(performanceMonitoringEnabled);
  }

  /**
   * Enables detailed monitoring while developer mode is active.
   *
   * @param advancedPerformanceMonitoringEnabled Whether advanced monitoring is enabled.
   * @deprecated Use `settingsStore.setAdvancedPerformanceMonitoringEnabled` instead.
   */
  setAdvancedPerformanceMonitoringEnabled(
    advancedPerformanceMonitoringEnabled: boolean
  ): void {
    this.settingsStore.setAdvancedPerformanceMonitoringEnabled(advancedPerformanceMonitoringEnabled);
  }

  /**
   * Updates the usage limit displayed as the default account usage.
   *
   * @param defaultUsageLimitId Usage limit identifier, or `null` to use Codex.
   *
   * @deprecated Use `settingsStore.setDefaultUsageLimitId` instead.
   *
   * @returns Nothing.
   */
  setDefaultUsageLimitId(defaultUsageLimitId: string | null): void {
    this.settingsStore.setDefaultUsageLimitId(defaultUsageLimitId);
  }

  /**
   * Updates the default Codex source used when a request omits a source id.
   *
   * @param defaultSourceId Source identifier.
   *
   * @deprecated Use `settingsStore.setDefaultSourceId` instead.
   *
   * @returns Nothing.
   */
  setDefaultSourceId(defaultSourceId: string): void {
    this.settingsStore.setDefaultSourceId(defaultSourceId);
  }

  /**
   * Asks the host application to open the renderer developer tools.
   *
   * @returns Nothing.
   */
  openDeveloperTools(): void {
    void this.root.request({ type: "app.openDevTools" });
  }

  /**
   * Updates the model used for one-shot commit message generation.
   *
   * @param commitMessageModel Model identifier, or `null` for backend default.
   *
   * @returns Nothing.
   */
  setCommitMessageModel(commitMessageModel: string | null): void {
    const currentEffort = this.settings.commitMessageReasoningEffort;
    const commitMessageReasoningEffort = currentEffort === null
      ? null
      : this.resolveReasoningEffort(commitMessageModel, currentEffort);
    this.settingsStore.setCommitMessageModelAndEffort(
      commitMessageModel,
      commitMessageReasoningEffort
    );
  }

  /**
   * Updates the reasoning effort used for one-shot commit message generation.
   *
   * @param commitMessageReasoningEffort Reasoning effort, or `null` for backend default.
   *
   * @deprecated Use `settingsStore.setCommitMessageReasoningEffort` instead.
   *
   * @returns Nothing.
   */
  setCommitMessageReasoningEffort(
    commitMessageReasoningEffort: OpenCodexReasoningEffort | null
  ): void {
    this.settingsStore.setCommitMessageReasoningEffort(commitMessageReasoningEffort);
  }

  /**
   * Updates the output language used for generated commit messages.
   *
   * @param commitMessageLanguage Output language.
   *
   * @deprecated Use `settingsStore.setCommitMessageLanguage` instead.
   *
   * @returns Nothing.
   */
  setCommitMessageLanguage(commitMessageLanguage: OpenCodexCommitMessageLanguage): void {
    this.settingsStore.setCommitMessageLanguage(commitMessageLanguage);
  }

  /**
   * Stores the latest Codex release check returned by the backend.
   *
   * @param codexReleaseCheck Latest release check metadata.
   * @deprecated Use `settingsStore.setCodexReleaseCheck` instead.
   */
  setCodexReleaseCheck(codexReleaseCheck: OpenCodexCodexReleaseCheck): void {
    this.settingsStore.setCodexReleaseCheck(codexReleaseCheck);
  }

}
