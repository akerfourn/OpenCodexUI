import type { CachedSourceColor } from "./foundations.js";

export type CachedSourceCommandMode = "auto" | "custom";
export type CachedSourceKind = "local" | "custom" | "wsl" | "ssh";

/**
 * Visual settings shared by every Codex source kind.
 */
export type CachedSourceCommonSettings = {
  color: CachedSourceColor;
};

/**
 * Host-local opener commands available only when the host can see source files.
 */
export type CachedSourceLocalAccessSettings = {
  openFolderCommand: string | null;
  openFileCommand: string | null;
};

/**
 * Settings for the automatically detected local Codex source.
 */
export type CachedSourceLocalSettings = CachedSourceCommonSettings &
  CachedSourceLocalAccessSettings & {
    commandMode: "auto";
    command: null;
  };

/**
 * Settings for an arbitrary user-provided Codex command.
 */
export type CachedSourceCustomSettings = CachedSourceCommonSettings &
  CachedSourceLocalAccessSettings & {
    commandMode: "custom";
    command: string | null;
    hasLocalAccess: boolean;
  };

/**
 * Settings for a future Windows Subsystem for Linux Codex source.
 */
export type CachedSourceWslSettings = CachedSourceCommonSettings & {
  distro: string | null;
  codexCommand: string;
};

/**
 * Settings for a future SSH-backed Codex source.
 */
export type CachedSourceSshSettings = CachedSourceCommonSettings & {
  host: string;
  user: string | null;
  port: number | null;
  identityFile: string | null;
  codexCommand: string;
};

export type CachedSourceSettings =
  | CachedSourceLocalSettings
  | CachedSourceCustomSettings
  | CachedSourceWslSettings
  | CachedSourceSshSettings;

export type CachedSourceSettingsPatch = Partial<
  CachedSourceCommonSettings &
    CachedSourceLocalAccessSettings & {
      commandMode: CachedSourceCommandMode;
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
 * Input used to create a source with its selected kind and settings.
 */
export type CachedSourceCreateInput = {
  kind: CachedSourceKind;
  settings?: CachedSourceSettingsPatch;
};

/**
 * Common metadata shared by all source kinds.
 */
export type CachedSourceBase = {
  id: string;
  name: string;
  lastDetectedCodexVersion: string | null;
  lastDetectedCodexAt: string | null;
  lastDetectionError: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Latest Codex CLI detection result stored for one source.
 */
export type CachedSourceCodexDetection = {
  version: string | null;
  checkedAt: string;
  error: string | null;
};

/**
 * Local source definition backed by a command on the current machine.
 */
export type CachedLocalSource = CachedSourceBase & {
  kind: "local";
  settings: CachedSourceLocalSettings;
};

export type CachedCustomSource = CachedSourceBase & {
  kind: "custom";
  settings: CachedSourceCustomSettings;
};

export type CachedWslSource = CachedSourceBase & {
  kind: "wsl";
  settings: CachedSourceWslSettings;
};

export type CachedSshSource = CachedSourceBase & {
  kind: "ssh";
  settings: CachedSourceSshSettings;
};

export type CachedSource = CachedLocalSource | CachedCustomSource | CachedWslSource | CachedSshSource;
