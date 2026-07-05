import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexProject,
  OpenCodexProjectContextFolder,
  OpenCodexProjectPreferences
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "./RootStore";
import {
  cloneContextFolders,
  cloneProjectPreferences
} from "./projectPreferencesDto";

const defaultPermissionsProfileId = "opencodex-context";

/**
 * Stores project-level external read-only context folders.
 */
export class ProjectContextStore {
  /** Whether the native folder picker is currently open. */
  isPickingFolder = false;
  /** Whether context preferences are being persisted. */
  isSaving = false;
  /** Whether the local `.codex/config.toml` sync is in flight. */
  isSyncing = false;

  /**
   * Creates the project context store.
   *
   * @param projectStore Owning project store.
   * @param root Root store used for backend requests.
   */
  constructor(
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ProjectContextStore, "projectStore" | "root">(this, {
      projectStore: false,
      root: false
    });
  }

  /** External context folders configured for the project. */
  get folders(): OpenCodexProjectContextFolder[] {
    return this.projectStore.project.preferences.context?.folders ?? [];
  }

  /** Local permissions profile id managed for this project. */
  get permissionsProfileId(): string {
    return this.projectStore.project.preferences.context?.permissionsProfileId ?? defaultPermissionsProfileId;
  }

  /** Timestamp of the last successful local config sync. */
  get lastSyncedAt(): string | null {
    return this.projectStore.project.preferences.context?.lastSyncedAt ?? null;
  }

  /** Whether the project can use Codex-backed context synchronization. */
  get isAvailable(): boolean {
    return this.projectStore.project.sourceId !== null && this.projectStore.isCodexSourceReady;
  }

  /** Whether the context config can be synchronized now. */
  get canSync(): boolean {
    return this.isAvailable && !this.isSyncing;
  }

  /**
   * Adds an external context folder or re-enables an existing one.
   *
   * @param path Folder path.
   * @returns Promise resolved when preferences are persisted.
   */
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

  /**
   * Lets the user pick a local folder path when the source supports it.
   *
   * @returns Selected folder path, or `null`.
   */
  async pickFolderPath(): Promise<string | null> {
    if (!this.isAvailable || this.isPickingFolder) {
      return null;
    }

    this.isPickingFolder = true;

    try {
      return await this.root.request<string | null>({
        type: "projects.context.pickFolder"
      });
    } finally {
      runInAction(() => {
        this.isPickingFolder = false;
      });
    }
  }

  /**
   * Picks a folder and adds it to project context.
   *
   * @returns Promise resolved when the flow completes.
   */
  async pickAndAddFolder(): Promise<void> {
    if (this.isSaving) {
      return;
    }

    const folderPath = await this.pickFolderPath();

    if (folderPath !== null) {
      await this.addFolder(folderPath);
    }
  }

  /**
   * Removes an external context folder.
   *
   * @param folderId Context folder identifier.
   * @returns Promise resolved when preferences are persisted.
   */
  async removeFolder(folderId: string): Promise<void> {
    await this.persistContext({
      folders: this.folders.filter((folder) => folder.id !== folderId),
      lastSyncedAt: null
    });
  }

  /**
   * Enables or disables an external context folder.
   *
   * @param folderId Context folder identifier.
   * @param enabled Whether the folder should be enabled.
   * @returns Promise resolved when preferences are persisted.
   */
  async setFolderEnabled(folderId: string, enabled: boolean): Promise<void> {
    await this.updateFolder(folderId, { enabled });
  }

  /**
   * Updates the display label for an external context folder.
   *
   * @param folderId Context folder identifier.
   * @param label Optional display label.
   * @returns Promise resolved when preferences are persisted.
   */
  async renameFolder(folderId: string, label: string | null): Promise<void> {
    const normalizedLabel = label?.trim();

    await this.updateFolder(folderId, {
      label: normalizedLabel !== undefined && normalizedLabel.length > 0 ? normalizedLabel : null
    });
  }

  /**
   * Writes the managed context permissions into the project config.
   *
   * @returns Promise resolved when synchronization completes.
   */
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

  /**
   * Applies a partial update to one context folder.
   *
   * @param folderId Context folder identifier.
   * @param patch Folder fields to update.
   * @returns Promise resolved when preferences are persisted.
   */
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

  /**
   * Persists context preferences through the project preferences endpoint.
   *
   * @param contextPatch Context preferences to merge.
   * @returns Promise resolved when preferences are persisted.
   */
  private async persistContext(
    contextPatch: NonNullable<OpenCodexProjectPreferences["context"]>
  ): Promise<void> {
    this.isSaving = true;

    try {
      const currentPreferences = cloneProjectPreferences(this.projectStore.project.preferences);
      const preferences: OpenCodexProjectPreferences = {
        ...currentPreferences,
        context: {
          permissionsProfileId: this.permissionsProfileId,
          ...contextPatch,
          folders: cloneContextFolders(contextPatch.folders ?? currentPreferences.context?.folders ?? [])
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

/**
 * Creates a stable client-side id for a context folder.
 *
 * @returns Context folder id.
 */
function createContextFolderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `context-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
