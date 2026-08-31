import type {
  OpenCodexApplicationCloseRequest,
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
      onApplicationCloseRequested(
        listener: (request: OpenCodexApplicationCloseRequest) => void
      ): () => void;
      respondToApplicationClose(shouldClose: boolean): void;
      onEvent(listener: (event: OpenCodexEvent) => void): () => void;
    };
  }
}
