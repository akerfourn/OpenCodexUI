import type {
  OpenCodexClientTransport,
  OpenCodexEvent,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

export class ElectronOpenCodexTransport implements OpenCodexClientTransport {
  request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse> {
    return window.openCodexUI.request<TResponse>(request);
  }

  onEvent(listener: (event: OpenCodexEvent) => void): () => void {
    return window.openCodexUI.onEvent(listener);
  }
}
