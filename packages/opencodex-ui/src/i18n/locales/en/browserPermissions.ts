import type { TranslationShape } from "../../translationShape.js";
import type { frBrowserPermissions } from "../fr/browserPermissions.js";

export const enBrowserPermissions = {
  browserPermissions: {
    sourceTitle: "Browser permissions — source",
    chatTitle: "Browser permissions — chat",
    description: "Manage saved browser decisions. Resetting a rule allows a new approval request. Other Codex policies can still restrict access.",
    resource: "Permission",
    resources: {
      origins: "Website access",
      downloads: "Downloads",
      uploads: "File uploads",
      full_cdp: "Advanced browser access (CDP)"
    },
    inherited: "Global source rules",
    precedence: "A denial, globally or in this chat, takes precedence over an approval. Edit global rules from the source card.",
    globalRules: "Global decisions",
    chatRules: "Decisions for this chat",
    empty: "No saved decisions for this permission.",
    notLoaded: "Permissions could not be loaded.",
    allowed: "Allowed",
    denied: "Blocked",
    reset: "Reset",
    add: "Add",
    site: "Website or pattern",
    siteHelp: "Enter the full origin, such as https://pro.easyeda.com. Existing patterns are preserved exactly.",
    decision: "Decision",
    decisionFor: "Decision for {{site}}",
    refresh: "Refresh",
    close: "Close",
    reload: "Reload Codex connection",
    reloadNotice: "Saved. The browser may still cache the previous decision. Reload the connection to apply changes immediately; this action is available when agents are idle.",
    errors: {
      conflict: "The file changed since it was read. Refresh permissions before trying again.",
      busy: "An agent is still working. Wait for active actions to finish before reloading the connection.",
      unsupported: "These settings are not accessible for this source.",
      format: "The permissions file format is incompatible. No settings have been replaced.",
      invalid: "The source, chat, or permission is invalid.",
      unavailable: "Could not read or save browser permissions."
    }
  }
} satisfies TranslationShape<typeof frBrowserPermissions>;
