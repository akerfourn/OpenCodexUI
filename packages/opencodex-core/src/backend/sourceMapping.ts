/**
 * Maps and resolves Codex source cache records.
 */
import { resolveCodexCommandPath } from "@open-codex-ui/codex-rpc";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexCodexUpdateStatus,
  OpenCodexCommandCandidate,
  OpenCodexSource,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";

import { LEGACY_DEFAULT_SOURCE_ID } from "./constants.js";

/**
 * Converts a cached source into the protocol source DTO.
 *
 * @param source Cached source row.
 * @param fallbackCommand Default Codex command.
 * @param associatedProjectCount Number of projects linked to the source.
 * @param codex Latest Codex CLI detection status.
 * @param commandCandidates Candidate Codex commands shown in settings.
 * @returns Protocol source.
 */
export function toOpenCodexSource(
  source: CachedSource,
  fallbackCommand: string,
  associatedProjectCount: number,
  codex: OpenCodexToolVersionStatus,
  codexUpdate: OpenCodexCodexUpdateStatus,
  commandCandidates: OpenCodexCommandCandidate[]
): OpenCodexSource {
  const command = resolveSourceCommand(source, fallbackCommand);
  const base = {
    id: source.id,
    name: source.name,
    associatedProjectCount,
    codex,
    codexUpdate,
    resolvedCommand: resolveCodexCommandPath(command),
    commandCandidates,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  };

  switch (source.kind) {
    case "custom":
      return { ...base, kind: "custom", settings: source.settings };
    case "wsl":
      return { ...base, kind: "wsl", settings: source.settings };
    case "ssh":
      return { ...base, kind: "ssh", settings: source.settings };
    default:
      return { ...base, kind: "local", settings: source.settings };
  }
}

/**
 * Resolves the Codex command configured for a source.
 *
 * @param source Cached source row.
 * @param fallbackCommand Default command used when the source is automatic.
 * @returns Command string to launch Codex.
 */
export function resolveSourceCommand(source: CachedSource, fallbackCommand: string): string {
  if (source.kind === "custom") {
    return source.settings.command ?? fallbackCommand;
  }

  if (source.kind === "wsl") {
    return resolveWslCommand(source.settings.distro, source.settings.codexCommand);
  }

  if (source.kind === "ssh") {
    return resolveSshCommand(source.settings);
  }

  return fallbackCommand;
}

/**
 * Creates the in-memory fallback source used before SQLite is available.
 *
 * @returns Default cached source.
 */
export function createDefaultCachedSource(): CachedSource {
  const now = new Date().toISOString();

  return {
    id: LEGACY_DEFAULT_SOURCE_ID,
    kind: "local",
    name: "Default",
    settings: {
      commandMode: "auto",
      command: null,
      color: "blue",
      openFolderCommand: null,
      openFileCommand: null
    },
    lastDetectedCodexVersion: null,
    lastDetectedCodexAt: null,
    lastDetectionError: null,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Builds a WSL command string for a source.
 *
 * @param distro Optional WSL distribution.
 * @param codexCommand Codex command inside WSL.
 * @returns Host command that starts Codex through WSL.
 */
function resolveWslCommand(distro: string | null, codexCommand: string): string {
  const command = codexCommand.trim().length > 0 ? codexCommand.trim() : "codex";

  if (distro === null) {
    return `wsl.exe ${command}`;
  }

  return `wsl.exe --distribution ${quoteShellToken(distro)} ${command}`;
}

/**
 * Builds an SSH command string for a source.
 *
 * @param settings SSH source settings.
 * @returns Host command that starts Codex on the remote host.
 */
function resolveSshCommand(settings: Extract<CachedSource, { kind: "ssh" }>["settings"]): string {
  const parts = ["ssh", "-T"];

  if (settings.port !== null) {
    parts.push("-p", String(settings.port));
  }

  if (settings.identityFile !== null) {
    parts.push("-i", quoteShellToken(settings.identityFile));
  }

  const remoteTarget = settings.user === null ? settings.host : `${settings.user}@${settings.host}`;
  parts.push(quoteShellToken(remoteTarget));
  parts.push(settings.codexCommand.trim().length > 0 ? settings.codexCommand.trim() : "codex");

  return parts.join(" ");
}

/**
 * Quotes one shell token for generated command strings.
 *
 * @param value Raw token.
 * @returns POSIX-safe shell token.
 */
function quoteShellToken(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
