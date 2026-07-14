import type {
  OpenCodexEvent,
  OpenCodexRendererPerformanceSample,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

declare global {
  interface Window {
    openCodexUI: {
      request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse>;
      reportPerformanceSample(sample: OpenCodexRendererPerformanceSample): void;
      onEvent(listener: (event: OpenCodexEvent) => void): () => void;
    };
  }
}
