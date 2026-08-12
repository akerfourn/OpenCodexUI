/**
 * Defines narrow contracts shared by source-oriented backend services.
 */
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexCommandCandidate,
  OpenCodexCodexUpdateStatus,
  OpenCodexSource,
  OpenCodexSourceKind,
  OpenCodexSourceSettingsPatch,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";

/**
 * Detects Codex availability for a source and persists the resulting diagnostic.
 */
export interface SourceDetectionPort {
  /**
   * Reads and stores the Codex version status for one source.
   *
   * @param source Source configuration used to resolve the command.
   * @param fallbackCommand Global fallback Codex command.
   * @returns Tool availability with the detected version when available.
   */
  readAndStoreCodexVersionStatus(
    source: CachedSource,
    fallbackCommand: string
  ): Promise<OpenCodexToolVersionStatus>;

  /**
   * Reads local Codex command candidates with availability details.
   *
   * @returns Detected command candidates, or an empty collection on failure.
   */
  readCommandCandidates(): Promise<OpenCodexCommandCandidate[]>;
}

/** Computes protocol-level Codex update availability for a source. */
export interface SourceUpdateStatusPort {
  /**
   * Derives update state from a source snapshot and the global fallback command.
   *
   * @param source Source snapshot with detected Codex information.
   * @param fallbackCommand Global command used by automatic local sources.
   * @returns Protocol update status.
   */
  getSourceUpdateStatus(
    source: Pick<OpenCodexSource, "kind" | "settings" | "codex" | "resolvedCommand">,
    fallbackCommand: string
  ): OpenCodexCodexUpdateStatus;
}

/**
 * Coordinates source persistence, resolution, and protocol presentation.
 *
 * The port deliberately excludes event emission so callers can preserve their
 * own project/source event ordering.
 */
export interface SourceCatalogPort {
  /** Ensures that the configured default source exists. */
  ensureSourcesInitialized(): Promise<void>;
  /** Reads cached sources without emitting events. */
  listCachedSources(): Promise<CachedSource[]>;
  /** Resolves a source, falling back to the first cached source when needed. */
  resolveSource(sourceId: string | null): Promise<CachedSource>;
  /** Reads protocol source snapshots without emitting events. */
  listOpenCodexSources(): Promise<OpenCodexSource[]>;
  /** Creates a cached source and returns its protocol snapshot. */
  createSource(
    name: string,
    kind: OpenCodexSourceKind,
    settings: OpenCodexSourceSettingsPatch
  ): Promise<SourceCatalogSourceResult>;
  /** Deletes a source and clears its dependent associations. */
  deleteSource(sourceId: string): Promise<SourceCatalogDeletionResult>;
  /** Updates source metadata and returns its protocol snapshot. */
  updateSource(
    sourceId: string,
    patch: Partial<Pick<OpenCodexSource, "name">> & {
      settings?: OpenCodexSourceSettingsPatch;
    }
  ): Promise<SourceCatalogSourceResult>;
}

/** Protocol source and settings snapshot produced by a source mutation. */
export type SourceCatalogSourceResult = {
  source: OpenCodexSource;
  defaultSourceId: string | null;
};

/** Default-source snapshot produced by source deletion. */
export type SourceCatalogDeletionResult = {
  defaultSourceId: string | null;
};

/**
 * Synchronizes thread metadata owned by one Codex source.
 */
export interface SourceThreadSyncPort {
  /**
   * Synchronizes the cached thread index for one source.
   *
   * @param source Source whose thread index must be synchronized.
   * @returns Promise resolved when synchronization completes.
   */
  syncSource(source: CachedSource): Promise<void>;
}
