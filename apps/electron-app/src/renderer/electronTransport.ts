/**
 * Adapts the preload API to the transport contract expected by the UI store.
 */
import type {
  OpenCodexClientTransport,
  OpenCodexEvent,
  OpenCodexRendererActivityState,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

import type { RendererPerformanceMonitor } from "./rendererPerformanceMonitor";

/**
 * Implements the UI transport using the Electron preload bridge.
 */
export class ElectronOpenCodexTransport implements OpenCodexClientTransport {
  private performanceMonitor: RendererPerformanceMonitor | null = null;

  /**
   * Attaches the optional renderer performance monitor.
   *
   * @param performanceMonitor Monitor receiving event processing durations.
   */
  setPerformanceMonitor(performanceMonitor: RendererPerformanceMonitor): void {
    this.performanceMonitor = performanceMonitor;
  }

  /**
   * Sends a request to the Electron main process.
   *
   * @param request Backend request to execute.
   * @returns Promise resolved with the backend response payload.
   */
  async request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse> {
    const startedAt = performance.now();

    try {
      return await window.openCodexUI.request<TResponse>(request);
    } finally {
      this.performanceMonitor?.recordRequest(request.type, performance.now() - startedAt);
    }
  }

  /** Reports content-free UI activity to the native application host. */
  reportApplicationActivity(state: OpenCodexRendererActivityState): void {
    window.openCodexUI.reportApplicationActivity(state);
  }

  /**
   * Subscribes to backend events delivered by the Electron preload bridge.
   *
   * @param listener Callback invoked for each backend event.
   * @returns Cleanup function that removes the event subscription.
   */
  onEvent(listener: (event: OpenCodexEvent) => void): () => void {
    return window.openCodexUI.onEvent((event) => {
      const startedAt = performance.now();

      try {
        listener(event);
      } finally {
        this.performanceMonitor?.recordEvent(event, performance.now() - startedAt);
      }
    });
  }
}
