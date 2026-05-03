/**
 * Declares the transport contract used by the OpenCodex UI store.
 */
import type { OpenCodexEvent } from "./events";
import type { OpenCodexRequest } from "./requests";

export interface OpenCodexClientTransport {
  /**
   * Sends a backend request through the transport.
   *
   * @param request Request payload.
   *
   * @returns Promise resolved with the transport response.
   */
  request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse>;
  /**
   * Subscribes to backend events emitted through the transport.
   *
   * @param listener Callback invoked for each emitted backend event.
   *
   * @returns Cleanup callback that removes the event subscription.
   */
  onEvent(listener: (event: OpenCodexEvent) => void): () => void;
}
