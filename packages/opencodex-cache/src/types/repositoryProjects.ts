import type { OpenCodexCollaborationEvent } from "@open-codex-ui/opencodex-protocol";
import type {
  CachedCollaborationEvent,
  CachedCollaborationEventQuery
} from "./collaboration.js";
import type {
  CachedProject,
  CachedProjectGroup,
  CachedProjectGroupCreateInput,
  CachedProjectGroupUpdateInput,
  CachedProjectGroupsSnapshot,
  CachedProjectPreferences
} from "./projects.js";
import type {
  CachedLogCreateInput,
  CachedLogEntry,
  CachedLogListQuery,
  CachedLogPage
} from "./logs.js";

/** Cache contract for persisted collaboration events. */
export interface CollaborationCacheRepository {
  /**
   * Inserts or enriches one normalized collaboration event.
   *
   * @param event Source-aware collaboration event.
   * @returns Persisted event with observation timestamps.
   */
  upsertCollaborationEvent(
    event: OpenCodexCollaborationEvent
  ): Promise<CachedCollaborationEvent>;

  /**
   * Lists normalized collaboration events matching source-aware filters.
   *
   * @param query Source, routing, and optional hierarchy filters.
   * @returns Events ordered by first observation.
   */
  listCollaborationEvents(
    query: CachedCollaborationEventQuery
  ): Promise<CachedCollaborationEvent[]>;
}

/** Cache contract for cached projects and project groups. */
export interface ProjectCacheRepository {
  /**
   * Inserts or refreshes a cached project.
   *
   * @param projectPath Project path reported by a source.
   * @param sourceId Source identifier, or `null` for an orphan project.
   * @returns Cached project entry.
   */
  upsertProject(projectPath: string, sourceId?: string | null): Promise<CachedProject>;

  /**
   * Lists the OpenCodexUI-only project groups and ordered tree nodes.
   *
   * @returns Complete project tree snapshot.
   */
  listProjectGroups(): Promise<CachedProjectGroupsSnapshot>;

  /**
   * Creates an OpenCodexUI-only project group.
   *
   * @param input Group name and optional parent group.
   * @returns Created group.
   */
  createProjectGroup(input: CachedProjectGroupCreateInput): Promise<CachedProjectGroup>;

  /**
   * Updates an OpenCodexUI-only project group.
   *
   * @param groupId Group identifier.
   * @param patch Group fields to update.
   * @returns Updated group.
   */
  updateProjectGroup(
    groupId: string,
    patch: CachedProjectGroupUpdateInput
  ): Promise<CachedProjectGroup>;

  /**
   * Deletes a group while preserving its projects.
   *
   * @param groupId Group identifier.
   * @returns Promise resolved after children are promoted.
   */
  deleteProjectGroup(groupId: string): Promise<void>;

  /**
   * Moves a project into a group or back to the root.
   *
   * @param projectId Project identifier.
   * @param groupId Destination group, or `null` for the root.
   * @returns Promise resolved after the move.
   */
  assignProjectToGroup(projectId: string, groupId: string | null): Promise<void>;

  /**
   * Updates the hidden flag for a cached project.
   *
   * @param projectId Project identifier.
   * @param isHidden Whether the project should be hidden by default.
   * @returns Promise resolved when the update completes.
   */
  setProjectHidden(projectId: string, isHidden: boolean): Promise<void>;

  /**
   * Updates the user-defined display name for a cached project.
   *
   * @param projectId Project identifier.
   * @param displayName Display name, or `null` to fall back to the default name.
   * @returns Updated cached project, or `null` when the project no longer exists.
   */
  updateProjectDisplayName(
    projectId: string,
    displayName: string | null
  ): Promise<CachedProject | null>;

  /**
   * Updates project-level preferences.
   *
   * @param projectId Project identifier.
   * @param preferences Preferences to store.
   * @returns Updated cached project, or `null` when the project no longer exists.
   */
  updateProjectPreferences(
    projectId: string,
    preferences: CachedProjectPreferences
  ): Promise<CachedProject | null>;

  /**
   * Deletes a cached project.
   *
   * Existing cached threads are preserved and become orphaned.
   *
   * @param projectId Project identifier.
   * @returns Promise resolved when the project is deleted.
   */
  deleteProject(projectId: string): Promise<void>;

  /**
   * Lists cached projects.
   *
   * @returns Cached projects ordered for display.
   */
  listProjects(): Promise<CachedProject[]>;

  /**
   * Deletes empty orphan projects duplicated by an active source project.
   *
   * @returns Number of removed project rows.
   */
  deleteRedundantOrphanProjects(): Promise<number>;
}

/** Cache contract for persisted application logs. */
export interface LogCacheRepository {
  /**
   * Creates a persisted application log entry.
   *
   * @param input Log payload to persist.
   * @returns Created log entry.
   */
  createLog(input: CachedLogCreateInput): Promise<CachedLogEntry>;

  /**
   * Lists application logs from newest to oldest.
   *
   * @param query Log pagination query.
   * @returns Log page.
   */
  listLogs(query: CachedLogListQuery): Promise<CachedLogPage>;

  /**
   * Deletes one application log entry.
   *
   * @param logId Log identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteLog(logId: string): Promise<void>;

  /**
   * Deletes all application logs.
   *
   * @returns Promise resolved when deletion completes.
   */
  clearLogs(): Promise<void>;

  /**
   * Deletes application logs older than the provided timestamp.
   *
   * @param createdBefore Exclusive timestamp cutoff.
   * @returns Promise resolved when deletion completes.
   */
  clearLogsOlderThan(createdBefore: string): Promise<void>;
}
