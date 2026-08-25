import { action, computed, makeObservable, observable, override } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexModel,
  OpenCodexModelServiceTier,
  OpenCodexReasoningEffortOption,
  OpenCodexReasoningEffort
} from "@open-codex-ui/opencodex-protocol";

import {
  getCommitMessageModelOptions,
  getModelOptions,
  getReasoningEffortOptions,
  getServiceTierOptions,
  resolveReasoningEffort
} from "./modelSelection";
import { AppOnboardingStore } from "./AppOnboardingStore";
import type { RootStore } from "../RootStore";
import type { RootChildStore } from "../RootChildStore";

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
      reconnectDiscordRichPresence: action,
      openDeveloperTools: action,
      setCommitMessageModel: action
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
    return getCommitMessageModelOptions(
      this.models,
      this.settingsStore.settings.commitMessageModel
    );
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
      this.settingsStore.settings.defaultModel
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
      this.settingsStore.settings.defaultModel,
      reasoningEffort
    );
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
    const currentEffort = this.settingsStore.settings.commitMessageReasoningEffort;
    const commitMessageReasoningEffort = currentEffort === null
      ? null
      : this.resolveReasoningEffort(commitMessageModel, currentEffort);
    this.settingsStore.setCommitMessageModelAndEffort(
      commitMessageModel,
      commitMessageReasoningEffort
    );
  }

}
