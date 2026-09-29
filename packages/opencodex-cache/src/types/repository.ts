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
import type { ProjectGoalCacheRepository } from "./repositoryGoals.js";
import type { MessageRenderingRepository } from "./messageRendering.js";
import type { DebugRepository } from "./debug.js";

/**
 * Describes the storage contract implemented by cache backends.
 */
export interface OpenCodexCacheRepository
  extends SourceCacheRepository,
    CollaborationCacheRepository,
    ProjectCacheRepository,
    LogCacheRepository,
    AutomationCacheRepository,
    ProjectGoalCacheRepository,
    ThreadCacheRepository {
  /** Workspace catalogue and atomic execution reservations. */
  readonly workspaces: WorkspaceCacheRepository;
  /** Persisted debugger profiles, breakpoints and watches. */
  readonly debug: DebugRepository;
  /** Local presentation overrides, kept separately from Codex content. */
  readonly messageRendering: MessageRenderingRepository;
  /**
   * Closes resources owned by the repository.
   *
   * @returns Promise resolved when resources are closed.
   */
  close(): Promise<void>;
}
