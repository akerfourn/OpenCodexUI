/**
 * Covers cacheless runtime construction and lifecycle behavior.
 */
import type {
  OpenCodexEvent,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenCodexBackendRuntime } from "../src/OpenCodexBackendRuntime";
import type { OpenCodexBackendOptions } from "../src/types";
import { CodexUpdateService } from "../src/backend/sources/CodexUpdateService";
import { SourceDetectionService } from "../src/backend/sources/SourceDetectionService";
import { ModelCatalogService } from "../src/backend/support/ModelCatalogService";
import { UsageRuntimeService } from "../src/backend/usage/UsageRuntimeService";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenCodexBackendRuntime", () => {
  it.each(["ready", "unavailable"] as const)(
    "should publish cached startup state before slow release and %s source checks finish", async (status) => {
      const releaseStarted = deferred<void>();
      const releaseFinished = deferred<void>();
      const detectionStarted = deferred<void>();
      const detectionFinished = deferred<void>();
      const releaseCheck = { latestVersion: "0.200.0", checkedAt: "2026-11-06T00:00:00.000Z", error: null };
      vi.stubGlobal("fetch", vi.fn(async () => {
        releaseStarted.resolve();
        await releaseFinished.promise;
        return new Response(JSON.stringify({ tag_name: "rust-v0.200.0" }));
      }));
      vi.spyOn(SourceDetectionService.prototype, "readCommandCandidates").mockResolvedValue([]);
      vi.spyOn(SourceDetectionService.prototype, "readAndStoreCodexVersionStatus").mockImplementation(async () => {
        detectionStarted.resolve();
        await detectionFinished.promise;
        return { status, version: "0.200.0", checkedAt: releaseCheck.checkedAt, message: null };
      });
      vi.spyOn(CodexUpdateService.prototype, "getSourceUpdateStatus").mockResolvedValue({
        supported: false, updateAvailable: false, latestVersion: releaseCheck.latestVersion,
        checkedAt: releaseCheck.checkedAt, message: null
      });
      const models = vi.spyOn(ModelCatalogService.prototype, "listModels").mockResolvedValue([]);
      vi.spyOn(UsageRuntimeService.prototype, "readUsageLimits").mockResolvedValue(null);
      const events: OpenCodexEvent[] = [];
      const options = createOptions(event => events.push(event));
      options.settings.codexReleaseCheck.checkedAt = null;
      const runtime = new OpenCodexBackendRuntime(options);
      const bootstrap = runtime.bootstrap();

      try {
        await releaseStarted.promise;
        expect(events.map(event => event.type)).toEqual([
          "app.bootstrap", "debug.state", "projects.updated", "projectGroups.updated"
        ]);
        expect(events[0]).toMatchObject({
          type: "app.bootstrap", sources: [{ id: "default", kind: "local" }]
        });

        releaseFinished.resolve();
        await detectionStarted.promise;
        expect(events).toContainEqual({ type: "projects.updated", projects: [] });
        expect(events.some(event => event.type === "sources.updated")).toBe(false);
        expect(models).not.toHaveBeenCalled();

        detectionFinished.resolve();
        await expect(bootstrap).resolves.toEqual({ ok: true });
        expect(events).toContainEqual(expect.objectContaining({
          type: "sources.updated",
          codexReleaseCheck: expect.objectContaining({ latestVersion: "0.200.0", error: null }),
          sources: [expect.objectContaining({ id: "default", codex: expect.objectContaining({ status }) })]
        }));
      } finally {
        releaseFinished.resolve();
        detectionFinished.resolve();
        await bootstrap;
        await runtime.dispose();
      }
    }
  );

  it("should expose its settings and dispose without a cache repository", async () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const options = createOptions((event) => emittedEvents.push(event));
    const runtime = new OpenCodexBackendRuntime(options);

    expect(runtime.settings.get()).toBe(options.settings);
    expect(runtime.isPrerelease).toBe(true);

    await expect(runtime.dispose()).resolves.toBeUndefined();
    await expect(runtime.dispose()).resolves.toBeUndefined();
    expect(emittedEvents).toEqual([]);
  });

  it("should expose stable public facades while keeping settings behavior compatible", async () => {
    const saveSettings = vi.fn();
    const runtime = new OpenCodexBackendRuntime({
      ...createOptions(() => undefined),
      saveSettings
    });

    expect(runtime.settings).toBe(runtime.settings);
    expect(runtime.projects).toBe(runtime.projects);
    expect(runtime.threads).toBe(runtime.threads);
    expect(runtime.automation.commands).toBe(runtime.automation.commands);
    expect(runtime.docker).toBe(runtime.docker);
    expect(runtime.git.commitMessage).toBe(runtime.git.commitMessage);

    const normalized = await runtime.settings.update({
      developerMode: true,
      performanceMonitoringEnabled: false,
      advancedPerformanceMonitoringEnabled: true
    });

    expect(normalized.advancedPerformanceMonitoringEnabled).toBe(false);
    expect(runtime.settings.get()).toBe(normalized);
    expect(saveSettings).toHaveBeenCalledWith(normalized);

    await expect(runtime.projects.list()).resolves.toEqual([]);
    await runtime.dispose();
  });

  it("should keep cacheless project and group reads deterministic", async () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const runtime = new OpenCodexBackendRuntime(createOptions((event) => {
      emittedEvents.push(event);
    }));

    await expect(runtime.projects.list()).resolves.toEqual([]);
    await expect(runtime.groups.list()).resolves.toEqual({
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

/** Exposes deterministic completion signals without depending on elapsed time. */
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

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
