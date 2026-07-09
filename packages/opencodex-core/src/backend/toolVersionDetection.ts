/**
 * Detects local command versions without starting long-lived services.
 */
import { spawn } from "node:child_process";

import {
  readCodexCommandCandidates,
  resolveCodexCommand,
  type ResolvedCodexCommand
} from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexCommandCandidate,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";

import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import { resolveSourceCommand } from "./sourceMapping.js";

type ProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

const versionTimeoutMs = 4_000;
export const MINIMUM_CODEX_CLI_VERSION = "0.137.0";

/**
 * Reads the Codex CLI version for one configured source.
 *
 * @param source Source configuration.
 * @param fallbackCommand Global fallback Codex command.
 * @returns Tool availability with detected version when available.
 */
export async function readCodexVersionStatus(
  source: CachedSource,
  fallbackCommand: string
): Promise<OpenCodexToolVersionStatus> {
  const commandLine = resolveSourceCommand(source, fallbackCommand);
  const resolvedCommand = resolveCodexCommand(commandLine, ["--version"]);
  const status = await readResolvedCommandVersionStatus(resolvedCommand, "Codex CLI");

  if (status.status !== "ready") {
    return status;
  }

  if (status.version === null) {
    return {
      ...status,
      status: "unavailable",
      message: "Codex CLI version could not be detected."
    };
  }

  if (isCodexCliVersionSupported(status.version)) {
    return status;
  }

  return {
    ...status,
    status: "outdated",
    message: `Codex CLI ${status.version} is older than required ${MINIMUM_CODEX_CLI_VERSION}.`
  };
}

/**
 * Reads the host Git version.
 *
 * @returns Git availability with detected version when available.
 */
export async function readGitVersionStatus(): Promise<OpenCodexToolVersionStatus> {
  return await readCommandVersionStatus("git", ["--version"], false, "Git");
}

/**
 * Reads every auto-detected Codex command candidate and its version status.
 *
 * @returns Command candidates with per-command availability.
 */
export async function readCodexCommandCandidateStatuses(): Promise<OpenCodexCommandCandidate[]> {
  const candidates = readCodexCommandCandidates();
  const candidateStatuses = await Promise.all(candidates.map(async (candidate) => {
    const resolvedCommand = resolveCodexCommand(candidate, ["--version"]);

    return {
      command: resolvedCommand.command,
      codex: await readResolvedCommandVersionStatus(resolvedCommand, "Codex CLI")
    };
  }));

  return uniqueCommandCandidates(candidateStatuses);
}

/**
 * Reads a version status from an already resolved command line.
 *
 * @param command Command and arguments resolved for the current OS/source.
 * @param label Tool label used in diagnostics.
 * @returns Tool availability status.
 */
async function readResolvedCommandVersionStatus(
  command: ResolvedCodexCommand,
  label: string
): Promise<OpenCodexToolVersionStatus> {
  return await readCommandVersionStatus(command.command, command.args, command.shell, label);
}

/**
 * Runs one short-lived command and maps its version output.
 *
 * @param command Executable or shell command.
 * @param args Arguments appended to the command.
 * @param shell Whether Node should launch through a shell.
 * @param label Tool label used in diagnostics.
 * @returns Tool availability status.
 */
async function readCommandVersionStatus(
  command: string,
  args: string[],
  shell: boolean,
  label: string
): Promise<OpenCodexToolVersionStatus> {
  const checkedAt = new Date().toISOString();

  try {
    const result = await runProcess(command, args, shell);
    const output = [result.stdout, result.stderr].join("\n").trim();
    const version = parseVersion(output);

    if (result.exitCode !== 0) {
      return {
        status: "unavailable",
        version,
        message: `${label} exited with code ${result.exitCode}. ${output}`.trim(),
        checkedAt
      };
    }

    return {
      status: "ready",
      version,
      message: output.length > 0 ? output : null,
      checkedAt
    };
  } catch (error) {
    return {
      status: "unavailable",
      version: null,
      message: error instanceof Error ? error.message : String(error),
      checkedAt
    };
  }
}

/**
 * Executes a bounded version-detection process.
 *
 * @param command Executable or shell command.
 * @param args Arguments appended to the command.
 * @param shell Whether Node should launch through a shell.
 * @returns Captured exit code and output.
 */
function runProcess(command: string, args: string[], shell: boolean): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out while detecting ${command}.`));
    }, versionTimeoutMs);

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
      resolve({
        exitCode,
        stdout,
        stderr
      });
    });
  });
}

/**
 * Extracts the first semantic version-looking token from command output.
 *
 * @param output Combined stdout/stderr output.
 * @returns Version string, or `null` when absent.
 */
function parseVersion(output: string): string | null {
  const match = output.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);

  return match?.[0] ?? null;
}

/**
 * Checks whether a Codex CLI version satisfies the current app requirement.
 *
 * @param version Detected Codex CLI version.
 * @returns Whether the version is supported.
 */
export function isCodexCliVersionSupported(version: string): boolean {
  return compareVersionNumbers(version, MINIMUM_CODEX_CLI_VERSION) >= 0;
}

/**
 * Removes duplicate candidate commands while preserving first-seen order.
 *
 * @param candidates Versioned command candidates.
 * @returns Unique candidates by command string.
 */
function uniqueCommandCandidates(candidates: OpenCodexCommandCandidate[]): OpenCodexCommandCandidate[] {
  const uniqueCandidates: OpenCodexCommandCandidate[] = [];
  const seenCommands = new Set<string>();

  for (const candidate of candidates) {
    const key = process.platform === "win32"
      ? candidate.command.toLowerCase()
      : candidate.command;

    if (seenCommands.has(key)) {
      continue;
    }

    seenCommands.add(key);
    uniqueCandidates.push(candidate);
  }

  return uniqueCandidates;
}

/**
 * Compares two semantic versions by major/minor/patch.
 *
 * @param left Left version.
 * @param right Right version.
 * @returns Positive, zero, or negative comparison result.
 */
export function compareVersionNumbers(left: string, right: string): number {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);

  for (let index = 0; index < 3; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

/**
 * Parses major/minor/patch numbers from a semantic version.
 *
 * @param version Version string.
 * @returns Three numeric version parts, or zeros when parsing fails.
 */
function parseVersionParts(version: string): number[] {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);

  if (match === null) {
    return [0, 0, 0];
  }

  return [
    Number.parseInt(match[1] ?? "0", 10),
    Number.parseInt(match[2] ?? "0", 10),
    Number.parseInt(match[3] ?? "0", 10)
  ];
}
