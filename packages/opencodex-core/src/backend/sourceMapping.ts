/**
 * Maps and resolves Codex source cache records.
 */
import { resolveCodexCommandPath } from "@open-codex-ui/codex-rpc";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexSource } from "@open-codex-ui/opencodex-protocol";

import { LEGACY_DEFAULT_SOURCE_ID } from "./constants.js";

export function toOpenCodexSource(
  source: CachedSource,
  fallbackCommand: string,
  associatedProjectCount: number
): OpenCodexSource {
  const command = resolveSourceCommand(source, fallbackCommand);

  return {
    id: source.id,
    kind: source.kind,
    name: source.name,
    associatedProjectCount,
    settings: source.settings,
    resolvedCommand: resolveCodexCommandPath(command),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  };
}

export function resolveSourceCommand(source: CachedSource, fallbackCommand: string): string {
  if (
    source.settings.commandMode === "custom" &&
    source.settings.command !== null &&
    source.settings.command.length > 0
  ) {
    return source.settings.command;
  }

  return fallbackCommand;
}

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
    createdAt: now,
    updatedAt: now
  };
}
