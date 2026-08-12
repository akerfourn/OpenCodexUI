/**
 * Owns source persistence, resolution, and protocol snapshots.
 */
import type {
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import { createDefaultCachedSource, toOpenCodexSource } from "./sourceMapping.js";
import type {
  OpenCodexCodexUpdateStatus,
  OpenCodexSource,
  OpenCodexSourceKind,
  OpenCodexSourceSettingsPatch
} from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexBackendOptions } from "../types.js";
import type { ClientPort, RuntimeSettingsPort } from "./runtime/runtimePorts.js";
import type {
  SourceCatalogDeletionResult,
  SourceCatalogPort,
  SourceCatalogSourceResult,
  SourceDetectionPort,
  SourceUpdateStatusPort
} from "./sourcePorts.js";

/** Cache operations needed by the source catalog. */
type SourceCatalogRepository = Pick<
  OpenCodexCacheRepository,
  | "ensureDefaultSource"
  | "listSources"
  | "createSource"
  | "getSourceProjectCount"
  | "updateSource"
  | "clearSourceAssociations"
  | "deleteSource"
>;

/** Dependencies used by source persistence and presentation. */
export type SourceCatalogServiceOptions = {
  /** Source cache operations, or `null` before cache storage is available. */
  cacheRepository: SourceCatalogRepository | null;
  /** Mutable settings state used for default-source and command resolution. */
  settings: Pick<RuntimeSettingsPort, "getSettings" | "setSettings">;
  /** Source client lifecycle operation used after launch settings change. */
  clients: Pick<ClientPort, "restartClient">;
  /** Shared Codex detection and command-candidate port. */
  detection: SourceDetectionPort;
  /** Computes protocol-level Codex update availability. */
  updates: SourceUpdateStatusPort;
  /** Host persistence operation used after default-source initialization. */
  host: Pick<OpenCodexBackendOptions, "saveSettings">;
};

/**
 * Coordinates source persistence, resolution, and protocol snapshots.
 *
 * This service intentionally does not emit runtime events. Its callers own
 * event ordering because source mutations can also change project snapshots.
 */
export class SourceCatalogService implements SourceCatalogPort {
  /** Creates a source catalog from narrow cache, settings, client, and detection ports. */
  constructor(private readonly options: SourceCatalogServiceOptions) {}

