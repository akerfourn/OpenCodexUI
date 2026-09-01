import type { CachedSourceColor } from "./foundations.js";

/**
 * Cached project row derived from a source-reported working directory.
 */
export type CachedProject = {
  id: string;
  sourceId: string | null;
  path: string;
  defaultName: string;
  displayName: string | null;
  isHidden: boolean;
  preferences: CachedProjectPreferences;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  editedAt: string;
};

/**
 * OpenCodexUI-only project group.
 */
export type CachedProjectGroup = {
  id: string;
  name: string;
  color: CachedSourceColor;
  isCollapsed: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Ordered project tree node persisted by OpenCodexUI.
 */
export type CachedProjectTreeItem =
  | {
      type: "group";
      groupId: string;
      parentGroupId: string | null;
      sortOrder: number;
    }
  | {
      type: "project";
      projectId: string;
      parentGroupId: string | null;
      sortOrder: number;
    };

/**
 * Complete project tree snapshot stored in the local cache.
 */
export type CachedProjectGroupsSnapshot = {
  groups: CachedProjectGroup[];
  items: CachedProjectTreeItem[];
};

/** Input used to create a project group. */
export type CachedProjectGroupCreateInput = {
  name: string;
  color?: CachedSourceColor;
  parentGroupId?: string | null;
};

/** Partial update applied to one project group. */
export type CachedProjectGroupUpdateInput = {
  name?: string;
  color?: CachedSourceColor;
  isCollapsed?: boolean;
};

/**
 * User-editable and generated preferences attached to one cached project.
 */
export type CachedProjectPreferences = {
  git?: {
    referenceTagName?: string | null;
    deferredPaths?: string[];
    commitProtectedBranches?: string[];
  };
  context?: {
    permissionsProfileId?: string | null;
    folders?: CachedProjectContextFolder[];
    lastSyncedAt?: string | null;
  };
};

/** Permission applied to files in an external context folder. */
export type CachedProjectContextFolderPermission = "read" | "write";

/** Permission applied to `.env` files inside external context folders. */
export type CachedProjectContextEnvFilePermission = "deny" | "read" | "write";

/**
 * External folder that should be exposed as project context.
 */
export type CachedProjectContextFolder = {
  id: string;
  path: string;
  label: string | null;
  enabled: boolean;
  permission?: CachedProjectContextFolderPermission;
  envFilePermission?: CachedProjectContextEnvFilePermission;
};
