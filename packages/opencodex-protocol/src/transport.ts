import type { OpenCodexEvent } from "./events";
import type { OpenCodexRequest } from "./requests";

export interface OpenCodexClientTransport {
  request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse>;
  onEvent(listener: (event: OpenCodexEvent) => void): () => void;
}
