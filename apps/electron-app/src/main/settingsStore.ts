import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";

export const defaultSettings: OpenCodexSettings = {
  codexCommand: "codex",
  defaultModel: null,
  defaultReasoningEffort: "medium",
  showActivityPanel: true,
  experimentalApi: true,
  language: "system"
};

export class SettingsStore {
  private readonly settingsPath: string;

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, "settings.json");
  }

  async load(): Promise<OpenCodexSettings> {
    try {
      const content = await readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(content) as Partial<OpenCodexSettings>;
      return { ...defaultSettings, ...parsed };
    } catch {
      return defaultSettings;
    }
  }

  async save(settings: OpenCodexSettings): Promise<void> {
    await mkdir(path.dirname(this.settingsPath), { recursive: true });
    await writeFile(this.settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }
}
