import type { OpenCodexEvent, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";

export type OpenCodexBackendOptions = {
  settings: OpenCodexSettings;
  projectPath: string | null;
  emit(event: OpenCodexEvent): void;
  saveSettings?(settings: OpenCodexSettings): Promise<void> | void;
  logger?: (message: string) => void;
};
