/**
 * Persists OpenCodexUI settings inside Electron's user data directory.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";

/**
 * Default settings applied when no user configuration has been saved yet.
 */
export const defaultSettings: OpenCodexSettings = {
  codexCommand: "codex",
  defaultSourceId: null,
  defaultModel: null,
  defaultReasoningEffort: "medium",
  showActivityPanel: true,
  experimentalApi: true,
  allowTurnSteering: false,
  language: "system",
  colorScheme: "system"
};

/**
 * Loads and saves the desktop application's persisted settings file.
 */
export class SettingsStore {
  private readonly settingsPath: string;

  /**
   * Creates a settings store rooted in the Electron user data directory.
   *
   * @param userDataPath Electron user data directory for the current profile.
   */
  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, "settings.json");
  }

  /**
   * Reads persisted settings and merges them with the application defaults.
   *
   * @returns Promise resolved with the effective settings object.
   */
  async load(): Promise<OpenCodexSettings> {
    try {
      const content = await readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(content) as Partial<OpenCodexSettings>;
      return { ...defaultSettings, ...parsed };
    } catch {
      return defaultSettings;
    }
  }

  /**
   * Persists the provided settings to disk.
   *
   * @param settings Settings snapshot to store.
   * @returns Promise resolved once the settings file has been written.
   */
  async save(settings: OpenCodexSettings): Promise<void> {
    await mkdir(path.dirname(this.settingsPath), { recursive: true });
    await writeFile(this.settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }
}
