import type {
  CollaborationCacheRepository,
  LogCacheRepository,
  ProjectCacheRepository
} from "./repositoryProjects.js";
import type { ThreadCacheRepository } from "./repositoryThreads.js";
import type { WorkspaceCacheRepository } from "./workspaces.js";
import type {
  AutomationCacheRepository,
  SourceCacheRepository
} from "./repositoryTooling.js";

/**
 * Describes the storage contract implemented by cache backends.
 */
export interface OpenCodexCacheRepository
  extends SourceCacheRepository,
    CollaborationCacheRepository,
    ProjectCacheRepository,
    LogCacheRepository,
    AutomationCacheRepository,
    ThreadCacheRepository {
  /** Workspace catalogue and atomic execution reservations. */
  readonly workspaces: WorkspaceCacheRepository;
  /**
   * Closes resources owned by the repository.
   *
   * @returns Promise resolved when resources are closed.
   */
  close(): Promise<void>;
}
