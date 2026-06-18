import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexColorScheme,
  OpenCodexCommitMessageLanguage,
  OpenCodexEnterKeyBehavior,
  OpenCodexEvent,
  OpenCodexLanguage,
  OpenCodexModel,
  OpenCodexModelServiceTier,
  OpenCodexReasoningEffort,
  OpenCodexSettings,
  OpenCodexToolVersionStatus,
  OpenCodexVersioningVocabulary
} from "@open-codex-ui/opencodex-protocol";

import { applyOpenCodexLanguage } from "../i18n/i18n";
import type { RootStore } from "./RootStore";
import type { RootChildStore } from "./RootChildStore";

/**
 * Stores application-wide settings, startup state, and model selection.
 */
export class AppStore implements RootChildStore {
  settings: OpenCodexSettings = {
    codexCommand: "codex",
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
    discordRichPresenceEnabled: true,
    onboardingCompleted: false,
    allowOutdatedCodex: false,
    developerMode: false
  };
  launchProjectPath: string | null = null;
  models: OpenCodexModel[] = [];
  selectedModel: string | null = null;
  reasoningEffort: OpenCodexReasoningEffort = "medium";
  errorMessage: string | null = null;
  connectionStatus = "stopped";
  isBootstrapping = false;
  appVersion: string | null = null;
  gitVersionStatus: OpenCodexToolVersionStatus | null = null;
  isLoadingGitVersion = false;
  forceOnboarding = false;
  forcedOnboardingDismissed = false;

  constructor(private readonly root: RootStore) {
    makeAutoObservable<AppStore, "root">(this, { root: false });
  }

  /**
   * Returns available model choices while preserving the current selection.
   *
   * @returns Model option list.
   */
  get modelOptions(): string[] {
    const options = this.models.map((model) => model.model);

    if (this.selectedModel !== null && !options.includes(this.selectedModel)) {
      options.unshift(this.selectedModel);
    }

    return options;
  }

  /**
   * Returns model choices available for commit message generation.
   *
   * @returns Model option list.
   */
  get commitMessageModelOptions(): string[] {
    const options = this.models.map((model) => model.model);
    const selectedModel = this.settings.commitMessageModel;

    if (selectedModel !== null && !options.includes(selectedModel)) {
      options.unshift(selectedModel);
    }

    return options;
  }

  /**
   * Returns whether the startup onboarding should replace the main shell.
   *
   * @returns Whether onboarding is currently visible.
   */
  get shouldShowOnboarding(): boolean {
    if (this.isBootstrapping) {
      return false;
    }

    if (!this.settings.onboardingCompleted) {
      return true;
    }

    return this.forceOnboarding && !this.forcedOnboardingDismissed;
  }

  /**
   * Forces onboarding display for the current development session.
   *
   * @param forceOnboarding Whether onboarding should appear at startup.
   *
   * @returns Nothing.
   */
  setForceOnboarding(forceOnboarding: boolean): void {
    this.forceOnboarding = forceOnboarding;
  }

  /**
   * Requests initial application state from the backend.
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
   * Applies backend events owned by the application store.
   *
   * @param event Event payload to process.
   *
   * @returns Nothing.
   */
  handleEvent(event: OpenCodexEvent): void {
    switch (event.type) {
      case "connection.status":
        this.connectionStatus = event.status;
        return;
      case "app.bootstrap":
        this.applyBootstrap(event.settings, event.projectPath, event.appVersion);
        return;
      case "projects.updated":
        this.isBootstrapping = false;
        return;
      case "models.updated":
        this.models = event.models;
        this.selectedModel = this.selectedModel ?? event.models[0]?.model ?? null;
        return;
      default:
        return;
    }
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
    if (model === null) {
      return [];
    }

    return this.models.find((entry) => entry.model === model)?.serviceTiers ?? [];
  }

  /**
   * Updates the UI language and persists it through the backend.
   *
   * @param language Language setting to apply.
   *
   * @returns Nothing.
   */
  setLanguage(language: OpenCodexLanguage): void {
    this.settings = { ...this.settings, language };
    applyOpenCodexLanguage(language);
    void this.root.request({
      type: "settings.update",
      patch: { language }
    });
  }

  /**
   * Updates whether active turns can receive steering messages.
   *
   * @param allowTurnSteering Whether steering is enabled.
   *
   * @returns Nothing.
   */
  setAllowTurnSteering(allowTurnSteering: boolean): void {
    this.settings = { ...this.settings, allowTurnSteering };
    void this.root.request({
      type: "settings.update",
      patch: { allowTurnSteering }
    });
  }

  /**
   * Updates the UI color scheme and persists it through the backend.
   *
   * @param colorScheme Color scheme setting to apply.
   *
   * @returns Nothing.
   */
  setColorScheme(colorScheme: OpenCodexColorScheme): void {
    this.settings = { ...this.settings, colorScheme };
    void this.root.request({
      type: "settings.update",
      patch: { colorScheme }
    });
  }

