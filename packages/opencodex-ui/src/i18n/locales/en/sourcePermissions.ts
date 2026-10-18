import type { TranslationShape } from "../../translationShape.js";
import type { frSourcePermissions } from "../fr/sourcePermissions";

export const enSourcePermissions = {
  sourcePermissions: {
    configure: "Configure",
    title: "Configure {{name}}",
    connection: "Connection",
    permissions: "Default permissions",
    scope: "These defaults apply to new chats on this source. Existing chats keep their own settings. A project can define its own defaults; Codex restrictions still apply.",
    filesystem: "File access",
    readOnly: "Read only",
    workspaceWrite: "Write inside the workspace",
    network: "Allow network access in workspace write mode",
    networkHelp: "This setting applies to write mode. In read-only mode, network access stays disabled with these simple modes.",
    managedNetwork: "Network access depends on the profile or context.",
    policy: "When to request approval",
    onRequest: "When Codex requests additional access",
    untrusted: "For commands not recognized as safe",
    never: "Never request approval",
    reviewer: "Who reviews requests",
    user: "Ask me",
    automatic: "Automatic review",
    reviewerHelp: "The policy determines when approval is needed. Automatic review handles these requests and can reject an action.",
    inherited: "Codex default / depends on context",
    custom: "Custom",
    profile: "Configured profile: {{name}}",
    protected: "Some settings are controlled by a custom profile, another configuration layer or administrator restrictions. They are preserved.",
    roots: "Additional writable roots preserved: {{paths}}",
    file: "Configuration: {{path}}",
    sharing: "Other sources using this file share these defaults. Configurations of already connected sources are compared.",
    sharedWith: "Configuration shared with: {{names}}.",
    unavailable: "Default permissions will be available when this source can connect to Codex.",
    refresh: "Refresh",
    cancel: "Cancel",
    apply: "Apply",
    saved: "Default permissions were saved and confirmed by Codex.",
    loading: "Reading or applying permissions",
    defaultSource: "Default source"
  }
} as const satisfies TranslationShape<typeof frSourcePermissions>;
