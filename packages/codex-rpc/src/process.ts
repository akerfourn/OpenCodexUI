/**
 * Resolves and starts the local Codex app-server process.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { isRecord } from "./events";
import type { ProcessLike } from "./types";
import { CodexProcessError } from "./types";

export type ResolvedCodexCommand = {
  command: string;
  args: string[];
};

/**
 * Spawns the Codex app-server process with piped standard streams.
 *
 * @param command Executable command to launch.
 * @param args Arguments passed to the executable.
 * @returns Process-like child process used by the client.
 */
export function defaultProcessFactory(command: string, args: string[]): ProcessLike {
  const resolvedCommand = resolveCodexCommand(command, args);

  return spawn(resolvedCommand.command, resolvedCommand.args, {
    stdio: ["pipe", "pipe", "pipe"]
  });
}

/**
 * Normalizes arbitrary spawn failures into a process error exposed by the client.
 *
 * @param error Raw error raised while spawning or interacting with the process.
 * @param command Command that triggered the failure.
 * @returns Normalized process error instance.
 */
export function normalizeProcessError(error: unknown, command: string): CodexProcessError {
  if (isRecord(error) && error.code === "ENOENT") {
    return new CodexProcessError(`Codex CLI was not found in PATH: ${command}.`);
  }

  if (error instanceof Error) {
    return new CodexProcessError(error.message);
  }

  return new CodexProcessError(String(error));
}

/**
 * Resolves the actual Codex executable path, including an optional Volta shim.
 *
 * @param command Requested command name.
 * @returns Executable path used to spawn the app-server process.
 */
export function resolveCodexCommandPath(command: string): string {
  if (command !== "codex") {
    return command;
  }

  if (process.env.OPENCODEX_CODEX_COMMAND !== undefined) {
    return process.env.OPENCODEX_CODEX_COMMAND;
  }

  for (const candidate of readCodexCommandCandidates()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return command;
}

/**
 * Resolves a command and preserves explicit command-line arguments.
 *
 * @param command Configured command or executable path.
 * @param args Default arguments passed to Codex.
 * @returns Executable path and complete argument list.
 */
export function resolveCodexCommand(command: string, args: string[]): ResolvedCodexCommand {
  const trimmedCommand = command.trim();

  if (trimmedCommand.length === 0) {
    return {
      command: resolveCodexCommandPath("codex"),
      args
    };
  }

  if (existsSync(trimmedCommand)) {
    return {
      command: trimmedCommand,
      args
    };
  }

  const parts = splitCommandLine(trimmedCommand);

  if (parts.length <= 1) {
    return {
      command: resolveCodexCommandPath(trimmedCommand),
      args
    };
  }

  const [executable, ...commandArgs] = parts;

  return {
    command: resolveCodexCommandPath(executable ?? trimmedCommand),
    args: [...commandArgs, ...args]
  };
}

/**
 * Splits a simple command line into executable and arguments.
 *
 * @param value Command line to split.
 * @returns Command-line parts with quoted segments preserved.
 */
function splitCommandLine(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if ((character === "\"" || character === "'") && quote === null) {
      quote = character;
      continue;
    }

    if (character === quote) {
      quote = null;
      continue;
    }

    if (character === " " && quote === null) {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

/**
 * Returns common Codex executable locations that may be absent from PATH.
 *
 * @returns Candidate executable paths ordered from most specific to generic.
 */
function readCodexCommandCandidates(): string[] {
  const candidates: string[] = [];

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    const userProfile = process.env.USERPROFILE;

    if (localAppData !== undefined && localAppData.length > 0) {
      candidates.push(path.join(localAppData, "OpenAI", "Codex", "bin", "codex.exe"));
      candidates.push(path.join(localAppData, "Volta", "bin", "codex.exe"));
      candidates.push(path.join(localAppData, "Volta", "bin", "codex.cmd"));
    }

    if (userProfile !== undefined && userProfile.length > 0) {
      candidates.push(path.join(userProfile, ".volta", "bin", "codex.exe"));
      candidates.push(path.join(userProfile, ".volta", "bin", "codex.cmd"));
    }

    return candidates;
  }

  const home = process.env.HOME;

  if (home !== undefined && home.length > 0) {
    candidates.push(path.join(home, ".volta", "bin", "codex"));
  }

  return candidates;
}
