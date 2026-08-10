/**
 * English translations for the application UI domain.
 */
import type { TranslationShape } from "../../translationShape.js";
import type { frApp } from "../fr/app.js";

export const enApp = {
  approval: {
    accept: "Accept",
    acceptForSession: "Accept for session",
    acceptWithExecpolicyAmendment: "Accept and allow {{command}}",
    applyNetworkPolicyAllow: "Allow {{host}}",
    applyNetworkPolicyDeny: "Block {{host}}",
    availableActions: "Available choices",
    cancel: "Cancel",
    command: "Command",
    commandDescription: "Codex wants to run this command.",
    copyRaw: "Copy technical details",
    cwd: "Working directory",
    decline: "Decline",
    fileChange: "File changes",
    fileChangeDescription: "Codex is asking to modify files within this scope.",
    grantRoot: "Allowed scope",
    other: "Codex request",
    otherDescription: "Codex is asking for approval to continue.",
    permissions: "Permissions",
    permissionsDescription: "Codex is asking for additional permissions to continue.",
    rawDetails: "Technical details",
    reason: "Reason",
    required: "Approval required"
  },
  header: {
    contextUsageTooltip:
      "Current context: {{used}} / {{max}} tokens used ({{percent}}%). Thread total: {{total}} tokens.",
    model: "Model: {{model}}",
    openProject: "Open project",
    reasoning: "Reasoning: {{effort}}",
    refresh: "Refresh",
    rename: "Rename"
  },
  onboarding: {
    codexDescription: "OpenCodexUI drives your local Codex installation. The app does not bundle Codex and does not use separate authentication.",
    codexDocs: "Codex documentation",
    codexMissing: "Codex is not detected for the default source.",
    codexOutdated: "This version is too old. You can force usage, but some actions may fail.",
    codexOutdatedStatus: "Codex is detected in version {{version}}, but this version is too old.",
    codexReady: "Codex is ready in version {{version}}.",
    codexTitle: "Codex CLI",
    finish: "Start",
    forceOutdatedCodex: "Force usage of this version",
    gitDescription: "Git lets OpenCodexUI track changes, prepare saves, and work with branches from the app.",
    gitMissing: "Git is not detected on this machine.",
    gitOptional: "Git is recommended for versioned projects, but you can continue without it.",
    gitReady: "Git is ready in version {{version}}.",
    gitTitle: "Git",
    refresh: "Check again",
    subtitle: "Check local prerequisites before you start working with Codex.",
    title: "Welcome to OpenCodexUI",
    unknownVersion: "unknown"
  },
  language: {
    en: "English",
    fr: "Français",
    label: "Language",
    system: "System"
  },
  settings: {
    advancedPerformanceMonitoring: "Advanced performance monitoring",
    advancedPerformanceMonitoringDescription: "Adds per-event-type details to automatic diagnostics. Available only in developer mode.",
    allowOutdatedCodex: "Allow outdated Codex versions",
    allowOutdatedCodexDescription: "Allows using a Codex source that is detected but older than the minimum supported version.",
    allowOutdatedCodexWarning: "This mode may produce errors during Codex actions if the local API does not provide expected features.",
    allowTurnSteering: "Allow steering while thinking",
    allowTurnSteeringDescription: "Allows sending a message into the active turn while Codex is thinking.",
    desktopNotifications: "Desktop notifications",
    desktopNotificationsDescription: "Shows local notifications without recording message content.",
    desktopNotificationsTurnCompleted: "Completed responses",
    desktopNotificationsTurnCompletedDescription: "Notify when a Codex response has actually completed.",
    desktopNotificationsApprovalRequested: "Approval requests",
    desktopNotificationsApprovalRequestedDescription: "Notify when an action is waiting for your approval.",
    discordRichPresence: "Show activity in Discord",
    discordRichPresenceDescription: "Publishes only a generic Discord status, without project names or chat content.",
    discordReconnect: "Reconnect Discord",
    developerMode: "Developer mode",
    developerModeDescription: "Enables advanced diagnostic actions.",
    enterKeyBehavior: "Enter key behavior",
    enterKeyBehaviorDescriptions: {
      newline: "Enter always inserts a new line. Ctrl+Enter sends the message.",
      send: "Enter always sends the message. Shift+Enter inserts a new line.",
      smart: "Enter sends single-line messages. After a line break, Enter keeps inserting new lines."
    },
    enterKeyBehaviorOptions: {
      newline: "Always insert a new line",
      send: "Always send the message",
      smart: "Smart behavior"
    },
    versioningVocabulary: "Versioning vocabulary",
    versioningVocabularyDescriptions: {
      simple: "Uses more accessible words like prepare and save.",
      technical: "Uses standard Git vocabulary like stage, commit, and staged."
    },
    versioningVocabularyOptions: {
      simple: "Simplified",
      technical: "Technical"
    },
    openDeveloperTools: "Open console",
    performanceMonitoring: "Monitor performance slowdowns",
    performanceMonitoringDescription: "Automatically detects slowdowns and creates a local diagnostic without recording chat content."
  },
  theme: {
    dark: "Dark",
    label: "Theme",
    light: "Light",
    system: "System"
  },
  tabs: {
    closeProject: "Close {{project}}",
    home: "Home",
    label: "Application tabs"
  }
} satisfies TranslationShape<typeof frApp>;
