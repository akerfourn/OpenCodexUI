import type { TranslationShape } from "../../translationShape.js";
import type { frWorkspaces } from "../fr/workspaces.js";

export const enWorkspaces = {
  "workspaceStorage": {
    "title": "Workspace storage",
    "description": "Configure storage folders for each source. Editing or removing a location does not move or delete existing workspaces.",
    "add": "Add storage location",
    "edit": "Configure location",
    "default": "Default",
    "makeDefault": "Use by default",
    "remove": "Remove this location",
    "source": "Codex source",
    "label": "Location name",
    "browse": "Choose folder",
    "pathHelp": "Choose an existing folder in this source. The app will create the project and workspace subfolders there. For WSL or SSH, enter a path in that environment.",
    "location": "Location",
    "custom": "Custom path",
    "pathPreview": "Path preview",
    "layoutHelp": "<workspace-id> will be replaced with a unique ID on creation. The repository files will be directly inside that folder.",
    "configureHint": "You can configure a default location in the Workspaces section. You can also enter a custom path here."
  },
  "workspaces": {
    "name": "Name",
    "properties": "Workspace properties",
    "save": "Save",
    "primaryHelp": "The Primary workspace is the base project directory and cannot be edited.",
    "pathHelp": "Worktree path. Renaming the workspace does not move this directory.",
    "unavailable": "Unavailable workspace",
    "empty": "No conversations",
    "newConversationIn": "New conversation in {{name}}",
    "actions": "Actions for workspace {{name}}",
    "manage": "Manage workspaces",
    "importHelp": "Existing worktrees in this repository will be added as workspaces. You can then rename them in their properties.",
    "importTitle": "Import existing workspaces",
    "switchSummary": "Subsequent messages will run in the chosen workspace. History retains its original context.",

    "newConversation": "New conversation…",
    "emptyConversation": "Codex cannot move an empty conversation yet. Create a conversation in the desired workspace using its + button.",
    "switch": "Switch workspace",
    "switchHelp": "Subsequent turns will use this directory. Approval settings are preserved. The profile limits writes to this workspace and configured shared folders, without network or temporary-directory writes. Internal conversation processes stop during resume; external services remain in their original directory. Finish sub-agents before continuing.",
    "current": "Workspace",
    "primary": "Primary",
    "create": "Create workspace",
    "discover": "Import existing workspaces",
    "recover": "Recover",
    "close": "Close",
    "destination": "Absolute path on the source",
    "destinationHelp": "Choose a new directory outside the primary checkout. The repository must be trusted in Codex.",
    "start": "Starting point",
    "newBranch": "New branch",
    "existingBranch": "Existing local branch",
    "detached": "Detached revision",
    "branch": "Branch name",
    "revision": "Starting revision",
    "pending": "Creation needs verification: {{path}}",
    "skipped": "Not imported: {{path}} ({{reason}})"
  }
} as const satisfies TranslationShape<typeof frWorkspaces>;
