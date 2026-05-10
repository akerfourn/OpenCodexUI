import type { OpenCodexEvent } from "@open-codex-ui/opencodex-protocol";

export type RootChildStore = {
  handleEvent?(event: OpenCodexEvent): void;
};
