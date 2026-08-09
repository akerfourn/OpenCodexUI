/**
 * Covers cacheless runtime construction and lifecycle behavior.
 */
import type {
  OpenCodexEvent,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it } from "vitest";

import { OpenCodexBackendRuntime } from "../src/OpenCodexBackendRuntime";
import type { OpenCodexBackendOptions } from "../src/types";

describe("OpenCodexBackendRuntime", () => {
  it("should expose its settings and dispose without a cache repository", async () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const options = createOptions((event) => emittedEvents.push(event));
    const runtime = new OpenCodexBackendRuntime(options);

    expect(runtime.getSettings()).toBe(options.settings);
    expect(runtime.isPrerelease).toBe(true);

    await expect(runtime.dispose()).resolves.toBeUndefined();
    await expect(runtime.dispose()).resolves.toBeUndefined();
    expect(emittedEvents).toEqual([]);
  });

  it("should keep cacheless project and group reads deterministic", async () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const runtime = new OpenCodexBackendRuntime(createOptions((event) => {
      emittedEvents.push(event);
    }));

    await expect(runtime.listProjects()).resolves.toEqual([]);
    await expect(runtime.listProjectGroups()).resolves.toEqual({
      groups: [],
      items: []
    });

    expect(emittedEvents).toEqual([
      {
        type: "projects.updated",
        projects: []
      },
      {
        type: "projectGroups.updated",
        snapshot: {
          groups: [],
          items: []
        }
      }
    ]);

    await runtime.dispose();
  });
});

/** Creates deterministic host options without persistence or process adapters. */
function createOptions(emit: (event: OpenCodexEvent) => void): OpenCodexBackendOptions {
  return {
    settings: createSettings(),
    projectPath: null,
    appVersion: "1.12.0-alpha.2",
    emit
  };
}

/** Creates the complete settings snapshot required by the runtime constructor. */
function createSettings(): OpenCodexSettings {
  return {
    codexCommand: "codex",
    codexReleaseCheck: {
      latestVersion: "1.12.0",
      checkedAt: "2099-01-01T00:00:00.000Z",
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
