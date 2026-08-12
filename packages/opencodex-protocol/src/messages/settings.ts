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
