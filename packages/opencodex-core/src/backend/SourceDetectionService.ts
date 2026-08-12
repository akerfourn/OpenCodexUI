/**
 * Detects Codex command availability and persists source diagnostics.
 */
import type {
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexCommandCandidate,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexBackendOptions } from "../types.js";
import {
  readCodexCommandCandidateStatuses,
  readCodexVersionStatus
} from "./toolVersionDetection.js";
import type { SourceDetectionPort } from "./sourcePorts.js";

/**
 * Dependencies used to detect and persist source Codex diagnostics.
 */
export type SourceDetectionServiceOptions = {
  /** Cache operation used to persist the latest source detection result. */
  cacheRepository: Pick<
    OpenCodexCacheRepository,
    "updateSourceCodexDetection"
  > | null;
  /** Host diagnostics port used for best-effort command detection logging. */
  host: Pick<OpenCodexBackendOptions, "logger">;
};

/**
 * Coordinates Codex version detection and local command candidate discovery.
 */
export class SourceDetectionService implements SourceDetectionPort {
  /**
   * Creates a source detection service.
   *
   * @param options Cache and host diagnostic ports.
   */
  constructor(private readonly options: SourceDetectionServiceOptions) {}

  /**
   * Reads and persists the Codex CLI version status for one source.
   *
   * @param source Source configuration used to resolve the command.
   * @param fallbackCommand Global fallback Codex command.
   * @returns Tool availability with detected version when available.
   */
  async readAndStoreCodexVersionStatus(
    source: CachedSource,
    fallbackCommand: string
  ): Promise<OpenCodexToolVersionStatus> {
    const status = await readCodexVersionStatus(source, fallbackCommand);
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return status;
    }

    await repository.updateSourceCodexDetection(source.id, {
      version: status.version,
      checkedAt: status.checkedAt,
      error: status.status === "ready" ? null : status.message
    });

    return status;
  }

  /**
   * Reads local Codex command candidates with availability details.
   *
   * @returns Detected command candidates, or an empty collection on failure.
   */
  async readCommandCandidates(): Promise<OpenCodexCommandCandidate[]> {
    try {
      return await readCodexCommandCandidateStatuses();
    } catch (error) {
      this.options.host.logger?.(`codex candidate detection failed: ${String(error)}`);
      return [];
    }
  }
}
