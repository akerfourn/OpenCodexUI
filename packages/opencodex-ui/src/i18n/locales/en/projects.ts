/**
 * English translations for the project UI domain.
 */
import type { TranslationShape } from "../../translationShape.js";
import type { frProjects } from "../fr/projects.js";

export const enProjects = {
  project: {
    codexSourceUnavailable: "This project's Codex source is inactive. The project remains readable from the local cache.",
    orphanSource: "This project is no longer associated with a Codex source. It is read-only until it is resynchronized."
  },
  projectStatistics: {
    cachedInputTokens: "Cached input tokens",
    chats: "Chats",
    close: "Close",
    coverage: "{{known}} of {{total}} chat(s) with known usage",
    description: "Usage from chats present in the cache, including active and archived chats.",
    empty: "No chat is present in the cache for this project.",
    inputTokens: "Input tokens",
    loadError: "Unable to load project statistics.",
    loading: "Loading statistics...",
    outputTokens: "Output tokens",
    reasoningTokens: "Reasoning tokens",
    title: "Project statistics",
    totalTokens: "Total tokens",
    unknownChats: "Usage is unknown for {{count}} chat(s) and is not included in the total."
  },
  projectTools: {
    closePanel: "Collapse tools panel",
    commands: "Commands",
    context: "Context folders",
    git: "Git",
    openPanel: "Open tools panel",
    rules: "Authorizations",
    tasks: "Tasks",
    tabs: "Project tools"
  },
  contextFolders: {
    actions: "Folder actions",
    add: "Add",
    addDescription:
      "Select a local folder or type a path manually for remote or non-native sources.",
    addManualPath: "Add this path",
    addTitle: "Add context folder",
    cancel: "Cancel",
    delete: "Delete",
    deleteDescription: "Remove the \"{{name}}\" context folder? The Codex configuration will need to be synchronized again.",
    deleteTitle: "Remove this folder?",
    description: "Add folders Codex may read in addition to the current project.",
    empty: "No external folder configured.",
    lastSynced: "Synced on {{date}}",
    manualPath: "Manual path",
    manualPathPlaceholder: "/path/to/folder",
    name: "Display name",
    notSynced: "Configuration is not synchronized.",
    path: "Folder path",
    pickLocalFolder: "Select local folder",
    rename: "Rename",
    renameTitle: "Rename folder",
    remove: "Remove folder",
    save: "Save",
    sourceUnavailable: "The project's Codex source is inactive.",
    sync: "Synchronize Codex configuration",
    toggle: "Enable folder",
    trustRequired: "The project must be trusted before Codex loads .codex/config.toml."
  },
  trustProject: {
    cancel: "Later",
    confirmCheckbox: "I trust this project's local content",
    description: "Codex disabled this project's local config, hooks, and exec policies until the project is marked as trusted.",
    foldersLabel: "Affected folders",
    submit: "Trust project",
    title: "Trust this project?",
    warning: "Only accept if you trust the files in this repository, especially the .codex folder."
  }
} satisfies TranslationShape<typeof frProjects>;
