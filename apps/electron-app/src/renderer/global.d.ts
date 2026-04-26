import type { OpenCodexEvent, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";

declare global {
  interface Window {
    openCodexUI: {
      request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse>;
      onEvent(listener: (event: OpenCodexEvent) => void): () => void;
    };
  }
}
