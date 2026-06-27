/**
 * Converts project preferences into transport-safe DTOs.
 */
import type {
  OpenCodexProjectContextFolder,
  OpenCodexProjectPreferences
} from "@open-codex-ui/opencodex-protocol";

/**
 * Clones project preferences into plain structured-clone-compatible data.
 *
 * @param preferences Project preferences that may come from MobX state.
 * @returns Plain project preferences DTO.
 */
export function cloneProjectPreferences(
  preferences: OpenCodexProjectPreferences
): OpenCodexProjectPreferences {
  const clonedPreferences: OpenCodexProjectPreferences = {};

  if (preferences.git !== undefined) {
    clonedPreferences.git = {
      ...preferences.git
    };
  }

  if (preferences.context !== undefined) {
    clonedPreferences.context = {
      permissionsProfileId: preferences.context.permissionsProfileId,
      folders: cloneContextFolders(preferences.context.folders ?? []),
      lastSyncedAt: preferences.context.lastSyncedAt
    };
  }

  return clonedPreferences;
}

/**
 * Clones context folders into plain structured-clone-compatible data.
 *
 * @param folders Context folder collection that may come from MobX state.
 * @returns Plain context folder DTOs.
 */
export function cloneContextFolders(
  folders: readonly OpenCodexProjectContextFolder[]
): OpenCodexProjectContextFolder[] {
  return folders.map((folder) => ({
    id: folder.id,
    path: folder.path,
    label: folder.label,
    enabled: folder.enabled
  }));
}
