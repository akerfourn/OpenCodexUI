/**
 * Checks and applies standalone Codex CLI updates.
 */
import { realpathSync } from "node:fs";

import {
  resolveCodexCommand,
  resolveCodexCommandPath
} from "@open-codex-ui/codex-rpc";
import type { ResolvedCodexCommand } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexCodexReleaseCheck,
  OpenCodexCodexUpdateStatus,
  OpenCodexSettings,
  OpenCodexSource,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";

import { compareVersionNumbers } from "./toolVersionDetection.js";
import type { RuntimeSettingsPort } from "../runtime/runtimePorts.js";
import { runCodexUpdateProcess, type CodexUpdateProcessRunner } from "./codexUpdateProcess.js";
import { isStandaloneCodexPath } from "./codexUpdatePaths.js";
import { getWslLaunch, resolveWslCodexUpdate } from "./wslCodexUpdate.js";

type CodexUpdateServiceOptions = {
  settings: Pick<RuntimeSettingsPort, "getSettings" | "setSettings">;
  saveSettings(settings: OpenCodexSettings): Promise<void> | void;
  refreshSources(): Promise<OpenCodexSource[]>;
  logger?(message: string): void;
  /** Isolates process I/O for deterministic tests without touching installed Codex binaries. */
  runProcess?: CodexUpdateProcessRunner;
};

const releaseCheckTtlMs = 60 * 60 * 1000;
const releaseCheckTimeoutMs = 5_000;
const updateTimeoutMs = 10 * 60 * 1000;
const latestReleaseUrl = "https://api.github.com/repos/openai/codex/releases/latest";

/**
 * Owns global Codex release metadata checks and standalone update execution.
 */
export class CodexUpdateService {
  /**
   * Creates the update service.
   *
   * @param options Settings, source refresh, persistence, and logging adapters.
   */
  constructor(private readonly options: CodexUpdateServiceOptions) {}

  /**
   * Refreshes the globally cached latest Codex release when stale.
   *
   * @param force Whether to bypass the hourly cache.
   * @returns Persisted release check state.
   */
  async checkLatestRelease(force: boolean): Promise<OpenCodexCodexReleaseCheck> {
    const settings = this.options.settings.getSettings();
    const currentCheck = settings.codexReleaseCheck;

    if (!force && !isReleaseCheckStale(currentCheck)) {
      return currentCheck;
    }

    const nextCheck = await this.fetchLatestRelease();
    const nextSettings = {
      ...settings,
      codexReleaseCheck: nextCheck
    };

    this.options.settings.setSettings(nextSettings);
    await this.options.saveSettings(nextSettings);
    return nextCheck;
  }

  /**
   * Applies `codex update` for one eligible standalone source.
   *
   * @param source Source to update.
   * @param fallbackCommand Global Codex command used by automatic local sources.
   * @returns Refreshed source list after the update attempt.
   */
  async updateSource(source: OpenCodexSource, fallbackCommand: string): Promise<OpenCodexSource[]> {
    const resolvedCommand = await this.resolveUpdateCommand(source, fallbackCommand);
    if (resolvedCommand === null) {
      throw new Error("Codex update is only supported for standalone local or WSL sources.");
    }

    const result = await (this.options.runProcess ?? runCodexUpdateProcess)(resolvedCommand, updateTimeoutMs);
    const output = [result.stdout, result.stderr].join("\n").trim();

    if (result.exitCode !== 0) {
      throw new Error(`Codex update failed with code ${result.exitCode}. ${output}`.trim());
    }

    this.options.logger?.(output.length > 0 ? output : "Codex update completed.");
    await this.checkLatestRelease(true);
    const sources = await this.options.refreshSources();
    const updated = sources.find(candidate => candidate.id === source.id);
    if (updated === undefined || updated.codex.version === null) {
      throw new Error("The updated Codex source version could not be verified.");
    }
    if (source.codexUpdate.updateAvailable && source.codex.version !== null
      && compareVersionNumbers(updated.codex.version, source.codex.version) <= 0) {
      throw new Error("Codex update completed, but this source still reports the old version. Check for a command pinned to an old release.");
    }
    return sources;
  }

  /**
   * Derives per-source update state from local version and cached latest release.
   *
   * @param source Source with local Codex version detection.
   * @param fallbackCommand Global Codex command used by automatic local sources.
   * @returns Update availability status.
   */
  async getSourceUpdateStatus(
    source: OpenCodexSource,
    fallbackCommand: string
  ): Promise<OpenCodexCodexUpdateStatus> {
    const releaseCheck = this.options.settings.getSettings().codexReleaseCheck;
    let isSupported = false;
    let message = "Automatic update is only available for standalone Codex installs.";
    try {
      isSupported = await this.resolveUpdateCommand(source, fallbackCommand) !== null;
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      this.options.logger?.(`Codex update detection failed for ${source.id}: ${message}`);
    }

    if (!isSupported) {
      return {
        supported: false,
        updateAvailable: false,
        latestVersion: releaseCheck.latestVersion,
        checkedAt: releaseCheck.checkedAt,
        message
      };
    }

    return createUpdateStatus(source.codex, releaseCheck);
  }

