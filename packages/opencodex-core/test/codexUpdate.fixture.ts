import { vi } from "vitest";
import type { OpenCodexSettings, OpenCodexSource } from "@open-codex-ui/opencodex-protocol";
import { CodexUpdateService } from "../src/backend/sources/CodexUpdateService";
import type { CodexUpdateProcessRunner } from "../src/backend/sources/codexUpdateProcess";

export const standalonePath = "/home/test/.codex/packages/standalone/releases/0.162.1/bin/codex";

/** Configures a direct Linux executable independently of Windows PATH and host filesystem probes. */
export function updateSource(): Extract<OpenCodexSource, { kind: "wsl" }> {
  return { id: "wsl-a", kind: "wsl", name: "Ubuntu", associatedProjectCount: 0,
    settings: { color: "blue", distro: "Ubuntu", codexCommand: "/home/test/.local/bin/codex" },
    resolvedCommand: "wsl.exe -d Ubuntu -- /home/test/.local/bin/codex", commandCandidates: [],
    codex: { version: "0.162.1", status: "ready", checkedAt: "fixed", message: null },
    codexUpdate: { supported: true, updateAvailable: true, latestVersion: "0.163.0", checkedAt: "fixed", message: null },
    createdAt: "fixed", updatedAt: "fixed" };
}

/** Existing custom WSL commands remain supported without inferring a remote filesystem from the source name. */
export function customUpdateSource(command: string): Extract<OpenCodexSource, { kind: "custom" }> {
  return { ...updateSource(), kind: "custom", resolvedCommand: command,
    settings: { color: "blue", commandMode: "custom", command, hasLocalAccess: false,
      openFolderCommand: null, openFileCommand: null } };
}

/** Uses real update selection and version verification with deterministic process, network and refresh boundaries. */
export function updateFixture(source: OpenCodexSource = updateSource()) {
  let settings = { codexCommand: standalonePath, codexReleaseCheck: {
    latestVersion: "0.163.0", checkedAt: "2026-10-18T00:00:00.000Z", error: null
  } } as OpenCodexSettings;
  const run = vi.fn<CodexUpdateProcessRunner>(async command => {
    if (command.args.includes("opencodex-update-probe")) return { exitCode: 0,
      stdout: `/home/test/.local/bin/codex\0${standalonePath}\0Ubuntu\0`, stderr: "" };
    return { exitCode: 0, stdout: "Updated Codex", stderr: "" };
  });
  const refreshSources = vi.fn(async () => [{ ...source, codex: { ...source.codex, version: "0.163.0" } }]);
  const logger = vi.fn();
  const service = new CodexUpdateService({
    settings: { getSettings: () => settings, setSettings: value => { settings = value; } },
    saveSettings: vi.fn(), refreshSources, runProcess: run, logger
  });
  return { source, service, run, refreshSources, logger };
}
