/**
 * Coordinates OpenCodexUI-only project group persistence.
 */
import type {
  CachedProjectGroupCreateInput,
  CachedProjectGroupUpdateInput,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectGroupsSnapshot } from "@open-codex-ui/opencodex-protocol";
import type { RuntimeEventPort } from "../runtime/runtimePorts.js";

export type ProjectGroupServiceOptions = {
  cacheRepository: OpenCodexCacheRepository | null;
  events: Pick<RuntimeEventPort, "emit">;
};

/** Provides the UI-facing project group operations without involving Codex. */
export class ProjectGroupService {
  /** Creates a project group service. */
  constructor(private readonly options: ProjectGroupServiceOptions) {}

  /** Lists the current project groups and emits the snapshot to the UI. */
  async listGroups(): Promise<OpenCodexProjectGroupsSnapshot> {
    const snapshot = this.options.cacheRepository === null
      ? { groups: [], items: [] }
      : await this.options.cacheRepository.listProjectGroups();
    this.options.events.emit({ type: "projectGroups.updated", snapshot });
    return snapshot;
  }

  /** Creates a group and emits the updated tree. */
  async createGroup(input: CachedProjectGroupCreateInput): Promise<OpenCodexProjectGroupsSnapshot> {
    await this.requireRepository().createProjectGroup(input);
    return await this.listGroups();
  }

  /** Updates a group and emits the updated tree. */
  async updateGroup(
    groupId: string,
    patch: CachedProjectGroupUpdateInput
  ): Promise<OpenCodexProjectGroupsSnapshot> {
    await this.requireRepository().updateProjectGroup(groupId, patch);
    return await this.listGroups();
  }

  /** Deletes a group and promotes its children to the previous tree level. */
  async deleteGroup(groupId: string): Promise<OpenCodexProjectGroupsSnapshot> {
    await this.requireRepository().deleteProjectGroup(groupId);
    return await this.listGroups();
  }

  /** Assigns a project to a group or to the ungrouped root. */
  async assignProject(
    projectId: string,
    groupId: string | null
  ): Promise<OpenCodexProjectGroupsSnapshot> {
    await this.requireRepository().assignProjectToGroup(projectId, groupId);
    return await this.listGroups();
  }

  /** Returns the configured cache or raises when persistence is unavailable. */
  private requireRepository(): OpenCodexCacheRepository {
    if (this.options.cacheRepository === null) {
      throw new Error("Project group storage is unavailable.");
    }

    return this.options.cacheRepository;
  }
}
