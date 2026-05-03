/**
 * Exposes a safe renderer API for sending requests to the Electron main process.
 */
import { contextBridge, ipcRenderer } from "electron";

import type { OpenCodexEvent, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";

contextBridge.exposeInMainWorld("openCodexUI", {
  /**
   * Sends a backend request through the Electron IPC bridge.
   *
   * @param request Request payload forwarded to the main process.
   * @returns Promise resolved with the backend response.
   */
  request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse> {
    return ipcRenderer.invoke("opencodex:request", request) as Promise<TResponse>;
  },
  /**
   * Subscribes to backend events emitted by the main process.
   *
   * @param listener Callback invoked for each backend event.
   * @returns Cleanup function that removes the IPC listener.
   */
  onEvent(listener: (event: OpenCodexEvent) => void): () => void {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: OpenCodexEvent): void => {
      listener(payload);
    };

    ipcRenderer.on("opencodex:event", wrappedListener);
    return () => ipcRenderer.off("opencodex:event", wrappedListener);
  }
});
