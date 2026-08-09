import type {
  OpenCodexCodexReleaseCheck,
  OpenCodexEvent,
  OpenCodexSource
} from "@open-codex-ui/opencodex-protocol";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { SourceUpdateRuntimeHandler } from "../src/backend/SourceUpdateRuntimeHandler";

describe("SourceUpdateRuntimeHandler", () => {
  it("should check the release with force and emit sources with the current default", async () => {
    const releaseCheck = createReleaseCheck();
    const source = createSource("source-1");
    const operations: string[] = [];
    const checkLatestRelease = vi.fn(async (force: boolean) => {
      operations.push(`check:${String(force)}`);
      return releaseCheck;
    });
    const listOpenCodexSources = vi.fn(async () => {
      operations.push("list");
      return [source];
    });
    const emit = vi.fn<(event: OpenCodexEvent) => void>((event) => {
      operations.push(event.type);
    });
    const handler = new SourceUpdateRuntimeHandler({
      settings: createSettingsPort("source-1"),
      projects: { listOpenCodexSources },
      updates: { checkLatestRelease, updateSource: vi.fn() },
      hasActiveTurn: () => false,
      clients: createClientPort(),
      events: { emit }
    });

    await expect(handler.checkCodexRelease(true)).resolves.toBe(releaseCheck);

    expect(checkLatestRelease).toHaveBeenCalledWith(true);
    expect(operations).toEqual(["check:true", "list", "sources.updated"]);
    expect(emit).toHaveBeenCalledWith({
      type: "sources.updated",
      sources: [source],
      defaultSourceId: "source-1"
    });
  });

  it("should reject an active turn before resolving the source", async () => {
    const listOpenCodexSources = vi.fn(async () => [createSource("source-1")]);
    const handler = new SourceUpdateRuntimeHandler({
      settings: createSettingsPort(null),
      projects: { listOpenCodexSources },
      updates: {
        checkLatestRelease: vi.fn(async () => createReleaseCheck()),
        updateSource: vi.fn()
      },
      hasActiveTurn: vi.fn(() => true),
      clients: createClientPort(),
      events: { emit: vi.fn() }
    });

    await expect(handler.updateCodexSource("source-1")).rejects.toThrow(
      "Codex update cannot start while this source has an active turn."
    );
    expect(listOpenCodexSources).not.toHaveBeenCalled();
  });

  it("should report the exact error when the requested source is missing", async () => {
    const listOpenCodexSources = vi.fn(async () => [createSource("other-source")]);
    const handler = new SourceUpdateRuntimeHandler({
      settings: createSettingsPort(null),
      projects: { listOpenCodexSources },
      updates: {
        checkLatestRelease: vi.fn(async () => createReleaseCheck()),
        updateSource: vi.fn()
      },
      hasActiveTurn: () => false,
      clients: createClientPort(),
      events: { emit: vi.fn() }
    });

    await expect(handler.updateCodexSource("missing-source")).rejects.toThrow(
      "Source not found: missing-source"
    );
  });

  it("should update with the current command, restart after success, and return sources", async () => {
    const source = createSource("source-1");
    const updatedSources = [createSource("source-1"), createSource("source-2")];
    const operations: string[] = [];
    const updateSource = vi.fn(async (selectedSource: OpenCodexSource, fallbackCommand: string) => {
      operations.push("update");
      expect(selectedSource).toBe(source);
      expect(fallbackCommand).toBe("codex-current");
      return updatedSources;
    });
    const restartClient = vi.fn(async () => {
      operations.push("restart");
    });
    const handler = new SourceUpdateRuntimeHandler({
      settings: createSettingsPort(null, "codex-current"),
      projects: { listOpenCodexSources: vi.fn(async () => [source]) },
      updates: {
        checkLatestRelease: vi.fn(async () => createReleaseCheck()),
        updateSource
      },
      hasActiveTurn: () => false,
      clients: createClientPort(restartClient),
      events: { emit: vi.fn() }
    });

    await expect(handler.updateCodexSource(source.id)).resolves.toBe(updatedSources);

    expect(operations).toEqual(["update", "restart"]);
    expect(restartClient).toHaveBeenCalledWith(source.id);
  });

  it("should not restart the source when the update fails", async () => {
    const updateError = new Error("update failed");
    const restartClient = vi.fn(async () => undefined);
    const handler = new SourceUpdateRuntimeHandler({
      settings: createSettingsPort(null),
      projects: {
        listOpenCodexSources: vi.fn(async () => [createSource("source-1")])
      },
      updates: {
        checkLatestRelease: vi.fn(async () => createReleaseCheck()),
        updateSource: vi.fn(async () => {
          throw updateError;
        })
      },
      hasActiveTurn: () => false,
      clients: createClientPort(restartClient),
      events: { emit: vi.fn() }
    });

    await expect(handler.updateCodexSource("source-1")).rejects.toBe(updateError);
    expect(restartClient).not.toHaveBeenCalled();
  });
});

function createSettingsPort(
  defaultSourceId: string | null,
  codexCommand = "codex"
) {
  const settings = {
    codexCommand,
    defaultSourceId
  } as OpenCodexSettings;

  return {
    getSettings: vi.fn(() => settings),
    setSettings: vi.fn((nextSettings: OpenCodexSettings) => {
      Object.assign(settings, nextSettings);
    })
  };
}

function createClientPort(restartClient = vi.fn(async () => undefined)) {
  return {
    ensureClient: vi.fn(async () => undefined as unknown as CodexAppServerClient),
    getClient: vi.fn(() => undefined),
    restartClient
  };
}

/** Creates a release check value suitable for handler tests. */
function createReleaseCheck(): OpenCodexCodexReleaseCheck {
  return {
    latestVersion: "1.12.0",
    checkedAt: "2026-08-09T00:00:00.000Z",
    error: null
  };
}

/** Creates a minimal source DTO for source selection tests. */
function createSource(id: string): OpenCodexSource {
  return {
    id,
    kind: "local",
    name: id,
    associatedProjectCount: 0,
    codex: {
      status: "ready",
      version: "1.12.0",
      message: null,
      checkedAt: "2026-08-09T00:00:00.000Z"
    },
    codexUpdate: {
      supported: true,
      updateAvailable: false,
      latestVersion: "1.12.0",
      checkedAt: "2026-08-09T00:00:00.000Z",
      message: null
    },
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    settings: {
      color: "blue",
      openFolderCommand: null,
      openFileCommand: null,
      commandMode: "auto",
      command: null
    },
    resolvedCommand: "codex",
    commandCandidates: []
  };
}
