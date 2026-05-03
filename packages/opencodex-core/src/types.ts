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
 *
 * @returns Promise resolved with the requested result.
 */
openExternalLink?(href: string): Promise<void> | void;
  logger?: (message: string) => void;
};
