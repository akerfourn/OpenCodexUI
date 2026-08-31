/**
 * Declares the transport contract used by the OpenCodex UI store.
 */
import type { OpenCodexEvent } from "./events";
import type { OpenCodexRequest } from "./requests";

/** Content-free renderer state used by the native application lifecycle. */
export type OpenCodexRendererActivityState = {
  hasPendingProjectActivity: boolean;
};

/** State displayed by the renderer before the native application closes. */
export type OpenCodexApplicationCloseRequest = {
  hasActiveTurns: boolean;
  hasPendingProjectActivity: boolean;
};

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
  /**
   * Reports renderer activity that cannot be queried from the native main process.
   *
   * @param state Content-free activity state.
   */
  reportApplicationActivity?(state: OpenCodexRendererActivityState): void;
  /**
   * Subscribes to close requests initiated by the native application host.
   *
   * @param listener Callback invoked with the current close context.
   * @returns Cleanup callback that removes the close-request subscription.
   */
  onApplicationCloseRequested?(
    listener: (request: OpenCodexApplicationCloseRequest) => void
  ): () => void;
  /**
   * Sends the renderer's close-confirmation response to the native host.
   *
   * @param shouldClose Whether the application may close.
   */
  respondToApplicationClose?(shouldClose: boolean): void;
}
