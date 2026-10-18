import {
  CodexAppServerClient,
  type CodexAppServerClientOptions,
  type CodexNotification,
  type CodexServerRequest
} from "@open-codex-ui/codex-rpc";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import type { SourceInstanceSnapshot } from "@open-codex-ui/opencodex-protocol";
import { resolveSourceCommand } from "../sources/sourceMapping.js";
import type { RuntimeEventPort, RuntimeSettingsPort } from "./runtimePorts.js";

export interface OpenCodexClientPoolOptions {
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  appVersion: string | null;
  resolveSource(sourceId: string | null): Promise<CachedSource>;
  events: Pick<RuntimeEventPort, "emit">;
  logger?(message: string): void;
  handleNotification(notification: CodexNotification, sourceId: string): void;
  handleServerRequest(request: CodexServerRequest, sourceId: string): void;
  handleError(error: Error): void;
  handleClose(sourceId: string): void;
  handleStderr(message: string, sourceId: string): void;
  /** Allows transport fixtures without mocking source lifecycle behavior. */
  createClient?(options: CodexAppServerClientOptions): CodexAppServerClient;
}

/** Owns one main app-server per source, including lifecycle transitions and manual suspension. */
export class OpenCodexClientPool {
  /** Clients are retained through shutdown until their process exit is confirmed. */
  private readonly clientsBySourceId = new Map<string, CodexAppServerClient>();
  /** Concurrent first requests share the same initialization promise. */
  private readonly starts = new Map<string, Promise<CodexAppServerClient>>();
  /** Duplicate shutdown requests share a single termination operation. */
  private readonly stops = new Map<string, Promise<void>>();
  /** Last content-free snapshot emitted for each source. */
  private readonly states = new Map<string, SourceInstanceSnapshot>();
  /** Background reads cannot resurrect a source explicitly stopped by the user. */
  private readonly manuallyStopped = new Set<string>();
  /** Update ownership blocks background reconnection and conflicting lifecycle actions. */
  private readonly updatingSources = new Set<string>();
  /** Application shutdown prevents late requests from creating new processes. */
  private disposed = false;

  /** Uses explicit source resolution and process callbacks supplied by the runtime. */
  constructor(private readonly options: OpenCodexClientPoolOptions) {}

  /** Waits for all owned processes to exit before releasing the pool. */
  async dispose(): Promise<void> {
    this.disposed = true;
    await Promise.all([...this.clientsBySourceId.keys()].map(id => this.stopOwnedClient(id, true, false)));
  }

  /** Reads a snapshot without starting a client or probing an executable. */
  readState(sourceId: string): SourceInstanceSnapshot {
    const state = this.states.get(sourceId);
    if (state !== undefined) {
      const snapshot = { ...state };
      if (state.activity !== undefined) {
        snapshot.activity = { ...state.activity, requestMethods: [...state.activity.requestMethods] };
      }
      return snapshot;
    }
    return {
      sourceId,
      phase: "stopped",
      isActive: false,
      manuallyStopped: this.manuallyStopped.has(sourceId),
      error: null
    };
  }

  /** Returns a ready source client, sharing initialization but respecting manual suspension. */
  async ensureClient(
    sourceId: string | null = this.options.settings.getSettings().defaultSourceId
  ): Promise<CodexAppServerClient> {
    if (this.disposed) throw new Error("Codex client pool is shutting down.");
    const source = await this.options.resolveSource(sourceId);
    if (this.disposed) throw new Error("Codex client pool is shutting down.");
    this.requireNotUpdating(source.id);
    if (this.manuallyStopped.has(source.id)) throw new Error("SOURCE_STOPPED: Start this source from Home → Sources.");
    if (this.stops.has(source.id) || this.readState(source.id).phase === "stopping") {
      throw new Error("The Codex source is stopping. Wait before retrying.");
    }
    const starting = this.starts.get(source.id);
    if (starting !== undefined) return await starting;
    const existing = this.clientsBySourceId.get(source.id);
    if (existing !== undefined) return existing;
    const operation = this.launch(source);
    this.starts.set(source.id, operation);
    try {
      return await operation;
    } finally {
      if (this.starts.get(source.id) === operation) this.starts.delete(source.id);
    }
  }