  /** Resolves eligibility in the executable's own filesystem and rechecks it before every update. */
  private async resolveUpdateCommand(source: OpenCodexSource, fallbackCommand: string): Promise<ResolvedCodexCommand | null> {
    const wslLaunch = getWslLaunch(source);
    if (wslLaunch !== null) {
      return await resolveWslCodexUpdate(wslLaunch, this.options.runProcess ?? runCodexUpdateProcess);
    }
    if (!isStandaloneSourceLike(source, fallbackCommand)) return null;
    const commandLine = source.kind === "custom" ? source.settings.command ?? fallbackCommand : fallbackCommand;
    return resolveCodexCommand(commandLine, ["update"]);
  }

  /**
   * Reads GitHub latest release metadata with a bounded timeout.
   *
   * @returns Release check state.
   */
  private async fetchLatestRelease(): Promise<OpenCodexCodexReleaseCheck> {
    const checkedAt = new Date().toISOString();
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, releaseCheckTimeoutMs);

    try {
      const response = await fetch(latestReleaseUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "OpenCodexUI"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        return {
          latestVersion: null,
          checkedAt,
          error: `GitHub release check failed with HTTP ${response.status}.`
        };
      }

      const payload = await response.json() as { tag_name?: unknown };
      const latestVersion = normalizeReleaseVersion(
        typeof payload.tag_name === "string" ? payload.tag_name : null
      );

      if (latestVersion === null) {
        return {
          latestVersion: null,
          checkedAt,
          error: "GitHub release metadata did not contain a Codex version."
        };
      }

      return {
        latestVersion,
        checkedAt,
        error: null
      };
    } catch (error) {
      return {
        latestVersion: null,
        checkedAt,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
/**
 * Checks whether a cached release check should be refreshed.
 *
 * @param releaseCheck Last release check state.
 * @returns Whether a new network check is allowed.
 */
function isReleaseCheckStale(releaseCheck: OpenCodexCodexReleaseCheck): boolean {
  if (releaseCheck.checkedAt === null) {
    return true;
  }

  const checkedAtMs = Date.parse(releaseCheck.checkedAt);

  if (Number.isNaN(checkedAtMs)) {
    return true;
  }

  return Date.now() - checkedAtMs >= releaseCheckTtlMs;
}

/**
 * Maps one source and the cached latest version into update state.
 *
 * @param codex Local Codex detection status.
 * @param releaseCheck Cached latest release metadata.
 * @returns Update availability status.
 */
function createUpdateStatus(
  codex: OpenCodexToolVersionStatus,
  releaseCheck: OpenCodexCodexReleaseCheck
): OpenCodexCodexUpdateStatus {
  if (releaseCheck.error !== null) {
    return {
      supported: true,
      updateAvailable: false,
      latestVersion: releaseCheck.latestVersion,
      checkedAt: releaseCheck.checkedAt,
      message: releaseCheck.error
    };
  }

  if (codex.version === null || releaseCheck.latestVersion === null) {
    return {
      supported: true,
      updateAvailable: false,
      latestVersion: releaseCheck.latestVersion,
      checkedAt: releaseCheck.checkedAt,
      message: "Codex update availability could not be determined."
    };
  }

  const updateAvailable = compareVersionNumbers(releaseCheck.latestVersion, codex.version) > 0;

  return {
    supported: true,
    updateAvailable,
    latestVersion: releaseCheck.latestVersion,
    checkedAt: releaseCheck.checkedAt,
    message: updateAvailable ? null : "Codex is up to date."
  };
}

/**
 * Checks host-local standalone eligibility using executable paths rather than command arguments.
 *
 * @param source Source DTO with the configured executable.
 * @param fallbackCommand Command used for automatic local sources.
 * @returns Whether automatic update is supported.
 */
function isStandaloneSourceLike(
  source: Pick<OpenCodexSource, "kind" | "settings" | "resolvedCommand">,
  fallbackCommand: string
): boolean {
  if (source.kind !== "local" && source.kind !== "custom") {
    return false;
  }

  const commandLine = source.kind === "custom"
    ? (source.settings as { command: string | null }).command ?? fallbackCommand
    : fallbackCommand;
  const resolvedCommand = resolveCodexCommand(commandLine, []);
  const resolvedPath = resolvedCommand.command === "codex"
    ? resolveCodexCommandPath("codex")
    : resolvedCommand.command;
  let pathForCheck = resolvedPath;
  if (source.resolvedCommand !== "codex") {
    pathForCheck = resolveCodexCommand(source.resolvedCommand, []).command;
  }
  const realPathForCheck = readRealPath(pathForCheck);

  return isStandaloneCodexPath(pathForCheck) || isStandaloneCodexPath(realPathForCheck);
}

/**
 * Resolves symlinks when possible while preserving command names.
 *
 * @param value Path or command to inspect.
 * @returns Real filesystem path, or the original value when it cannot be resolved.
 */
function readRealPath(value: string): string {
  try {
    return realpathSync(value);
  } catch {
    return value;
  }
}

/**
 * Normalizes Codex release tags such as `rust-v0.141.0`.
 *
 * @param value Raw release tag.
 * @returns Normalized semantic version, or `null`.
 */
function normalizeReleaseVersion(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value
    .replace(/^rust-v/, "")
    .replace(/^v/, "");

  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized)
    ? normalized
    : null;
}
