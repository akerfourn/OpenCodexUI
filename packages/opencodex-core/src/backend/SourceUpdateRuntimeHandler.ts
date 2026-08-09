import type {
  OpenCodexCodexReleaseCheck,
  OpenCodexEvent,
  OpenCodexSource
} from "@open-codex-ui/opencodex-protocol";

/** Dependencies used by the runtime's source update and release operations. */
export type SourceUpdateRuntimeHandlerOptions = {
  /** Returns the current global Codex command used for automatic local sources. */
  getCodexCommand(): string;
  /** Returns the source identifier currently configured as the default. */
  getDefaultSourceId(): string | null;
  /** Lists the source DTOs currently visible to the UI. */
  listOpenCodexSources(): Promise<OpenCodexSource[]>;
  /** Refreshes the globally cached latest Codex release metadata. */
  checkLatestRelease(force: boolean): Promise<OpenCodexCodexReleaseCheck>;
  /** Applies a standalone Codex update and returns the refreshed source list. */
  updateSource(source: OpenCodexSource, fallbackCommand: string): Promise<OpenCodexSource[]>;
  /** Reports whether a source currently has an active turn. */
  hasActiveTurn(sourceId: string): boolean;
  /** Restarts a source client after its command has changed. */
  restartSourceClient(sourceId: string): Promise<void>;
  /** Emits a source or release event to the UI transport. */
  emit(event: OpenCodexEvent): void;
};

/** Coordinates source list refreshes and standalone Codex CLI updates. */
export class SourceUpdateRuntimeHandler {
  /** Creates a source update handler from narrow runtime callbacks. */
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
    const releaseCheck = await this.options.checkLatestRelease(force);
    this.options.emit({
      type: "sources.updated",
      sources: await this.options.listOpenCodexSources(),
      defaultSourceId: this.options.getDefaultSourceId()
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

    const source = (await this.options.listOpenCodexSources())
      .find((candidate) => candidate.id === sourceId);

    if (source === undefined) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const sources = await this.options.updateSource(source, this.options.getCodexCommand());
    await this.options.restartSourceClient(sourceId);
    return sources;
  }
}
