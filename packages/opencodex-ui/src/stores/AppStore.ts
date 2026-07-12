import { makeAutoObservable, runInAction } from "mobx";

import { DEFAULT_OPEN_CODEX_REASONING_EFFORTS } from "@open-codex-ui/opencodex-protocol";

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
  warningMessage: string | null = null;
  connectionStatus = "stopped";
  isBootstrapping = false;
  appVersion: string | null = null;
  gitVersionStatus: OpenCodexToolVersionStatus | null = null;
  isLoadingGitVersion = false;
  forceOnboarding = false;
  forcedOnboardingDismissed = false;

  /**
   * Creates the application store.
   *
   * @param root Root store used for backend requests and cross-store updates.
   */
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
    if (model === null) {
      return [];
    }

    return this.models.find((entry) => entry.model === model)?.serviceTiers ?? [];
  }

  /**
   * Returns reasoning efforts supported by the selected model.
   *
   * @param model Model identifier, or `null` for the current default.
   * @returns Model-specific efforts, or conservative fallback efforts.
   */
  getReasoningEffortOptions(model: string | null): OpenCodexReasoningEffortOption[] {
    const modelEntry = this.findModel(model);

    if (modelEntry !== undefined && modelEntry.supportedReasoningEfforts.length > 0) {
      return modelEntry.supportedReasoningEfforts;
    }

    return DEFAULT_OPEN_CODEX_REASONING_EFFORTS.map((reasoningEffort) => ({
      reasoningEffort,
      description: ""
    }));
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
    const options = this.getReasoningEffortOptions(model);

    if (options.some((option) => option.reasoningEffort === reasoningEffort)) {
      return reasoningEffort;
    }

    const modelEntry = this.findModel(model);
    const defaultReasoningEffort = modelEntry?.defaultReasoningEffort;

    if (
      defaultReasoningEffort !== null &&
      defaultReasoningEffort !== undefined &&
      options.some((option) => option.reasoningEffort === defaultReasoningEffort)
    ) {
      return defaultReasoningEffort;
    }

    return options[0]?.reasoningEffort ?? "medium";
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
   * Updates the default Codex source used when a request omits a source id.
   *
   * @param defaultSourceId Source identifier.
   *
   * @returns Nothing.
   */
  setDefaultSourceId(defaultSourceId: string): void {
    this.settings = { ...this.settings, defaultSourceId };
    void this.root.request({
      type: "settings.update",
      patch: { defaultSourceId }
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
    const currentEffort = this.settings.commitMessageReasoningEffort;
    const commitMessageReasoningEffort = currentEffort === null
      ? null
      : this.resolveReasoningEffort(commitMessageModel, currentEffort);
    this.settings = {
      ...this.settings,
      commitMessageModel,
      commitMessageReasoningEffort
    };
    void this.root.request({
      type: "settings.update",
      patch: { commitMessageModel, commitMessageReasoningEffort }
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

  /**
   * Stores the latest Codex release check returned by the backend.
   *
   * @param codexReleaseCheck Latest release check metadata.
   */
  setCodexReleaseCheck(codexReleaseCheck: OpenCodexCodexReleaseCheck): void {
    this.settings = {
      ...this.settings,
      codexReleaseCheck
    };
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

  /**
   * Finds a model using the explicit selection or the current default.
   *
   * @param model Model identifier, or `null` for the current default.
   * @returns Matching model metadata, or `undefined`.
   */
  private findModel(model: string | null): OpenCodexModel | undefined {
    const modelId = model
      ?? this.selectedModel
      ?? this.settings.defaultModel
      ?? this.models[0]?.model
      ?? null;

    if (modelId === null) {
      return undefined;
    }

    return this.models.find((entry) => entry.model === modelId || entry.id === modelId);
  }
}
