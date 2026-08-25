/**
 * Synchronizes source-owned Codex thread indexes into the local cache.
 */
import type {
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";

import type { OpenCodexBackendOptions } from "../../types.js";
import { THREAD_LIST_PAGE_SIZE, THREAD_SOURCE_KINDS } from "../shared/constants.js";
import { readThreadPages } from "../shared/codexReaders.js";
import { ProjectPathVisibilityValidator } from "../projects/projectPathVisibility.js";
import type { ClientPort, RuntimeSettingsPort } from "../runtime/runtimePorts.js";
import type {
  SourceDetectionPort,
  SourceThreadSyncPort
} from "./sourcePorts.js";
import {
  toCachedThreadSummary,
  withSourceId
} from "../threads/threadCacheMapping.js";
import type { OpenCodexThreadWithProjectState } from "../threads/threadTypes.js";

/**
 * Dependencies used to synchronize one source-owned thread index.
 */
export type SourceThreadSyncServiceOptions = {
  /** Cache operations used to persist and clean synchronized thread metadata. */
  cacheRepository: Pick<
    OpenCodexCacheRepository,
    "upsertThreadIndex" | "deleteEmptyUnsyncedThreads"
  > | null;
  /** Settings used to resolve the fallback command and outdated-version policy. */
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  /** Source-scoped Codex client lifecycle port. */
  clients: Pick<ClientPort, "ensureClient">;
  /** Source Codex detection port used before reading the thread index. */
  detection: Pick<SourceDetectionPort, "readAndStoreCodexVersionStatus">;
  /** Host diagnostics port used for best-effort synchronization logging. */
  host: Pick<OpenCodexBackendOptions, "logger">;
};

/**
 * Synchronizes Codex thread metadata for one configured source.
 */
export class SourceThreadSyncService implements SourceThreadSyncPort {
  /**
   * Creates a source thread synchronizer.
   *
   * @param options Cache, settings, client, detection, and host ports.
   */
  constructor(private readonly options: SourceThreadSyncServiceOptions) {}

  /**
   * Synchronizes thread and project metadata for one source.
   *
   * @param source Source to synchronize.
   * @returns Promise resolved when synchronization completes.
   */
  async syncSource(source: CachedSource): Promise<void> {
    const settings = this.options.settings.getSettings();
    const codexStatus = await this.options.detection.readAndStoreCodexVersionStatus(
      source,
      settings.codexCommand
    );
    const isCodexUsable = codexStatus.status === "ready" ||
      (codexStatus.status === "outdated" && settings.allowOutdatedCodex);

    if (!isCodexUsable) {
      this.options.host.logger?.(
        `skipping source sync because Codex is not usable for ${source.name}: ${codexStatus.message ?? "unknown"}`
      );
      return;
    }

    const client = await this.options.clients.ensureClient(source.id);
    const projectPathValidator = new ProjectPathVisibilityValidator(source, client);
    const sourceThreads = await readThreadPages(client, {
      limit: THREAD_LIST_PAGE_SIZE,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: THREAD_SOURCE_KINDS
    });
    const threads = await Promise.all(sourceThreads.map(async (thread) => {
      const projectHidden = await projectPathValidator.shouldHideProjectPath(thread.projectPath);

      return withSourceId(
        {
          ...thread,
          projectHidden
        },
        source.id
      );
    }));

    await this.writeThreadIndex(threads);
    await this.deleteEmptyUnsyncedThreadShells(source.id, threads);
  }

  /**
   * Writes synchronized thread metadata to the cache.
   *
   * @param threads Threads to persist.
   * @returns Promise resolved when the write attempt completes.
   */
  private async writeThreadIndex(threads: OpenCodexThreadWithProjectState[]): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return;
    }

    try {
      await repository.upsertThreadIndex(threads.map((thread) => toCachedThreadSummary(thread)));
    } catch (error) {
      this.options.host.logger?.(`thread cache index write failed: ${String(error)}`);
    }
  }

  /**
   * Removes empty cached thread shells after a source has reported its real thread index.
   *
   * @param sourceId Source identifier being synchronized.
   * @param threads Threads reported by the source.
   * @returns Promise resolved when cleanup completes.
   */
  private async deleteEmptyUnsyncedThreadShells(
    sourceId: string,
    threads: OpenCodexThreadWithProjectState[]
  ): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return;
    }

    const projectPaths = new Set<string>();

    for (const thread of threads) {
      if (thread.projectPath !== null && thread.projectPath !== undefined) {
        projectPaths.add(thread.projectPath);
      }
    }

    try {
      for (const projectPath of projectPaths) {
        const deletedCount = await repository.deleteEmptyUnsyncedThreads(projectPath, sourceId);

        if (deletedCount > 0) {
          this.options.host.logger?.(
            `deleted ${deletedCount} empty unsynced cached thread(s) for ${projectPath}`
          );
        }
      }
    } catch (error) {
      this.options.host.logger?.(
        `empty thread cache cleanup failed: ${String(error)}`
      );
    }
  }
}
