import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";

import type { RuntimeSettingsPort } from "./runtimePorts.js";

/** Stores the mutable settings snapshot shared by backend runtime services. */
export class RuntimeSettingsStore implements RuntimeSettingsPort {
  /** Current settings snapshot. */
  private settings: OpenCodexSettings;

  /**
   * Creates a settings store.
   *
   * @param initialSettings Initial settings snapshot.
   */
  constructor(initialSettings: OpenCodexSettings) {
    this.settings = initialSettings;
  }

  /**
   * Reads the current settings snapshot.
   *
   * @returns Current settings.
   */
  getSettings(): OpenCodexSettings {
    return this.settings;
  }

  /**
   * Replaces the current settings snapshot.
   *
   * @param settings New settings snapshot.
   * @returns Nothing.
   */
  setSettings(settings: OpenCodexSettings): void {
    this.settings = settings;
  }
}
