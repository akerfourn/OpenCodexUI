import { normalizeProjectPath, type CachedSource } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";

import { getBackendLabels } from "../shared/errors.js";
import type {
  ProjectSourcePort,
  RuntimeSettingsPort
} from "../runtime/runtimePorts.js";

/** Dependencies needed for host-facing file, link, and project actions. */
export type HostIntegrationServiceOptions = {
  /** Provides the current settings for localized host integration errors. */
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  /** Provides the host project path used as a fallback link context. */
  projectPath: string | null;
  /** Resolves a source identifier to its cached source configuration. */
  projects: Pick<ProjectSourcePort, "resolveSource">;
  /** Lets the host application pick a local executable. */
  pickExecutableFile?: () => Promise<string | null> | string | null;
  /** Lets the host application pick image attachments. */
  pickImageFiles?: () => Promise<OpenCodexImageAttachment[]> | OpenCodexImageAttachment[];
  /** Opens a URL or source path through an optional host opener command. */
  openExternalLink?: (
    href: string,
    projectPath: string | null,
    openerCommand: string | null
  ) => Promise<void> | void;
  /** Opens a local project folder with the host file manager. */
  openProjectFolder?: (projectPath: string) => Promise<void> | void;
  /** Opens a host terminal with a local project as its working directory. */
  openProjectTerminal?: (projectPath: string) => Promise<void> | void;
};

/** Coordinates host integrations exposed by the backend transport. */
export class HostIntegrationService {
  /** Creates a host integration service. */
  constructor(
    /** Host pickers, openers, source resolver, and locale dependencies. */
    private readonly options: HostIntegrationServiceOptions
  ) {}

  /**
   * Opens the host executable picker for source commands.
   *
   * @returns Selected executable path, or `null` when no picker is configured.
   */
  async pickSourceExecutable(): Promise<string | null> {
    return await this.options.pickExecutableFile?.() ?? null;
  }

  /**
   * Opens the host image picker.
   *
   * @returns Selected image attachments, or an empty array when no picker is configured.
   */
  async pickImageFiles(): Promise<OpenCodexImageAttachment[]> {
    return await this.options.pickImageFiles?.() ?? [];
  }

  /**
   * Opens an external link through the host.
   *
   * @param href Link target.
   * @param projectPath Project path used as link context.
   * @param sourceId Source identifier, or `null` when no source is selected.
   * @returns Success result.
   * @throws When a non-empty link has no host opener.
   */
  async openLink(
    href: string,
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ ok: true }> {
    const target = href.trim();

    if (target.length === 0) {
      return { ok: true };
    }

    if (this.options.openExternalLink === undefined) {
      throw new Error(
        getBackendLabels(this.options.settings.getSettings().language).missingLinkHandler
      );
    }

    const source = sourceId === null ? null : await this.options.projects.resolveSource(sourceId);
    const openerCommand = readOpenFileCommand(source);

    await this.options.openExternalLink(
      target,
      this.resolveCurrentProjectPath(projectPath),
      openerCommand
    );
    return { ok: true };
  }

  /**
   * Opens a project folder through its configured source opener.
   *
   * @param projectPath Project folder path.
   * @param sourceId Source identifier, or `null` when no source is selected.
   * @returns Success result, including when the opener is unavailable.
   */
  async openProjectInIde(projectPath: string, sourceId: string | null): Promise<{ ok: true }> {
    if (sourceId === null) {
      return { ok: true };
    }

    const source = await this.options.projects.resolveSource(sourceId);
    const openerCommand = readOpenFolderCommand(source);

    if (openerCommand === null || this.options.openExternalLink === undefined) {
      return { ok: true };
    }

    await this.options.openExternalLink(projectPath, projectPath, openerCommand);
    return { ok: true };
  }

  /**
   * Opens a local project folder with the host file manager.
   *
   * @param projectPath Project folder path.
   * @param sourceId Source identifier, or `null` when no source is selected.
   * @returns Success result, including when the action is unsupported.
   */
  async openProjectFolder(projectPath: string, sourceId: string | null): Promise<{ ok: true }> {
    return await this.runLocalProjectHostAction(
      projectPath,
      sourceId,
      this.options.openProjectFolder
    );
  }

  /**
   * Opens a host terminal with a local project as its working directory.
   *
   * @param projectPath Project folder path.
   * @param sourceId Source identifier, or `null` when no source is selected.
   * @returns Success result, including when the action is unsupported.
   */
  async openProjectTerminal(projectPath: string, sourceId: string | null): Promise<{ ok: true }> {
    return await this.runLocalProjectHostAction(
      projectPath,
      sourceId,
      this.options.openProjectTerminal
    );
  }

  /**
   * Runs a host project action only for a local source.
   *
   * @param projectPath Project folder path.
   * @param sourceId Source identifier, or `null` when no source is selected.
   * @param action Host action to run.
   * @returns Success result, including when the action is unsupported.
   */
  private async runLocalProjectHostAction(
    projectPath: string,
    sourceId: string | null,
    action: ((projectPath: string) => Promise<void> | void) | undefined
  ): Promise<{ ok: true }> {
    if (sourceId === null || action === undefined) {
      return { ok: true };
    }

    const source = await this.options.projects.resolveSource(sourceId);

    if (source.kind !== "local") {
      return { ok: true };
    }

    await action(projectPath);
    return { ok: true };
  }

  /**
   * Resolves a current project path with the configured host fallback.
   *
   * @param projectPath Project path candidate.
   * @returns Normalized project path, or `null` when neither path is usable.
   */
  private resolveCurrentProjectPath(projectPath: string | null): string | null {
    return normalizeProjectPath(projectPath) ?? normalizeProjectPath(this.options.projectPath);
  }
}

/**
 * Reads the host-local file opener command from a source.
 *
 * @param source Source DTO, or `null`.
 * @returns File opener command, or `null` when host-local access is unavailable.
 */
function readOpenFileCommand(source: CachedSource | null): string | null {
  if (source === null || !sourceHasLocalAccess(source)) {
    return null;
  }

  return source.kind === "local" || source.kind === "custom"
    ? source.settings.openFileCommand
    : null;
}

/**
 * Reads the host-local folder opener command from a source.
 *
 * @param source Source DTO.
 * @returns Folder opener command, or `null` when host-local access is unavailable.
 */
function readOpenFolderCommand(source: CachedSource): string | null {
  if (!sourceHasLocalAccess(source)) {
    return null;
  }

  return source.kind === "local" || source.kind === "custom"
    ? source.settings.openFolderCommand
    : null;
}

/**
 * Checks whether a source can access paths on the Electron host filesystem.
 *
 * @param source Source DTO.
 * @returns Whether local file openers may be used.
 */
function sourceHasLocalAccess(source: CachedSource): boolean {
  if (source.kind === "local") {
    return true;
  }

  return source.kind === "custom" && source.settings.hasLocalAccess;
}
