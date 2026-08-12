import type { OpenCodexReasoningEffort, OpenCodexReasoningEffortOption } from "./foundations.js";

/**
 * Source kind supported by the current app version.
 */
export type OpenCodexSourceKind = "local" | "custom" | "wsl" | "ssh";

/**
 * Source command resolution mode.
 */
export type OpenCodexSourceCommandMode = "auto" | "custom";

/**
 * Source accent color used in source/project UI.
 */
export type OpenCodexSourceColor = "blue" | "indigo" | "purple" | "pink" | "red" | "orange" | "amber" | "teal";

/**
 * Availability state for host tools such as Git and Codex CLI.
 */
export type OpenCodexToolAvailabilityStatus = "ready" | "outdated" | "unavailable";

/**
 * Codex service-tier identifier selected for a turn.
 */
export type OpenCodexServiceTier = string;

/**
 * One service tier supported by a Codex model.
 */
export type OpenCodexModelServiceTier = {
  id: OpenCodexServiceTier;
  name: string;
  description: string;
};

/**
 * Model metadata returned by Codex or local fallback detection.
 */
export type OpenCodexModel = {
  id: string;
  model: string;
  displayName: string;
  supportedReasoningEfforts: OpenCodexReasoningEffortOption[];
  defaultReasoningEffort: OpenCodexReasoningEffort | null;
  serviceTiers: OpenCodexModelServiceTier[];
};

/**
 * Detected version and availability for a command-line tool.
 */
export type OpenCodexToolVersionStatus = {
  status: OpenCodexToolAvailabilityStatus;
  version: string | null;
  message: string | null;
  checkedAt: string;
};

/**
 * Last global Codex release metadata check persisted in app settings.
 */
export type OpenCodexCodexReleaseCheck = {
  latestVersion: string | null;
  checkedAt: string | null;
  error: string | null;
};

/**
 * Per-source update status derived from local detection and global release metadata.
 */
export type OpenCodexCodexUpdateStatus = {
  supported: boolean;
  updateAvailable: boolean;
  latestVersion: string | null;
  checkedAt: string | null;
  message: string | null;
};

/**
 * Candidate Codex command discovered for source configuration.
 */
export type OpenCodexCommandCandidate = {
  command: string;
  linkTarget: string | null;
  codex: OpenCodexToolVersionStatus;
};

/**
 * Visual settings shared by every Codex source kind.
 */
export type OpenCodexSourceCommonSettings = {
  color: OpenCodexSourceColor;
};

/**
 * Host-local opener commands available when source files are visible locally.
 */
export type OpenCodexSourceLocalAccessSettings = {
  openFolderCommand: string | null;
  openFileCommand: string | null;
};

/**
 * Local-source specific settings.
 */
export type OpenCodexSourceLocalSettings = OpenCodexSourceCommonSettings &
  OpenCodexSourceLocalAccessSettings & {
    commandMode: "auto";
    command: null;
  };

/**
 * Custom command source settings.
 */
export type OpenCodexSourceCustomSettings = OpenCodexSourceCommonSettings &
  OpenCodexSourceLocalAccessSettings & {
    commandMode: "custom";
    command: string | null;
    hasLocalAccess: boolean;
  };

/**
 * WSL source settings.
 */
export type OpenCodexSourceWslSettings = OpenCodexSourceCommonSettings & {
  distro: string | null;
  codexCommand: string;
};

/**
 * SSH source settings.
 */
export type OpenCodexSourceSshSettings = OpenCodexSourceCommonSettings & {
  host: string;
  user: string | null;
  port: number | null;
  identityFile: string | null;
  codexCommand: string;
};

export type OpenCodexSourceSettings =
  | OpenCodexSourceLocalSettings
  | OpenCodexSourceCustomSettings
  | OpenCodexSourceWslSettings
  | OpenCodexSourceSshSettings;

export type OpenCodexSourceSettingsPatch = Partial<
  OpenCodexSourceCommonSettings &
    OpenCodexSourceLocalAccessSettings & {
      commandMode: OpenCodexSourceCommandMode;
      command: string | null;
      hasLocalAccess: boolean;
      distro: string | null;
      codexCommand: string;
      host: string;
      user: string | null;
      port: number | null;
      identityFile: string | null;
    }
>;

/**
 * Common metadata shared by every source kind.
 */
export type OpenCodexSourceBase = {
  id: string;
  kind: OpenCodexSourceKind;
  name: string;
  associatedProjectCount: number;
  codex: OpenCodexToolVersionStatus;
  codexUpdate: OpenCodexCodexUpdateStatus;
  createdAt: string;
  updatedAt: string;
};

/**
 * Local Codex source running on the Electron host or a configured command.
 */
export type OpenCodexLocalSource = OpenCodexSourceBase & {
  kind: "local";
  settings: OpenCodexSourceLocalSettings;
  resolvedCommand: string;
  commandCandidates: OpenCodexCommandCandidate[];
};

/**
 * Custom command source.
 */
export type OpenCodexCustomSource = OpenCodexSourceBase & {
  kind: "custom";
  settings: OpenCodexSourceCustomSettings;
  resolvedCommand: string;
  commandCandidates: OpenCodexCommandCandidate[];
};

/**
 * WSL source running through a Windows host bridge.
 */
export type OpenCodexWslSource = OpenCodexSourceBase & {
  kind: "wsl";
  settings: OpenCodexSourceWslSettings;
  resolvedCommand: string;
  commandCandidates: OpenCodexCommandCandidate[];
};

/**
 * SSH source running Codex app-server on a remote machine.
 */
export type OpenCodexSshSource = OpenCodexSourceBase & {
  kind: "ssh";
  settings: OpenCodexSourceSshSettings;
  resolvedCommand: string;
  commandCandidates: OpenCodexCommandCandidate[];
};

/**
 * Discriminated source union exposed to the UI.
 */
export type OpenCodexSource = OpenCodexLocalSource | OpenCodexCustomSource | OpenCodexWslSource | OpenCodexSshSource;
