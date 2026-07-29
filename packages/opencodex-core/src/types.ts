/**
 * Declares the dependencies required to build the OpenCodex backend service.
 */
import type {
  OpenCodexEvent,
  OpenCodexImageAttachment,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";

export type OpenCodexBackendOptions = {
  settings: OpenCodexSettings;
  projectPath: string | null;
  appVersion?: string | null;
  cacheRepository?: OpenCodexCacheRepository | null;
  userDataPath?: string;
  defaultCommitPromptPath?: string;
  generationCommitPromptPath?: string;
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
  openExternalLink?(
    href: string,
    projectPath: string | null,
    openerCommand: string | null
  ): Promise<void> | void;
  /**
   * Opens a local project folder with the host file manager.
   *
   * @param projectPath Project folder path.
   * @returns Promise resolved after the host action is requested.
   */
  openProjectFolder?(projectPath: string): Promise<void> | void;
  /**
   * Opens a host terminal with a local project as its working directory.
   *
   * @param projectPath Project folder path.
   * @returns Promise resolved after the host action is requested.
   */
  openProjectTerminal?(projectPath: string): Promise<void> | void;
  /**
   * Lets the host application pick a project directory.
   *
   * @param mode Picker mode requested by the UI.
   *
   * @returns Selected project path, or `null` when cancelled.
   */
  pickProjectDirectory?(mode: "open" | "create"): Promise<string | null> | string | null;
  /**
   * Lets the host application pick image files.
   *
   * @returns Selected image paths, or an empty array when cancelled.
   */
  pickImageFiles?(): Promise<OpenCodexImageAttachment[]> | OpenCodexImageAttachment[];
  /**
   * Lets the host application pick a local executable.
   *
   * @returns Selected executable path, or `null` when cancelled.
   */
  pickExecutableFile?(): Promise<string | null> | string | null;
  /**
   * Validates or creates a project directory on the host filesystem.
   *
   * @param projectPath User-provided project path.
   * @param createIfMissing Whether missing folders should be created.
   *
   * @returns Normalized project path.
   */
  ensureProjectDirectory?(projectPath: string, createIfMissing: boolean): Promise<string> | string;
  /**
   * Reports content-free throughput metadata for a raw Codex notification.
   *
   * @param method Codex notification method.
   * @param estimatedBytes Approximate size of known streamed string fields.
   */
  onCodexNotificationReceived?(method: string, estimatedBytes: number): void;
  /**
   * Reports the synchronous cost of a normalized Codex notification.
   *
   * Batched notifications invoke this callback when their deferred payload is
   * actually processed, rather than when the raw fragment is enqueued.
   *
   * @param method Codex notification method.
   * @param durationMs Synchronous notification processing duration.
   */
  onCodexNotificationProcessed?(method: string, durationMs: number): void;
  /**
   * Reports advanced timing for the live-turn cache portion of a notification.
   *
   * @param method Codex notification method.
   * @param durationMs Synchronous live-cache processing duration.
   */
  onLiveCacheNotificationProcessed?(method: string, durationMs: number): void;
  logger?: (message: string) => void;
};
