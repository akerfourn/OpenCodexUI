import type { TranslationShape } from "../../translationShape.js";
import type { frThreadPermissions } from "../fr/threadPermissions.js";

export const enThreadPermissions = {
  threadPermissions: {
    button: "Permissions",
    title: "Permissions for this chat",
    description: "View the permissions Codex actually applies to this conversation.",
    filesystem: "File access",
    readOnly: "Read only",
    workspaceWrite: "Write within the workspace",
    network: "Allow network access",
    managedNetwork: "Network access is managed by the custom profile.",
    saved: "Permissions for this chat have been applied and confirmed by Codex.",
    reviewer: "Approval request handling",
    manual: "Ask me",
    automatic: "Automatic review",
    custom: "Custom",
    onRequest: "Approval requested when additional access is needed",
    never: "No approval requests",
    policy: "Preserved policy: {{policy}}.",
    profile: "Active profile: {{name}}",
    workspace: "Workspace: {{path}}",
    protectedProfile: "This chat uses a custom profile or an isolated workspace. Its access is preserved; only approval handling can be changed here.",
    scope: "Changes apply to subsequent messages in this chat. History is preserved. Automatic review can deny an action; Codex restrictions still apply.",
    waitForIdle: "Wait for current operations to finish before managing permissions.",
    loading: "Reading or applying permissions",
    refresh: "Refresh",
    close: "Close",
    apply: "Apply"
  }
} as const satisfies TranslationShape<typeof frThreadPermissions>;
