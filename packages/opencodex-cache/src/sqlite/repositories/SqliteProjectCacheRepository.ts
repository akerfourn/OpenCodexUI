import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedProject,
  CachedProjectGroup,
  CachedProjectGroupCreateInput,
  CachedProjectGroupsSnapshot,
  CachedProjectGroupUpdateInput,
  CachedProjectPreferences
} from "../../types/projects.js";
import type { ProjectCacheRepository } from "../../types/repositoryProjects.js";
import {
  assignProjectToGroup,
  createProjectGroup,
  deleteProjectGroup,
  listProjectGroups,
  updateProjectGroup
} from "../projectGroupQueries.js";
import {
  deleteProject,
  deleteRedundantOrphanProjects,
  listProjects,
  setProjectHidden,
  updateProjectDisplayName,
  updateProjectPreferences,
  upsertProject
} from "../projectQueries.js";

/** Provides project and project-group persistence through SQLite. */
export class SqliteProjectCacheRepository implements ProjectCacheRepository {
  /** SQLite database connection used by this repository. */
  private readonly database: BetterSqliteDatabase;

  /** Creates a project repository backed by the supplied database. */
  constructor(database: BetterSqliteDatabase) {
    this.database = database;
  }

  /** Inserts or refreshes a cached project. */
  async upsertProject(projectPath: string, sourceId: string | null = null): Promise<CachedProject> {
    return await upsertProject(this.database, projectPath, sourceId);
  }

  /** Lists cached projects. */
  async listProjects(): Promise<CachedProject[]> {
    return await listProjects(this.database);
  }

  /** Lists project groups and their mixed tree items. */
  async listProjectGroups(): Promise<CachedProjectGroupsSnapshot> {
    return await listProjectGroups(this.database);
  }

  /** Creates a project group. */
  async createProjectGroup(input: CachedProjectGroupCreateInput): Promise<CachedProjectGroup> {
    return await createProjectGroup(this.database, input);
  }

  /** Updates a project group. */
  async updateProjectGroup(
    groupId: string,
    patch: CachedProjectGroupUpdateInput
  ): Promise<CachedProjectGroup> {
    return await updateProjectGroup(this.database, groupId, patch);
  }

  /** Deletes a project group while retaining its children. */
  async deleteProjectGroup(groupId: string): Promise<void> {
    await deleteProjectGroup(this.database, groupId);
  }

  /** Assigns a project to a group or to the ungrouped root. */
  async assignProjectToGroup(projectId: string, groupId: string | null): Promise<void> {
    await assignProjectToGroup(this.database, projectId, groupId);
  }

  /** Deletes empty orphan project duplicates. */
  async deleteRedundantOrphanProjects(): Promise<number> {
    return await deleteRedundantOrphanProjects(this.database);
  }

  /** Updates a project's hidden state. */
  async setProjectHidden(projectId: string, isHidden: boolean): Promise<void> {
    await setProjectHidden(this.database, projectId, isHidden);
  }

  /** Updates a project's optional display name. */
  async updateProjectDisplayName(
    projectId: string,
    displayName: string | null
  ): Promise<CachedProject | null> {
    return await updateProjectDisplayName(this.database, projectId, displayName);
  }

  /** Updates a project's persisted preferences. */
  async updateProjectPreferences(
    projectId: string,
    preferences: CachedProjectPreferences
  ): Promise<CachedProject | null> {
    return await updateProjectPreferences(this.database, projectId, preferences);
  }

  /** Deletes a cached project. */
  async deleteProject(projectId: string): Promise<void> {
    await deleteProject(this.database, projectId);
  }
}
