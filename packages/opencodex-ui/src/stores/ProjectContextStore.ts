import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexProject,
  OpenCodexProjectContextFolder,
  OpenCodexProjectPreferences
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "./RootStore";

const defaultPermissionsProfileId = "opencodex-context";

/**
 * Stores project-level external read-only context folders.
 */
export class ProjectContextStore {
  isPickingFolder = false;
  isSaving = false;
  isSyncing = false;

  constructor(
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ProjectContextStore, "projectStore" | "root">(this, {
      projectStore: false,
      root: false
    });
  }

  get folders(): OpenCodexProjectContextFolder[] {
    return this.projectStore.project.preferences.context?.folders ?? [];
  }

  get permissionsProfileId(): string {
    return this.projectStore.project.preferences.context?.permissionsProfileId ?? defaultPermissionsProfileId;
  }

  get lastSyncedAt(): string | null {
    return this.projectStore.project.preferences.context?.lastSyncedAt ?? null;
  }

  get isAvailable(): boolean {
    return this.projectStore.project.sourceId !== null && this.projectStore.isCodexSourceReady;
  }

  get canSync(): boolean {
    return this.isAvailable && !this.isSyncing;
  }

  async addFolder(path: string): Promise<void> {
    const normalizedPath = path.trim();

    if (normalizedPath.length === 0) {
      return;
    }

    const existingFolder = this.folders.find((folder) => folder.path === normalizedPath);

    if (existingFolder !== undefined) {
      await this.updateFolder(existingFolder.id, { enabled: true });
      return;
    }

    await this.persistContext({
      folders: [
        ...this.folders,
        {
          id: createContextFolderId(),
          path: normalizedPath,
          label: null,
          enabled: true
        }
      ],
      lastSyncedAt: null
    });
  }

  async pickAndAddFolder(): Promise<void> {
    if (!this.isAvailable || this.isPickingFolder || this.isSaving) {
      return;
    }

    this.isPickingFolder = true;

    try {
      const folderPath = await this.root.request<string | null>({
        type: "projects.context.pickFolder"
      });

      if (folderPath !== null) {
        await this.addFolder(folderPath);
      }
    } finally {
      runInAction(() => {
        this.isPickingFolder = false;
      });
    }
  }

  async removeFolder(folderId: string): Promise<void> {
    await this.persistContext({
      folders: this.folders.filter((folder) => folder.id !== folderId),
      lastSyncedAt: null
    });
  }

  async setFolderEnabled(folderId: string, enabled: boolean): Promise<void> {
    await this.updateFolder(folderId, { enabled });
  }

  async renameFolder(folderId: string, label: string | null): Promise<void> {
    const normalizedLabel = label?.trim();

    await this.updateFolder(folderId, {
      label: normalizedLabel !== undefined && normalizedLabel.length > 0 ? normalizedLabel : null
    });
  }

  async syncConfig(): Promise<void> {
    if (!this.canSync) {
      return;
    }

    this.isSyncing = true;

    try {
      const project = await this.root.request<OpenCodexProject>({
        type: "projects.context.sync",
        projectId: this.projectStore.project.id
      });
      runInAction(() => {
        this.projectStore.setProject(project);
      });
    } finally {
      runInAction(() => {
        this.isSyncing = false;
      });
    }
  }

  private async updateFolder(
    folderId: string,
    patch: Partial<Pick<OpenCodexProjectContextFolder, "enabled" | "label" | "path">>
  ): Promise<void> {
    await this.persistContext({
      folders: this.folders.map((folder) => (
        folder.id === folderId
          ? { ...folder, ...patch }
          : folder
      )),
      lastSyncedAt: null
    });
  }

  private async persistContext(
    contextPatch: NonNullable<OpenCodexProjectPreferences["context"]>
  ): Promise<void> {
    this.isSaving = true;

    try {
      const preferences: OpenCodexProjectPreferences = {
        ...this.projectStore.project.preferences,
        context: {
          permissionsProfileId: this.permissionsProfileId,
          ...contextPatch
        }
      };
      const project = await this.root.request<OpenCodexProject>({
        type: "projects.preferences.update",
        projectId: this.projectStore.project.id,
        patch: preferences
      });
      runInAction(() => {
        this.projectStore.setProject(project);
      });
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }
}

function createContextFolderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `context-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
