/**
 * Checks and applies standalone Codex CLI updates.
 */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";

import {
  resolveCodexCommand,
  resolveCodexCommandPath
} from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexCodexReleaseCheck,
  OpenCodexCodexUpdateStatus,
  OpenCodexSettings,
  OpenCodexSource,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";

import { compareVersionNumbers } from "./toolVersionDetection.js";

type CodexUpdateServiceOptions = {
  getSettings(): OpenCodexSettings;
  setSettings(settings: OpenCodexSettings): void;
  saveSettings(settings: OpenCodexSettings): Promise<void> | void;
  refreshSources(): Promise<OpenCodexSource[]>;
  logger?(message: string): void;
};

type ProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
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
    const settings = this.options.getSettings();
    const currentCheck = settings.codexReleaseCheck;

    if (!force && !isReleaseCheckStale(currentCheck)) {
      return currentCheck;
    }

    const nextCheck = await this.fetchLatestRelease();
    const nextSettings = {
      ...settings,
      codexReleaseCheck: nextCheck
    };

    this.options.setSettings(nextSettings);
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
    if (!isStandaloneSource(source)) {
      throw new Error("Codex update is only supported for standalone local sources.");
    }

    const commandLine = source.kind === "custom"
      ? source.settings.command ?? fallbackCommand
      : fallbackCommand;
    const resolvedCommand = resolveCodexCommand(commandLine, ["update"]);
    const result = await runProcess(
      resolvedCommand.command,
      resolvedCommand.args,
      resolvedCommand.shell,
      updateTimeoutMs
    );
    const output = [result.stdout, result.stderr].join("\n").trim();

    if (result.exitCode !== 0) {
      throw new Error(`Codex update failed with code ${result.exitCode}. ${output}`.trim());
    }

    this.options.logger?.(output.length > 0 ? output : "Codex update completed.");
    await this.checkLatestRelease(true);
    return await this.options.refreshSources();
  }

  /**
   * Derives per-source update state from local version and cached latest release.
   *
   * @param source Source with local Codex version detection.
   * @param fallbackCommand Global Codex command used by automatic local sources.
   * @returns Update availability status.
   */
  getSourceUpdateStatus(
    source: Pick<OpenCodexSource, "kind" | "settings" | "codex" | "resolvedCommand">,
    fallbackCommand: string
  ): OpenCodexCodexUpdateStatus {
    const releaseCheck = this.options.getSettings().codexReleaseCheck;
    const isSupported = isStandaloneSourceLike(source, fallbackCommand);

    if (!isSupported) {
      return {
        supported: false,
        updateAvailable: false,
        latestVersion: releaseCheck.latestVersion,
        checkedAt: releaseCheck.checkedAt,
        message: "Automatic update is only available for standalone Codex installs."
      };
    }

    return createUpdateStatus(source.codex, releaseCheck);
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
 * Checks whether a protocol source can be updated by `codex update`.
 *
 * @param source Source DTO.
 * @returns Whether automatic update is supported.
 */
function isStandaloneSource(source: OpenCodexSource): boolean {
  return isStandaloneSourceLike(source, "codex");
}

/**
 * Checks standalone eligibility without requiring a full source DTO.
 *
 * @param source Source-like object.
 * @param fallbackCommand Global Codex command.
 * @returns Whether the resolved command points to a standalone install.
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
  const pathForCheck = source.resolvedCommand !== "codex" ? source.resolvedCommand : resolvedPath;
  const realPathForCheck = readRealPath(pathForCheck);

  return isStandalonePath(pathForCheck) || isStandalonePath(realPathForCheck);
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
 * Checks whether a path points inside the managed standalone install.
 *
 * @param value Path to inspect.
 * @returns Whether the path is a standalone Codex executable path.
 */
function isStandalonePath(value: string): boolean {
  return value.includes("/.codex/packages/standalone/") ||
    value.includes("\\.codex\\packages\\standalone\\");
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

/**
 * Executes a bounded process and captures output.
 *
 * @param command Executable command.
 * @param args Process arguments.
 * @param shell Whether to spawn through a shell.
 * @param timeoutMs Maximum runtime.
 * @returns Captured process result.
 */
function runProcess(
  command: string,
  args: string[],
  shell: boolean,
  timeoutMs: number
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out while running ${command}.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, stdout, stderr });
    });
  });
}
