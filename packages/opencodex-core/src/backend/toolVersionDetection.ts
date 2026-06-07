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

async function readResolvedCommandVersionStatus(
  command: ResolvedCodexCommand,
  label: string
): Promise<OpenCodexToolVersionStatus> {
  return await readCommandVersionStatus(command.command, command.args, command.shell, label);
}

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

function parseVersion(output: string): string | null {
  const match = output.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);

  return match?.[0] ?? null;
}

export function isCodexCliVersionSupported(version: string): boolean {
  return compareVersionNumbers(version, MINIMUM_CODEX_CLI_VERSION) >= 0;
}

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

function compareVersionNumbers(left: string, right: string): number {
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