  /**
   * Ensures the default source exists and settings point to it.
   *
   * @returns Promise resolved when initialization completes.
   */
  async ensureSourcesInitialized(): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return;
    }

    const source = await repository.ensureDefaultSource();
    const settings = this.options.settings.getSettings();

    if (settings.defaultSourceId !== null && settings.defaultSourceId !== "default") {
      return;
    }

    const nextSettings = {
      ...settings,
      defaultSourceId: source.id
    };
    this.options.settings.setSettings(nextSettings);
    await this.options.host.saveSettings?.(nextSettings);
  }

  /**
   * Reads cached sources without initializing or emitting an event.
   *
   * @returns Cached sources in repository order, or an empty collection without storage.
   */
  async listCachedSources(): Promise<CachedSource[]> {
    return this.options.cacheRepository === null
      ? []
      : await this.options.cacheRepository.listSources();
  }

  /**
   * Resolves a source identifier to a cached source.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   * @returns Resolved source, falling back to the first cached source.
   */
  async resolveSource(sourceId: string | null): Promise<CachedSource> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return createDefaultCachedSource();
    }

    await this.ensureSourcesInitialized();
    const sources = await repository.listSources();
    const resolvedSourceId = sourceId ?? this.options.settings.getSettings().defaultSourceId;

    if (resolvedSourceId !== null) {
      const source = sources.find((entry) => entry.id === resolvedSourceId);

      if (source !== undefined) {
        return source;
      }
    }

    return sources[0] ?? createDefaultCachedSource();
  }

  /**
   * Reads sources and converts them to protocol objects.
   *
   * @returns Source collection without emitting an event.
   */
  async listOpenCodexSources(): Promise<OpenCodexSource[]> {
    const repository = this.options.cacheRepository;
    const settings = this.options.settings.getSettings();

    if (repository === null) {
      const defaultSource = createDefaultCachedSource();
      const commandCandidates = await this.options.detection.readCommandCandidates();

      return [
        this.withCodexUpdateStatus(toOpenCodexSource(
          defaultSource,
          settings.codexCommand,
          0,
          await this.options.detection.readAndStoreCodexVersionStatus(
            defaultSource,
            settings.codexCommand
          ),
          this.createCodexUpdateStatusPlaceholder(),
          commandCandidates
        ))
      ];
    }

    const sources = await repository.listSources();
    const commandCandidates = await this.options.detection.readCommandCandidates();

    return Promise.all(sources.map(async (source) => {
      const protocolSource = toOpenCodexSource(
        source,
        settings.codexCommand,
        await repository.getSourceProjectCount(source.id),
        await this.options.detection.readAndStoreCodexVersionStatus(
          source,
          settings.codexCommand
        ),
        this.createCodexUpdateStatusPlaceholder(),
        commandCandidates
      );

      return this.withCodexUpdateStatus(protocolSource);
    }));
  }

  /**
   * Creates a new Codex source.
   *
   * @param name Optional source name.
   * @param kind Source kind.
   * @param sourceSettings Source settings patch.
   * @returns Created protocol source.
   */
  async createSource(
    name: string,
    kind: OpenCodexSourceKind,
    sourceSettings: OpenCodexSourceSettingsPatch
  ): Promise<SourceCatalogSourceResult> {
    const repository = this.requireCacheRepository("Source storage is unavailable.");
    const createdSource = await repository.createSource(name, { kind, settings: sourceSettings });
    const settings = this.options.settings.getSettings();
    const source = toOpenCodexSource(
      createdSource,
      settings.codexCommand,
      0,
      await this.options.detection.readAndStoreCodexVersionStatus(
        createdSource,
        settings.codexCommand
      ),
      this.createCodexUpdateStatusPlaceholder(),
      await this.options.detection.readCommandCandidates()
    );

    return {
      source: this.withCodexUpdateStatus(source),
      defaultSourceId: settings.defaultSourceId
    };
  }

  /**
   * Deletes a non-default source and clears its project associations.
   *
   * @param sourceId Source identifier.
   * @returns Promise resolved when deletion completes.
   */
  async deleteSource(sourceId: string): Promise<SourceCatalogDeletionResult> {
    const settings = this.options.settings.getSettings();

    if (sourceId === settings.defaultSourceId) {
      throw new Error("Default source cannot be deleted.");
    }

    const repository = this.requireCacheRepository("Source storage is unavailable.");
    await repository.clearSourceAssociations(sourceId);
    await repository.deleteSource(sourceId);
    return { defaultSourceId: settings.defaultSourceId };
  }

  /**
   * Updates source metadata and command settings.
   *
   * @param sourceId Source identifier.
   * @param patch Source patch.
   * @returns Updated protocol source.
   */
  async updateSource(
    sourceId: string,
    patch: Partial<Pick<OpenCodexSource, "name">> & {
      settings?: OpenCodexSourceSettingsPatch;
    }
  ): Promise<SourceCatalogSourceResult> {
    const repository = this.requireCacheRepository("Source storage is unavailable.");
    const previousSource = await this.resolveSource(sourceId);
    const updatedSource = await repository.updateSource(sourceId, patch);

    if (hasSourceLaunchCommandChanged(previousSource, updatedSource)) {
      await repository.clearSourceAssociations(sourceId);
      await this.options.clients.restartClient(sourceId);
    }

    const settings = this.options.settings.getSettings();
    const source = toOpenCodexSource(
      updatedSource,
      settings.codexCommand,
      await repository.getSourceProjectCount(updatedSource.id),
      await this.options.detection.readAndStoreCodexVersionStatus(
        updatedSource,
        settings.codexCommand
      ),
      this.createCodexUpdateStatusPlaceholder(),
      await this.options.detection.readCommandCandidates()
    );

    return {
      source: this.withCodexUpdateStatus(source),
      defaultSourceId: settings.defaultSourceId
    };
  }

  /**
   * Adds computed update availability to a source DTO.
   *
   * @param source Source DTO without final update state.
   * @returns Source DTO with update state.
   */
  private withCodexUpdateStatus(source: OpenCodexSource): OpenCodexSource {
    return {
      ...source,
      codexUpdate: this.options.updates.getSourceUpdateStatus(
        source,
        this.options.settings.getSettings().codexCommand
      )
    };
  }

  /**
   * Creates a temporary update status used before the final source DTO exists.
   *
   * @returns Neutral update status.
   */
  private createCodexUpdateStatusPlaceholder(): OpenCodexCodexUpdateStatus {
    return {
      supported: false,
      updateAvailable: false,
      latestVersion: this.options.settings.getSettings().codexReleaseCheck.latestVersion,
      checkedAt: this.options.settings.getSettings().codexReleaseCheck.checkedAt,
      message: null
    };
  }

  /**
   * Returns the cache repository or throws a contextual error.
   *
   * @param message Error message when storage is unavailable.
   * @returns Cache repository.
   */
  private requireCacheRepository(message: string): SourceCatalogRepository {
    if (this.options.cacheRepository === null) {
      throw new Error(message);
    }

    return this.options.cacheRepository;
  }
}

/**
 * Checks whether a source update changes the command used to start Codex.
 *
 * @param previousSource Source before the update.
 * @param updatedSource Source after the update.
 * @returns Whether the associated app-server client must be restarted.
 */
function hasSourceLaunchCommandChanged(
  previousSource: CachedSource,
  updatedSource: CachedSource
): boolean {
  if (previousSource.kind !== updatedSource.kind) {
    return true;
  }

  if ("commandMode" in previousSource.settings && "commandMode" in updatedSource.settings) {
    return previousSource.settings.commandMode !== updatedSource.settings.commandMode ||
      previousSource.settings.command !== updatedSource.settings.command;
  }

  if ("codexCommand" in previousSource.settings && "codexCommand" in updatedSource.settings) {
    return previousSource.settings.codexCommand !== updatedSource.settings.codexCommand;
  }

  return false;
}
