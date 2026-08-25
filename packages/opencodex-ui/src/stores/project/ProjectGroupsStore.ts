import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexProjectGroupsSnapshot,
  OpenCodexSourceColor
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../RootStore";
import type { RootChildStore } from "../RootChildStore";

/** Stores the OpenCodexUI-only project grouping tree. */
export class ProjectGroupsStore implements RootChildStore {
  groups: OpenCodexProjectGroupsSnapshot["groups"] = [];
  items: OpenCodexProjectGroupsSnapshot["items"] = [];
  isLoading = false;

  /** Creates the project groups store. */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<ProjectGroupsStore, "root">(this, { root: false });
  }

  /** Applies project group events emitted by the backend. */
  handleEvent(event: OpenCodexEvent): void {
    if (event.type !== "projectGroups.updated") {
      return;
    }

    this.applySnapshot(event.snapshot);
  }

  /** Loads the persisted project grouping tree. */
  async refresh(): Promise<void> {
    this.isLoading = true;

    try {
      const snapshot = await this.root.request<OpenCodexProjectGroupsSnapshot>(
        { type: "projectGroups.list" }
      );
      runInAction(() => {
        this.applySnapshot(snapshot);
        this.isLoading = false;
      });
    } catch {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  /** Creates a group. */
  createGroup(
    name: string,
    color: OpenCodexSourceColor = "blue",
    parentGroupId: string | null = null
  ): void {
    void this.root.request({ type: "projectGroups.create", name, color, parentGroupId });
  }

  /** Updates a group. */
  updateGroup(
    groupId: string,
    patch: { name?: string; color?: OpenCodexSourceColor; isCollapsed?: boolean }
  ): void {
    void this.root.request({ type: "projectGroups.update", groupId, patch });
  }

  /** Toggles the persisted collapsed state of a group. */
  toggleGroup(groupId: string): void {
    const group = this.groups.find((entry) => entry.id === groupId);
    if (group === undefined) {
      return;
    }

    this.updateGroup(groupId, { isCollapsed: !group.isCollapsed });
  }

  /** Deletes a group while retaining its child projects. */
  deleteGroup(groupId: string): void {
    void this.root.request({ type: "projectGroups.delete", groupId });
  }

  /** Assigns a project to a group or to the root. */
  assignProject(projectId: string, groupId: string | null): void {
    void this.root.request({ type: "projectGroups.assignProject", projectId, groupId });
  }

  /** Returns the group currently containing a project. */
  getProjectGroupId(projectId: string): string | null {
    return this.items.find((item) => item.type === "project" && item.projectId === projectId)
      ?.parentGroupId ?? null;
  }

  /** Applies one complete backend snapshot. */
  private applySnapshot(snapshot: OpenCodexProjectGroupsSnapshot): void {
    this.groups = snapshot.groups;
    this.items = snapshot.items;
    this.isLoading = false;
  }
}
