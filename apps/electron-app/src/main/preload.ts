import { contextBridge, ipcRenderer } from "electron";

import type { OpenCodexEvent, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";

contextBridge.exposeInMainWorld("openCodexUI", {
  request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse> {
    return ipcRenderer.invoke("opencodex:request", request) as Promise<TResponse>;
  },
  onEvent(listener: (event: OpenCodexEvent) => void): () => void {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: OpenCodexEvent): void => {
      listener(payload);
    };

    ipcRenderer.on("opencodex:event", wrappedListener);
    return () => ipcRenderer.off("opencodex:event", wrappedListener);
  }
});
