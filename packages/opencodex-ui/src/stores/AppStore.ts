import { makeAutoObservable } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexLanguage,
  OpenCodexReasoningEffort,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import { applyOpenCodexLanguage } from "../i18n/i18n";
import type { RootStore } from "./RootStore";
import type { RootChildStore } from "./RootChildStore";

export class AppStore implements RootChildStore {
  settings: OpenCodexSettings = {
    codexCommand: "codex",
    defaultSourceId: null,
    defaultModel: null,
    defaultReasoningEffort: "medium",
    showActivityPanel: true,
    experimentalApi: true,
    language: "system"
  };
  launchProjectPath: string | null = null;
  models: string[] = [];
  selectedModel: string | null = null;
  reasoningEffort: OpenCodexReasoningEffort = "medium";
  errorMessage: string | null = null;
  connectionStatus = "stopped";
  isBootstrapping = false;

  constructor(private readonly root: RootStore) {
    makeAutoObservable<AppStore, "root">(this, { root: false });
  }

  get modelOptions(): string[] {
    const options = [...this.models];

    if (this.selectedModel !== null && !options.includes(this.selectedModel)) {
      options.unshift(this.selectedModel);
    }

    return options;
  }

  async bootstrap(): Promise<void> {
    this.isBootstrapping = true;

    try {
      await this.root.request({ type: "app.bootstrap" });
    } catch {
      this.isBootstrapping = false;
    }
  }

  handleEvent(event: OpenCodexEvent): void {
    switch (event.type) {
      case "connection.status":
        this.connectionStatus = event.status;
        return;
      case "app.bootstrap":
        this.applyBootstrap(event.settings, event.projectPath);
        return;
      case "projects.updated":
        this.isBootstrapping = false;
        return;
      case "models.updated":
        this.models = event.models;
        this.selectedModel = this.selectedModel ?? event.models[0] ?? null;
        return;
      default:
        return;
    }
  }

  applyError(event: Extract<OpenCodexEvent, { type: "error" }>): void {
    this.errorMessage = event.details === undefined
      ? event.message
      : `${event.message}\n${JSON.stringify(event.details, null, 2)}`;
  }

  setSelectedModel(value: string | null): void {
    this.selectedModel = value;
  }

  setReasoningEffort(value: OpenCodexReasoningEffort): void {
    this.reasoningEffort = value;
  }

  setLanguage(language: OpenCodexLanguage): void {
    this.settings = { ...this.settings, language };
    applyOpenCodexLanguage(language);
    void this.root.request({
      type: "settings.update",
      patch: { language }
    });
  }

  private applyBootstrap(settings: OpenCodexSettings, launchProjectPath: string | null): void {
    this.settings = settings;
    this.launchProjectPath = launchProjectPath;
    this.selectedModel = settings.defaultModel;
    this.reasoningEffort = settings.defaultReasoningEffort ?? "medium";
    applyOpenCodexLanguage(settings.language);
  }
}
