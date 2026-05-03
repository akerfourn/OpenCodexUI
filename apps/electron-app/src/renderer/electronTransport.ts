/**
 * Adapts the preload API to the transport contract expected by the UI store.
 */
import type {
  OpenCodexClientTransport,
  OpenCodexEvent,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

/**
 * Implements the UI transport using the Electron preload bridge.
 */
export class ElectronOpenCodexTransport implements OpenCodexClientTransport {
  /**
   * Sends a request to the Electron main process.
   *
   * @param request Backend request to execute.
   * @returns Promise resolved with the backend response payload.
   */
  request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse> {
    return window.openCodexUI.request<TResponse>(request);
  }

  /**
   * Subscribes to backend events delivered by the Electron preload bridge.
   *
   * @param listener Callback invoked for each backend event.
   * @returns Cleanup function that removes the event subscription.
   */
  onEvent(listener: (event: OpenCodexEvent) => void): () => void {
    return window.openCodexUI.onEvent(listener);
  }
}
