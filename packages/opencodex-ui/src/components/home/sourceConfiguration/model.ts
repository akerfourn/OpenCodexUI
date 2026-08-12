/**
 * Source configuration draft and pure conversions used by source forms.
 */
import type {
  OpenCodexSource,
  OpenCodexSourceColor,
  OpenCodexSourceKind,
  OpenCodexSourceSettingsPatch
} from "@open-codex-ui/opencodex-protocol";

export type SourceDraft = {
  kind: OpenCodexSourceKind;
  color: OpenCodexSourceColor;
  command: string;
  hasLocalAccess: boolean;
  openFolderCommand: string;
  openFileCommand: string;
  distro: string;
  codexCommand: string;
  host: string;
  user: string;
  port: string;
  identityFile: string;
};

/**
 * Creates an empty draft for a source kind.
 *
 * @param kind Source kind to configure.
 * @returns Draft initialized with safe defaults.
 */
export function createSourceDraft(kind: OpenCodexSourceKind): SourceDraft {
  return {
    kind,
    color: "blue",
    command: "",
    hasLocalAccess: kind === "local",
    openFolderCommand: "",
    openFileCommand: "",
    distro: "",
    codexCommand: "codex",
    host: "",
    user: "",
    port: "",
    identityFile: ""
  };
}

/**
 * Converts an existing source into an editable draft.
 *
 * @param source Existing source.
 * @returns Draft containing the source settings.
 */
export function sourceToDraft(source: OpenCodexSource): SourceDraft {
  const draft = createSourceDraft(source.kind);
  draft.color = source.settings.color;

  if (source.kind === "local") {
    draft.openFolderCommand = source.settings.openFolderCommand ?? "";
    draft.openFileCommand = source.settings.openFileCommand ?? "";
    return draft;
  }

  if (source.kind === "custom") {
    draft.command = source.settings.command ?? "";
    draft.hasLocalAccess = source.settings.hasLocalAccess;
    draft.openFolderCommand = source.settings.openFolderCommand ?? "";
    draft.openFileCommand = source.settings.openFileCommand ?? "";
    return draft;
  }

  if (source.kind === "wsl") {
    draft.distro = source.settings.distro ?? "";
    draft.codexCommand = source.settings.codexCommand;
    return draft;
  }

  draft.host = source.settings.host;
  draft.user = source.settings.user ?? "";
  draft.port = source.settings.port === null ? "" : String(source.settings.port);
  draft.identityFile = source.settings.identityFile ?? "";
  draft.codexCommand = source.settings.codexCommand;
  return draft;
}

/**
 * Converts a source draft into the settings patch expected by the backend.
 *
 * @param draft Source configuration draft.
 * @returns Settings relevant to the selected source kind.
 */
export function buildSourceSettings(draft: SourceDraft): OpenCodexSourceSettingsPatch {
  if (draft.kind === "custom") {
    return {
      color: draft.color,
      commandMode: "custom",
      command: draft.command.trim(),
      hasLocalAccess: draft.hasLocalAccess,
      openFolderCommand: draft.openFolderCommand.trim() || null,
      openFileCommand: draft.openFileCommand.trim() || null
    };
  }

  if (draft.kind === "wsl") {
    return {
      color: draft.color,
      distro: draft.distro.trim() || null,
      codexCommand: draft.codexCommand.trim() || "codex"
    };
  }

  if (draft.kind === "ssh") {
    return {
      color: draft.color,
      host: draft.host.trim(),
      user: draft.user.trim() || null,
      port: draft.port.trim() ? Number(draft.port) : null,
      identityFile: draft.identityFile.trim() || null,
      codexCommand: draft.codexCommand.trim() || "codex"
    };
  }

  return {
    color: draft.color,
    commandMode: "auto",
    command: null,
    openFolderCommand: draft.openFolderCommand.trim() || null,
    openFileCommand: draft.openFileCommand.trim() || null
  };
}

/**
 * Validates the fields that cannot be meaningfully inferred by the backend.
 *
 * @param draft Source configuration draft.
 * @returns Translation key for the first validation error, or `null`.
 */
export function validateSourceDraft(draft: SourceDraft): string | null {
  if (draft.kind === "custom" && draft.command.trim().length === 0) {
    return "sources.validation.commandRequired";
  }

  if (draft.kind === "ssh") {
    if (draft.host.trim().length === 0) {
      return "sources.validation.hostRequired";
    }

    if (draft.port.trim().length > 0) {
      const port = Number(draft.port);

      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return "sources.validation.portInvalid";
      }
    }
  }

  return null;
}
