import type {
  OpenCodexEvent,
  OpenCodexRendererActivityState,
  OpenCodexRendererPerformanceSample,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

declare global {
  interface Window {
    openCodexUI: {
      request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse>;
      reportPerformanceSample(sample: OpenCodexRendererPerformanceSample): void;
      reportApplicationActivity(state: OpenCodexRendererActivityState): void;
      onEvent(listener: (event: OpenCodexEvent) => void): () => void;
    };
  }
}
