import type {
  OpenCodexColorScheme,
  OpenCodexCommitMessageLanguage,
  OpenCodexEnterKeyBehavior,
  OpenCodexLanguage,
  OpenCodexReasoningEffort,
  OpenCodexVersioningVocabulary
} from "./foundations.js";
import type { OpenCodexCodexReleaseCheck } from "./sources.js";

/**
 * Persisted application settings shared by backend and UI.
 */
export type OpenCodexSettings = {
  /** Source-owned workspace storage locations; absent in older settings. */
  workspaceRoots?: OpenCodexWorkspaceRoot[];
  /** Remembers initial local storage setup, including subsequent user removal. */
  defaultWorkspaceRootInitialized?: boolean;
  codexCommand: string;
  codexReleaseCheck: OpenCodexCodexReleaseCheck;
  defaultSourceId: string | null;
  defaultUsageLimitId: string | null;
  defaultModel: string | null;
  defaultReasoningEffort: OpenCodexReasoningEffort | null;
  commitMessageModel: string | null;
  commitMessageReasoningEffort: OpenCodexReasoningEffort | null;
  commitMessageLanguage: OpenCodexCommitMessageLanguage;
  showActivityPanel: boolean;
  experimentalApi: boolean;
  allowTurnSteering: boolean;
  language: OpenCodexLanguage;
  colorScheme: OpenCodexColorScheme;
  enterKeyBehavior: OpenCodexEnterKeyBehavior;
  versioningVocabulary: OpenCodexVersioningVocabulary;
  desktopNotifications: OpenCodexDesktopNotificationSettings;
  discordRichPresenceEnabled: boolean;
  onboardingCompleted: boolean;
  allowOutdatedCodex: boolean;
  developerMode: boolean;
  performanceMonitoringEnabled: boolean;
  advancedPerformanceMonitoringEnabled: boolean;
};

/**
 * Desktop notification preferences handled by the Electron main process.
 */
export type OpenCodexDesktopNotificationSettings = {
  turnCompleted: boolean;
  approvalRequested: boolean;
};

/** A configured storage directory belongs to exactly one Codex source. */
export interface OpenCodexWorkspaceRoot {
  /** Stable settings identity, independent of its label. */
  id: string;
  /** Explicit filesystem owner. */
  sourceId: string;
  /** User-facing storage name. */
  label: string;
  /** Absolute path in the source filesystem. */
  path: string;
  /** One default per source when it has configured roots. */
  isDefault: boolean;
}