  /**
   * Updates the Enter key behavior used by the chat composer.
   *
   * @param enterKeyBehavior Enter key behavior setting.
   *
   * @returns Nothing.
   */
  setEnterKeyBehavior(enterKeyBehavior: OpenCodexEnterKeyBehavior): void {
    this.settings = { ...this.settings, enterKeyBehavior };
    void this.root.request({
      type: "settings.update",
      patch: { enterKeyBehavior }
    });
  }

  /**
   * Updates the versioning vocabulary used by Git-related UI.
   *
   * @param versioningVocabulary Vocabulary mode.
   *
   * @returns Nothing.
   */
  setVersioningVocabulary(versioningVocabulary: OpenCodexVersioningVocabulary): void {
    this.settings = { ...this.settings, versioningVocabulary };
    void this.root.request({
      type: "settings.update",
      patch: { versioningVocabulary }
    });
  }

  /**
   * Updates Discord Rich Presence usage.
   *
   * @param discordRichPresenceEnabled Whether Discord Rich Presence is enabled.
   *
   * @returns Nothing.
   */
  setDiscordRichPresenceEnabled(discordRichPresenceEnabled: boolean): void {
    this.settings = { ...this.settings, discordRichPresenceEnabled };
    void this.root.request({
      type: "settings.update",
      patch: { discordRichPresenceEnabled }
    });
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
   * @returns Nothing.
   */
  setAllowOutdatedCodex(allowOutdatedCodex: boolean): void {
    this.settings = { ...this.settings, allowOutdatedCodex };
    void this.root.request({
      type: "settings.update",
      patch: { allowOutdatedCodex }
    });
  }

  /**
   * Updates whether developer-only actions are visible and available.
   *
   * @param developerMode Whether developer mode is enabled.
   *
   * @returns Nothing.
   */
  setDeveloperMode(developerMode: boolean): void {
    this.settings = { ...this.settings, developerMode };
    void this.root.request({
      type: "settings.update",
      patch: { developerMode }
    });
  }

  /**
   * Updates the usage limit displayed as the default account usage.
   *
   * @param defaultUsageLimitId Usage limit identifier, or `null` to use Codex.
   *
   * @returns Nothing.
   */
  setDefaultUsageLimitId(defaultUsageLimitId: string | null): void {
    this.settings = { ...this.settings, defaultUsageLimitId };
    void this.root.request({
      type: "settings.update",
      patch: { defaultUsageLimitId }
    });
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
   * Marks onboarding as completed and hides forced onboarding for this session.
   *
   * @returns Nothing.
   */
  completeOnboarding(): void {
    this.forcedOnboardingDismissed = true;
    this.settings = {
      ...this.settings,
      onboardingCompleted: true
    };

    void this.root.request({
      type: "settings.update",
      patch: { onboardingCompleted: true }
    });
  }

  /**
   * Updates the model used for one-shot commit message generation.
   *
   * @param commitMessageModel Model identifier, or `null` for backend default.
   *
   * @returns Nothing.
   */
  setCommitMessageModel(commitMessageModel: string | null): void {
    this.settings = { ...this.settings, commitMessageModel };
    void this.root.request({
      type: "settings.update",
      patch: { commitMessageModel }
    });
  }

  /**
   * Updates the reasoning effort used for one-shot commit message generation.
   *
   * @param commitMessageReasoningEffort Reasoning effort, or `null` for backend default.
   *
   * @returns Nothing.
   */
  setCommitMessageReasoningEffort(
    commitMessageReasoningEffort: OpenCodexReasoningEffort | null
  ): void {
    this.settings = { ...this.settings, commitMessageReasoningEffort };
    void this.root.request({
      type: "settings.update",
      patch: { commitMessageReasoningEffort }
    });
  }

  /**
   * Updates the output language used for generated commit messages.
   *
   * @param commitMessageLanguage Output language.
   *
   * @returns Nothing.
   */
  setCommitMessageLanguage(commitMessageLanguage: OpenCodexCommitMessageLanguage): void {
    this.settings = { ...this.settings, commitMessageLanguage };
    void this.root.request({
      type: "settings.update",
      patch: { commitMessageLanguage }
    });
  }

  private applyBootstrap(
    settings: OpenCodexSettings,
    launchProjectPath: string | null,
    appVersion: string | null
  ): void {
    this.settings = {
      ...this.settings,
      ...settings
    };
    this.launchProjectPath = launchProjectPath;
    this.selectedModel = settings.defaultModel;
    this.reasoningEffort = settings.defaultReasoningEffort ?? "medium";
    this.appVersion = appVersion;
    applyOpenCodexLanguage(settings.language);
  }
}
