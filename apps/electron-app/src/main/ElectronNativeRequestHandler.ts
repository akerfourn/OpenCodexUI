import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";

import type { AppUpdateService } from "./appUpdateService.js";
import type { DictationHostService } from "./dictation/DictationHostService.js";
import type { DiscordPresenceService } from "./discordPresenceService.js";
import type { EmojiCatalogStore } from "./emojiCatalogStore.js";

/** Native service ports and explicit fallback to the backend request router. */
export interface ElectronNativeRequestHandlerOptions {
  dictation: Pick<DictationHostService, "handle">;
  emojiCatalog: Pick<EmojiCatalogStore, "get" | "update">;
  appUpdates: Pick<AppUpdateService, "getState" | "check" | "download" | "install">;
  discordPresence: Pick<DiscordPresenceService, "reconnect">;
  getMainWebContentsId(): number | undefined;
  openDeveloperTools(): { ok: true };
  openUsageHistory(sourceId: string): void;
  handleBackendRequest(request: OpenCodexRequest): Promise<unknown>;
}

/** Handles Electron-owned requests before delegating other requests to the backend. */
export class ElectronNativeRequestHandler {
  /** Keeps host effects explicit and reads the current window at request time. */
  constructor(private readonly options: ElectronNativeRequestHandlerOptions) {}

  /** Routes one IPC request, restricting every dictation request to the main renderer. */
  async handle(request: OpenCodexRequest, senderId: number): Promise<unknown> {
    if (request.type.startsWith("dictation.")) {
      if (senderId !== this.options.getMainWebContentsId()) {
        throw new Error("Dictation is only available in the main window.");
      }

      return this.options.dictation.handle(request);
    }

    if (request.type === "emojiCatalog.get") {
      return this.options.emojiCatalog.get();
    }

    if (request.type === "emojiCatalog.update") {
      return this.options.emojiCatalog.update(request.overrides);
    }

    if (request.type === "app.openDevTools") {
      return this.options.openDeveloperTools();
    }

    if (request.type === "app.update.state") {
      return this.options.appUpdates.getState();
    }

    if (request.type === "app.update.check") {
      return this.options.appUpdates.check(request.force === true);
    }

    if (request.type === "app.update.download") {
      return this.options.appUpdates.download();
    }

    if (request.type === "app.update.install") {
      return this.options.appUpdates.install();
    }

    if (request.type === "app.openUsageHistory") {
      this.options.openUsageHistory(request.sourceId);
      return { ok: true };
    }

    if (request.type === "discord.reconnect") {
      await this.options.discordPresence.reconnect();
      return { ok: true };
    }

    return this.options.handleBackendRequest(request);
  }
}
