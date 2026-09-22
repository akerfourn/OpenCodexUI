import { makeAutoObservable, runInAction } from "mobx";
import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import type { AppSettingsRequestPort } from "../app/AppSettingsStore";
import { fileLanguages } from "../../features/fileLanguages/catalogue";

interface LanguageSettingsPort extends AppSettingsRequestPort {
  settings: OpenCodexSettings;
}

/** Persists language preferences without loading the editor or its grammars. */
export class FileLanguagesStore {
  /** Prevents overlapping whole-list preference updates. */
  saving = false;
  /** Failed persistence leaves the previous selection active. */
  error: string | null = null;

  /** Uses the application's existing settings JSON transport. */
  constructor(private readonly root: LanguageSettingsPort) {
    makeAutoObservable(this);
  }

  /** Absent preferences enable the bundled catalogue for existing installations. */
  get disabled(): string[] {
    return this.root.settings.disabledFileLanguages ?? [];
  }

  /** Reports whether a canonical language may color file documents. */
  isEnabled(id: string): boolean {
    return !this.disabled.includes(id);
  }

  /** Updates the UI only after the backend confirms persistence. */
  async setEnabled(id: string, enabled: boolean): Promise<void> {
    if (this.saving || !fileLanguages.some(language => language.id === id)) return;
    this.saving = true;
    this.error = null;
    const disabled = new Set(this.disabled);
    if (enabled) disabled.delete(id);
    else disabled.add(id);
    try {
      const saved = await this.root.request<OpenCodexSettings>({
        type: "settings.update", patch: { disabledFileLanguages: [...disabled].sort() }
      });
      runInAction(() => {
        this.root.settings = { ...this.root.settings, disabledFileLanguages: [...saved.disabledFileLanguages ?? []] };
      });
    } catch (error) {
      runInAction(() => { this.error = String(error); });
    } finally {
      runInAction(() => { this.saving = false; });
    }
  }
}
