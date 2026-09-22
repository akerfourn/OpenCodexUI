import type { TranslationShape } from "../../translationShape.js";
import type { frFiles } from "../fr/files.js";

export const enFiles = {
  files: {
    folderOpeningMode: "Open folder links with",
    folderOpeningSystem: "The system file manager",
    folderOpeningDescription: "For sources with local access. Application mode uses the folder-opening command configured for the source. Explicit project menu actions remain unchanged.",

    openingMode: "Open file links with",
    openingIntegrated: "OpenCodexUI (built-in editor)",
    openingExternal: "The application configured for the source",
    openingDescription: "Applies to links in chats and the Git panel. Files outside the workspace use the external application. The Files explorer always opens the built-in editor.",
    openingSaveError: "Could not save this preference. The previous setting has been kept.",

    viewerFailed: "The editor could not load. Your content is still available to copy or save.",
    title: "Files",
    documents: "Open documents",
    chat: "Return to conversation",
    close: "Close {{name}}",
    save: "Save",
    reload: "Reload from disk",
    refresh: "Refresh file tree",
    retry: "Retry",
    external: "Open with an external application",
    emptyFolder: "Empty folder",
    showMore: "Show more",
    noWorkspace: "Select a workspace to browse its files.",
    sourceUnavailable: "The source is unavailable. Already opened documents remain readable.",
    readOnly: "Read only",
    mixedEol: "This file has mixed line endings. It remains read only to preserve its format.",
    conflict:
      "This file changed on disk. Your edits are preserved. Explicitly reload to resolve the conflict, or keep the document open to inspect and copy your content.",
    details: "Technical details",
    unsavedTitle: "Unsaved changes",
    unsavedDescription:
      "Save these documents before continuing? Their contents will be preserved if saving fails.",
    discard: "Discard changes",
    access: {
      manage: "Manage access…",
      description: "This permission applies to the Files module, for all links to this destination in this workspace. It does not change Codex or command permissions. Links to other external destinations require separate authorization.",
      denied: "Blocked",
      readOnly: "Read only",
      readWrite: "Read and write",
      cancel: "Cancel",
      saveError: "Could not save this permission. Refresh the tree if the link destination changed."
    },
    errors: {
      accessDenied: "Access to this external destination is not authorized. Right-click the link to manage access.",
      unavailable: "Cannot access this source. Remote sources require Node.js and the Codex process API.",
      inaccessible: "The file is inaccessible or was deleted. Already opened content is preserved.",
      symlink: "This symbolic link forms a loop and cannot be followed.",
      tooLarge: "Limit reached: files up to 2 MiB and directories up to 10,000 entries.",
      binary: "This file is not a supported text file.",
      encoding: "Only UTF-8 text files, with or without a BOM, can be edited.",
      conflict: "The file changed on disk. It has not been overwritten.",
      readOnly: "This file is read only.",
      invalidPath: "This path is not allowed in the selected workspace."
    }
  }
} as const satisfies TranslationShape<typeof frFiles>;
