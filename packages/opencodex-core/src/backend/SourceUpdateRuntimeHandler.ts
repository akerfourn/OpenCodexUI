import type {
  OpenCodexCodexReleaseCheck,
  OpenCodexSource
} from "@open-codex-ui/opencodex-protocol";
import type { CodexUpdateService } from "./CodexUpdateService.js";
import type { ProjectSourceService } from "./ProjectSourceService.js";
import type {
  ClientPort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "./runtime/runtimePorts.js";

/** Dependencies used by the runtime's source update and release operations. */
export type SourceUpdateRuntimeHandlerOptions = {
  /** Reads the current global Codex command and default source settings. */
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  /** Lists the source DTOs currently visible to the UI. */
  projects: Pick<ProjectSourceService, "listOpenCodexSources">;
  /** Refreshes release metadata and applies standalone Codex updates. */
  updates: Pick<CodexUpdateService, "checkLatestRelease" | "updateSource">;
  /** Reports whether a source currently has an active turn. */
  hasActiveTurn(sourceId: string): boolean;
  /** Provides source client lifecycle operations. */
  clients: Pick<ClientPort, "restartClient">;
  /** Emits a source or release event to the UI transport. */
  events: Pick<RuntimeEventPort, "emit">;
};

/** Coordinates source list refreshes and standalone Codex CLI updates. */
export class SourceUpdateRuntimeHandler {
  /** Creates a source update handler from runtime ports and update callbacks. */
  constructor(
    /** Settings, source, update, lifecycle, and event dependencies. */
    private readonly options: SourceUpdateRuntimeHandlerOptions
  ) {}

  /**
   * Refreshes release metadata and publishes the corresponding source snapshot.
   *
   * @param force Whether to bypass the release metadata cache.
   * @returns Latest release check state.
   */
  async checkCodexRelease(force: boolean): Promise<OpenCodexCodexReleaseCheck> {
    const releaseCheck = await this.options.updates.checkLatestRelease(force);
    this.options.events.emit({
      type: "sources.updated",
      sources: await this.options.projects.listOpenCodexSources(),
      defaultSourceId: this.options.settings.getSettings().defaultSourceId
    });
    return releaseCheck;
  }

  /**
   * Applies a standalone Codex update and restarts the updated source client.
   *
   * @param sourceId Source identifier.
   * @returns Refreshed source list.
   * @throws When the source has an active turn or cannot be found.
   */
  async updateCodexSource(sourceId: string): Promise<OpenCodexSource[]> {
    if (this.options.hasActiveTurn(sourceId)) {
      throw new Error("Codex update cannot start while this source has an active turn.");
    }

    const source = (await this.options.projects.listOpenCodexSources())
      .find((candidate) => candidate.id === sourceId);

    if (source === undefined) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const sources = await this.options.updates.updateSource(
      source,
      this.options.settings.getSettings().codexCommand
    );
    await this.options.clients.restartClient(sourceId);
    return sources;
  }
}