  /** Explicitly resumes a source after a user-requested stop. */
  async startClient(sourceId: string): Promise<void> {
    this.requireNotUpdating(sourceId);
    if (this.stops.has(sourceId)) throw new Error("Wait for the source to finish stopping.");
    this.manuallyStopped.delete(sourceId);
    await this.ensureClient(sourceId);
  }

  /** Reads an existing connection without creating one. */
  getClient(sourceId: string): CodexAppServerClient | undefined {
    return this.clientsBySourceId.get(sourceId);
  }

  /** Whether any owned process or initialization remains in the pool. */
  hasClients(): boolean {
    return this.clientsBySourceId.size > 0;
  }

  /** Removes a confirmed closed connection and updates its source-specific indicator. */
  deleteClient(sourceId: string): void {
    this.clientsBySourceId.delete(sourceId);
    this.publish(sourceId, "stopped");
  }

  /** Stops only this source; force is explicit and never inferred from an error. */
  async stopClient(sourceId: string, force = false, manual = true): Promise<void> {
    this.requireNotUpdating(sourceId);
    await this.stopOwnedClient(sourceId, force, manual);
  }

  /** Shares an owned shutdown while allowing the update owner to suspend its own connection. */
  private async stopOwnedClient(sourceId: string, force: boolean, manual: boolean): Promise<void> {
    const stopping = this.stops.get(sourceId);
    if (stopping !== undefined) return await stopping;
    const client = this.clientsBySourceId.get(sourceId);
    if (!force && (client?.isBusy === true || this.starts.has(sourceId))) {
      throw new Error("SOURCE_BUSY: This source is active. Confirm forced interruption to stop it.");
    }
    if (manual) this.manuallyStopped.add(sourceId);
    const operation = this.performStop(sourceId, client);
    this.stops.set(sourceId, operation);
    try {
      await operation;
    } finally {
      if (this.stops.get(sourceId) === operation) this.stops.delete(sourceId);
    }
  }

  /** Replaces one source connection after a confirmed shutdown of the previous instance. */
  async restartClient(sourceId: string, force = false): Promise<void> {
    await this.stopClient(sourceId, force, false);
    await this.startClient(sourceId);
  }

  /** Updates an idle source exclusively; stopped sources stay stopped and failed updates restore availability. */
  async runSourceUpdate<T>(sourceId: string, update: () => Promise<T>): Promise<T> {
    this.requireNotUpdating(sourceId);
    if (this.disposed) throw new Error("Codex client pool is shutting down.");
    const client = this.clientsBySourceId.get(sourceId);
    if (this.starts.has(sourceId) || this.stops.has(sourceId) || client?.isBusy === true) {
      throw new Error("SOURCE_BUSY: Wait for this source's work to finish before updating Codex.");
    }
    const shouldResume = client !== undefined && !this.manuallyStopped.has(sourceId);
    this.updatingSources.add(sourceId);
    this.publish(sourceId, "updating");
    let updateFailed = false;
    let didStop = false;
    try {
      await this.stopOwnedClient(sourceId, false, false);
      didStop = true;
      return await update();
    } catch (error) {
      updateFailed = true;
      throw error;
    } finally {
      this.updatingSources.delete(sourceId);
      if (shouldResume && didStop && !this.disposed) {
        try {
          await this.ensureClient(sourceId);
        } catch (error) {
          if (!updateFailed) throw error;
          this.options.logger?.(`Codex update and reconnection failed for ${sourceId}: ${String(error)}`);
        }
      } else if (didStop) {
        this.publish(sourceId, "stopped");
      }
    }
  }

  /** Lifecycle controls cannot race a source's owned update operation. */
  private requireNotUpdating(sourceId: string): void {
    if (this.updatingSources.has(sourceId)) throw new Error("SOURCE_UPDATING: Wait for this source's Codex update to finish.");
  }

