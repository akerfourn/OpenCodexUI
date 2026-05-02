import type { OpenCodexEvent, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";

export type OpenCodexBackendOptions = {
  settings: OpenCodexSettings;
  projectPath: string | null;
  cacheRepository?: OpenCodexCacheRepository | null;
  emit(event: OpenCodexEvent): void;
  saveSettings?(settings: OpenCodexSettings): Promise<void> | void;
  openExternalLink?(href: string): Promise<void> | void;
  logger?: (message: string) => void;
};
