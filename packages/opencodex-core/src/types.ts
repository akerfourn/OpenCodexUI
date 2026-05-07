/**
 * Declares the dependencies required to build the OpenCodex backend service.
 */
import type { OpenCodexEvent, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";

export type OpenCodexBackendOptions = {
  settings: OpenCodexSettings;
  projectPath: string | null;
  cacheRepository?: OpenCodexCacheRepository | null;
  /**
   * Emits a backend event to the UI transport.
   *
   * @param event Event payload to apply or inspect.
   *
   * @returns Nothing.
   */
  emit(event: OpenCodexEvent): void;
  /**
   * Saves settings.
   *
   * @param settings Settings.
   *
   * @returns Promise resolved with the requested result.
   */
  saveSettings?(settings: OpenCodexSettings): Promise<void> | void;
  /**
   * Requests opening of an external link.
   *
   * @param href Link target to open.
   * @param projectPath Project path used to resolve relative links.
   *
   * @returns Promise resolved with the requested result.
   */
  openExternalLink?(href: string, projectPath: string | null): Promise<void> | void;
  /**
   * Lets the host application pick a project directory.
   *
   * @param mode Picker mode requested by the UI.
   *
   * @returns Selected project path, or `null` when cancelled.
   */
  pickProjectDirectory?(mode: "open" | "create"): Promise<string | null> | string | null;
  /**
   * Validates or creates a project directory before opening it.
   *
   * @param projectPath User-provided project path.
   * @param createIfMissing Whether missing folders should be created.
   *
   * @returns Normalized project path.
   */
  ensureProjectDirectory?(projectPath: string, createIfMissing: boolean): Promise<string> | string;
  logger?: (message: string) => void;
};
