import type {
  OpenCodexEvent,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { ProjectRuntimeHandler } from "../src/backend/ProjectRuntimeHandler";

describe("ProjectRuntimeHandler", () => {
  it("should keep cacheless project reads and adapters deterministic", async () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const handler = createHandler((event) => emittedEvents.push(event));

    await expect(handler.listProjects()).resolves.toEqual([]);
    await expect(handler.listProjectGroups()).resolves.toEqual({ groups: [], items: [] });
    await expect(handler.listProjectTasks("project-1")).resolves.toEqual([]);
    await expect(handler.readProjectStatistics("/workspace/project", null)).resolves.toEqual({
      chatCount: 0,
      chatsWithTokenUsage: 0,
      chatsWithoutTokenUsage: 0,
      tokenUsage: {
        totalTokens: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0
      }
    });

    expect(handler.ensureSourcesInitialized).toBe(handler.ensureSourcesInitialized);
    expect(handler.resolveSource).toBe(handler.resolveSource);
    await expect(handler.resolveRequestedSource(null)).resolves.toMatchObject({ id: "default" });
    await expect(handler.resolveRequestedSource("missing-source"))
      .rejects.toThrow("Codex source not found: missing-source");
    expect(emittedEvents).toEqual([
      { type: "projects.updated", projects: [] },
      { type: "projectGroups.updated", snapshot: { groups: [], items: [] } }
    ]);
  });

  it("should emit trust requests through the stable stderr adapter", () => {
    const emit = vi.fn<(event: OpenCodexEvent) => void>();
    const handler = createHandler(emit);

    handler.handleCodexStderr(
      [
        "Project-local config, hooks, and exec policies are disabled.",
        "Please add /workspace/project as a trusted project in ~/.codex/config.toml",
        "  1. /workspace/project/.codex"
      ].join("\n"),
      "source-1"
    );

    expect(emit).toHaveBeenCalledWith({
      type: "project.trust.required",
      projectPath: "/workspace/project",
      disabledFolders: ["/workspace/project/.codex"]
    });
  });
});

/** Builds handler dependencies without constructing a client or cache. */
function createHandler(
  emit: (event: OpenCodexEvent) => void
): ProjectRuntimeHandler {
  const settings = createSettings();
  const backendOptions = {
    settings,
    projectPath: "/workspace/project",
    emit
  };

  return new ProjectRuntimeHandler({
    backendOptions,
    cacheRepository: null,
    settings: {
      getSettings: () => settings,
      setSettings: (nextSettings) => Object.assign(settings, nextSettings)
    },
    events: { emit },
    clients: {
      ensureClient: async () => {
        throw new Error("A Codex client was not expected in this test.");
      },
      restartClient: async () => undefined
    },
    hasActiveTurn: () => false,
    updates: {
      getSourceUpdateStatus: (source) => ({
        supported: false,
        updateAvailable: false,
        latestVersion: null,
        checkedAt: null,
        message: source.id
      }),
      checkLatestRelease: vi.fn(async () => ({
        latestVersion: null,
        checkedAt: null,
        error: null
      })),
      updateSource: vi.fn(async () => [])
    }
  });
}

/** Creates the complete settings snapshot required by the handler. */
function createSettings(): OpenCodexSettings {
  return {
    codexCommand: "codex",
    codexReleaseCheck: {
      latestVersion: null,
      checkedAt: null,
      error: null
    },
    defaultSourceId: null,
    defaultUsageLimitId: null,
    defaultModel: null,
    defaultReasoningEffort: null,
    commitMessageModel: null,
    commitMessageReasoningEffort: null,
    commitMessageLanguage: "en",
    showActivityPanel: true,
    experimentalApi: false,
    allowTurnSteering: true,
    language: "en",
    colorScheme: "system",
    enterKeyBehavior: "smart",
    versioningVocabulary: "technical",
    desktopNotifications: {
      turnCompleted: false,
      approvalRequested: false
    },
    discordRichPresenceEnabled: false,
    onboardingCompleted: true,
    allowOutdatedCodex: false,
    developerMode: false,
    performanceMonitoringEnabled: false,
    advancedPerformanceMonitoringEnabled: false
  };
}