  /** Creates and wires a client before sending initialization, retaining its exact identity in callbacks. */
  private async launch(source: CachedSource): Promise<CodexAppServerClient> {
    const settings = this.options.settings.getSettings();
    let client!: CodexAppServerClient;
    const clientOptions: CodexAppServerClientOptions = {
      command: resolveSourceCommand(source, settings.codexCommand),
      clientInfo: { name: "OpenCodexUI", version: this.options.appVersion ?? "unknown" },
      experimentalApi: settings.experimentalApi,
      logger: message => this.options.logger?.(message),
      stderr: message => this.options.handleStderr(message, source.id),
      onActivityDetailsChange: () => {
        if (this.clientsBySourceId.get(source.id) !== client) return;
        const state = this.readState(source.id);
        this.publish(source.id, state.phase, state.error);
      }
    };
    client = this.options.createClient?.(clientOptions) ?? new CodexAppServerClient(clientOptions);
    this.clientsBySourceId.set(source.id, client);
    this.publish(source.id, "starting");
    this.options.events.emit({ type: "connection.status", status: "starting" });
    this.observeClient(source.id, client);
    try {
      await client.start();
      if (this.clientsBySourceId.get(source.id) !== client || this.readState(source.id).phase === "stopping") {
        throw new Error("Codex source initialization was interrupted.");
      }
      this.publish(source.id, "ready");
      this.options.events.emit({ type: "connection.status", status: "ready" });
      return client;
    } catch (error) {
      if (this.clientsBySourceId.get(source.id) === client && this.readState(source.id).phase !== "stopping") {
        try {
          await client.dispose();
          this.clientsBySourceId.delete(source.id);
          this.options.handleClose(source.id);
        } catch (shutdownError) {
          this.options.logger?.(`Failed to dispose Codex after initialization failure: ${String(shutdownError)}`);
        }
        this.publish(source.id, "error", error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  /** Prevents callbacks from a retired client from altering its replacement or another source. */
  private observeClient(sourceId: string, client: CodexAppServerClient): void {
    client.onNotification(notification => {
      if (this.clientsBySourceId.get(sourceId) === client) this.options.handleNotification(notification, sourceId);
    });
    client.onServerRequest(request => {
      if (this.clientsBySourceId.get(sourceId) === client) this.options.handleServerRequest(request, sourceId);
    });
    client.onError(error => {
      if (this.clientsBySourceId.get(sourceId) !== client) return;
      this.publish(sourceId, "error", error.message);
      this.options.handleError(error);
    });
    client.onClose(event => {
      if (this.clientsBySourceId.get(sourceId) !== client) return;
      // Closing retires retained references before recovery can acquire a replacement.
      void client.dispose().catch(error => {
        this.options.logger?.(`Failed to retire closed Codex client: ${String(error)}`);
      });
      this.clientsBySourceId.delete(sourceId);
      this.options.handleClose(sourceId);
      this.publish(sourceId, "stopped");
      if (event.code !== 0) this.publish(sourceId, "error", "Codex app-server exited unexpectedly.");
    });
  }

  /** Publishes stopped only after the owned process has exited; failed termination remains inspectable. */
  private async performStop(sourceId: string, client: CodexAppServerClient | undefined): Promise<void> {
    this.publish(sourceId, "stopping");
    try {
      await client?.dispose();
      if (this.clientsBySourceId.get(sourceId) === client) {
        this.clientsBySourceId.delete(sourceId);
        this.options.handleClose(sourceId);
      }
      this.publish(sourceId, "stopped");
    } catch (error) {
      this.publish(sourceId, "error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Sends content-free transitions rather than emitting once per streamed token. */
  private publish(sourceId: string, phase: SourceInstanceSnapshot["phase"], error: string | null = null): void {
    if (this.updatingSources.has(sourceId) && phase !== "error") phase = "updating";
    const snapshot: SourceInstanceSnapshot = {
      sourceId,
      phase,
      isActive: phase !== "stopped" && this.clientsBySourceId.get(sourceId)?.isBusy === true,
      manuallyStopped: this.manuallyStopped.has(sourceId),
      error
    };
    const client = this.clientsBySourceId.get(sourceId);
    if (client !== undefined) snapshot.activity = client.activityDetails;
    const previous = this.states.get(sourceId);
    if (previous?.phase === phase && previous.isActive === snapshot.isActive
      && previous.manuallyStopped === snapshot.manuallyStopped && previous.error === error
      && JSON.stringify(previous.activity) === JSON.stringify(snapshot.activity)) return;
    this.states.set(sourceId, snapshot);
    this.options.events.emit({ type: "sourceInstances.changed", snapshot: this.readState(sourceId) });
  }
}
