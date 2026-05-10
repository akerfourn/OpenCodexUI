/**
 * Owns Codex app-server clients per source.
 */
import {
  CodexAppServerClient,
  type CodexNotification,
  type CodexServerRequest
} from "@open-codex-ui/codex-rpc";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexEvent, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";

import { resolveSourceCommand } from "./sourceMapping.js";

export type OpenCodexClientPoolOptions = {
  getSettings(): OpenCodexSettings;
  resolveSource(sourceId: string | null): Promise<CachedSource>;
  emit(event: OpenCodexEvent): void;
  logger?(message: string): void;
  handleNotification(notification: CodexNotification, sourceId: string): void;
  handleServerRequest(request: CodexServerRequest, sourceId: string): void;
  handleError(error: Error): void;
  handleClose(sourceId: string): void;
  handleStderr(message: string, sourceId: string): void;
};

/**
 * Manages the lifecycle of source-scoped Codex clients.
 */
export class OpenCodexClientPool {
  private readonly clientsBySourceId = new Map<string, CodexAppServerClient>();

  constructor(private readonly options: OpenCodexClientPoolOptions) {}

  /**
   * Stops all known clients and clears the pool.
   *
   * @returns Promise resolved when clients are stopped.
   */
  async dispose(): Promise<void> {
    await Promise.all(Array.from(this.clientsBySourceId.values()).map((client) => client.stop()));
    this.clientsBySourceId.clear();
  }

  /**
   * Returns an existing client or starts one for the requested source.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   *
   * @returns Started Codex app-server client.
   */
  async ensureClient(sourceId: string | null = this.options.getSettings().defaultSourceId): Promise<CodexAppServerClient> {
    const source = await this.options.resolveSource(sourceId);
    const existingClient = this.clientsBySourceId.get(source.id);

    if (existingClient !== undefined) {
      return existingClient;
    }

    this.options.emit({ type: "connection.status", status: "starting" });

    const settings = this.options.getSettings();
    const client = new CodexAppServerClient({
      command: resolveSourceCommand(source, settings.codexCommand),
      experimentalApi: settings.experimentalApi,
      logger: (message) => this.options.logger?.(message),
      stderr: (message) => this.options.handleStderr(message, source.id)
    });

    this.clientsBySourceId.set(source.id, client);
    client.onNotification((notification) => this.options.handleNotification(notification, source.id));
    client.onServerRequest((request) => this.options.handleServerRequest(request, source.id));
    client.onError((error) => this.options.handleError(error));
    client.onClose(() => this.options.handleClose(source.id));

    await client.start();
    this.options.emit({ type: "connection.status", status: "ready" });
    return client;
  }

  /**
   * Returns a started client by source identifier.
   *
   * @param sourceId Source identifier.
   *
   * @returns Matching client, or `undefined`.
   */
  getClient(sourceId: string): CodexAppServerClient | undefined {
    return this.clientsBySourceId.get(sourceId);
  }

  /**
   * Returns whether the pool currently owns any clients.
   *
   * @returns `true` when at least one client exists.
   */
  hasClients(): boolean {
    return this.clientsBySourceId.size > 0;
  }

  /**
   * Removes a client reference without stopping it.
   *
   * @param sourceId Source identifier.
   *
   * @returns Nothing.
   */
  deleteClient(sourceId: string): void {
    this.clientsBySourceId.delete(sourceId);
  }

  /**
   * Stops and recreates a source client.
   *
   * @param sourceId Source identifier.
   *
   * @returns Promise resolved when the new client is ready.
   */
  async restartClient(sourceId: string): Promise<void> {
    const client = this.clientsBySourceId.get(sourceId);

    if (client !== undefined) {
      await client.stop();
      this.clientsBySourceId.delete(sourceId);
    }

    await this.ensureClient(sourceId);
  }
}
