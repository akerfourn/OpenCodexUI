/**
 * Publishes a small, privacy-preserving Discord Rich Presence status.
 */
import * as DiscordRPC from "discord-rpc";

import type { OpenCodexEvent } from "@open-codex-ui/opencodex-protocol";

const DISCORD_CLIENT_ID = "1510374956448350393";
const DISCORD_ICON_KEY = "icon-reference";

type PresenceMode = "idle" | "working";

/**
 * Tracks backend activity and mirrors it into Discord Rich Presence.
 */
export class DiscordPresenceService {
  private readonly activeTurns = new Set<string>();
  private client: DiscordRPC.Client | null = null;
  private isConnecting = false;
  private isReady = false;
  private lastMode: PresenceMode | null = null;

  constructor(
    private isEnabled: boolean,
    private readonly logger: (message: string) => void
  ) {
    if (isEnabled) {
      void this.connect();
    }
  }

  /**
   * Enables or disables the Discord presence integration.
   *
   * @param isEnabled Whether Rich Presence should be active.
   * @returns Nothing.
   */
  setEnabled(isEnabled: boolean): void {
    if (this.isEnabled === isEnabled) {
      return;
    }

    this.isEnabled = isEnabled;

    if (isEnabled) {
      void this.connect();
      return;
    }

    void this.disconnect();
  }

  /**
   * Applies backend events to the presence state.
   *
   * @param event Backend event.
   * @returns Nothing.
   */
  handleEvent(event: OpenCodexEvent): void {
    if (event.type === "turn.started") {
      this.activeTurns.add(buildTurnKey(event.threadId, event.turnId));
      void this.updatePresence();
      return;
    }

    if (event.type === "turn.completed") {
      this.activeTurns.delete(buildTurnKey(event.threadId, event.turnId));
      void this.updatePresence();
      return;
    }

    if (event.type === "connection.status" && event.status !== "ready") {
      this.activeTurns.clear();
      void this.updatePresence();
    }
  }

  /**
   * Releases the Discord RPC client.
   *
   * @returns Promise resolved once the client is closed.
   */
  async dispose(): Promise<void> {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    if (!this.isEnabled || this.isConnecting || this.isReady) {
      return;
    }

    this.isConnecting = true;

    try {
      DiscordRPC.register(DISCORD_CLIENT_ID);
      const client = new DiscordRPC.Client({ transport: "ipc" });
      client.on("ready", () => {
        this.isReady = true;
        this.isConnecting = false;
        void this.updatePresence(true);
      });
      client.on("disconnected", () => {
        this.isReady = false;
        this.client = null;
        this.lastMode = null;
      });
      this.client = client;
      await client.login({ clientId: DISCORD_CLIENT_ID });
    } catch (error) {
      this.isConnecting = false;
      this.isReady = false;
      this.client = null;
      this.lastMode = null;
      this.logger(`Discord Rich Presence unavailable: ${readErrorMessage(error)}`);
    }
  }

  private async disconnect(): Promise<void> {
    const client = this.client;

    this.activeTurns.clear();
    this.client = null;
    this.isReady = false;
    this.isConnecting = false;
    this.lastMode = null;

    if (client === null) {
      return;
    }

    try {
      await client.clearActivity();
      await client.destroy();
    } catch (error) {
      this.logger(`Discord Rich Presence cleanup failed: ${readErrorMessage(error)}`);
    }
  }

  private async updatePresence(force = false): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    if (!this.isReady || this.client === null) {
      await this.connect();
      return;
    }

    const mode = this.activeTurns.size > 0 ? "working" : "idle";

    if (!force && mode === this.lastMode) {
      return;
    }

    this.lastMode = mode;

    try {
      await this.client.setActivity({
        details: mode === "working" ? "Burning tokens 🔥" : "Waiting instruction...",
        state: mode === "working" ? "Codex is working" : "Ready",
        largeImageKey: DISCORD_ICON_KEY,
        largeImageText: "OpenCodexUI",
        instance: false
      });
    } catch (error) {
      this.logger(`Discord Rich Presence update failed: ${readErrorMessage(error)}`);
    }
  }
}

function buildTurnKey(threadId: string, turnId: string): string {
  return `${threadId}:${turnId}`;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
