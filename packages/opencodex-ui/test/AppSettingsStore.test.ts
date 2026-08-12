import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexRequest,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import {
  AppSettingsStore
} from "../src/stores/AppSettingsStore";

describe("AppSettingsStore", () => {
  it("should update settings optimistically before sending the persisted patch", () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const store = new AppSettingsStore({ request });

    store.setColorScheme("dark");

    expect(store.settings.colorScheme).toBe("dark");
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({
      type: "settings.update",
      patch: { colorScheme: "dark" }
    });
  });

  it("should apply the optimistic language before requesting persistence", () => {
    const store = new AppSettingsStore({
      request: vi.fn((_request: OpenCodexRequest): Promise<unknown> => {
        expect(store.settings.language).toBe("fr");
        return Promise.resolve();
      })
    });

    store.setLanguage("fr");

    expect(store.settings.language).toBe("fr");
  });

  it("should preserve the complete desktop notification object in each patch", () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const store = new AppSettingsStore({ request });
    store.replaceSettings(createSettings({
      desktopNotifications: {
        turnCompleted: false,
        approvalRequested: true
      }
    }));

    store.setDesktopTurnCompletedNotifications(true);

    expect(store.settings.desktopNotifications).toEqual({
      turnCompleted: true,
      approvalRequested: true
    });
    expect(request).toHaveBeenLastCalledWith({
      type: "settings.update",
      patch: {
        desktopNotifications: {
          turnCompleted: true,
          approvalRequested: true
        }
      }
    });

    store.setDesktopApprovalNotifications(false);

    expect(store.settings.desktopNotifications).toEqual({
      turnCompleted: true,
      approvalRequested: false
    });
    expect(request).toHaveBeenLastCalledWith({
      type: "settings.update",
      patch: {
        desktopNotifications: {
          turnCompleted: true,
          approvalRequested: false
        }
      }
    });
  });

  it("should disable advanced monitoring when developer mode is disabled", () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const store = new AppSettingsStore({ request });
    store.replaceSettings(createSettings({
      developerMode: true,
      performanceMonitoringEnabled: true,
      advancedPerformanceMonitoringEnabled: true
    }));

    store.setDeveloperMode(false);

    expect(store.settings.developerMode).toBe(false);
    expect(store.settings.advancedPerformanceMonitoringEnabled).toBe(false);
    expect(request).toHaveBeenCalledWith({
      type: "settings.update",
      patch: {
        developerMode: false,
        advancedPerformanceMonitoringEnabled: false
      }
    });
  });

  it("should disable advanced monitoring when base performance monitoring is disabled", () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const store = new AppSettingsStore({ request });
    store.replaceSettings(createSettings({
      developerMode: true,
      performanceMonitoringEnabled: true,
      advancedPerformanceMonitoringEnabled: true
    }));

    store.setPerformanceMonitoringEnabled(false);

    expect(store.settings.performanceMonitoringEnabled).toBe(false);
    expect(store.settings.advancedPerformanceMonitoringEnabled).toBe(false);
    expect(request).toHaveBeenCalledWith({
      type: "settings.update",
      patch: {
        performanceMonitoringEnabled: false,
        advancedPerformanceMonitoringEnabled: false
      }
    });
  });

  it("should only persist advanced monitoring when both prerequisites are enabled", () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const store = new AppSettingsStore({ request });

    store.setAdvancedPerformanceMonitoringEnabled(true);

    expect(store.settings.advancedPerformanceMonitoringEnabled).toBe(false);
    expect(request).not.toHaveBeenCalled();

    store.replaceSettings(createSettings({
      developerMode: true,
      performanceMonitoringEnabled: true
    }));
    store.setAdvancedPerformanceMonitoringEnabled(true);

    expect(store.settings.advancedPerformanceMonitoringEnabled).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({
      type: "settings.update",
      patch: { advancedPerformanceMonitoringEnabled: true }
    });
  });

  it("should update release-check metadata locally without persisting it", () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const store = new AppSettingsStore({ request });
    const releaseCheck = {
      latestVersion: "2.1.0",
      checkedAt: "2026-08-12T12:00:00.000Z",
      error: null
    };

    store.setCodexReleaseCheck(releaseCheck);

    expect(store.settings.codexReleaseCheck).toEqual(releaseCheck);
    expect(request).not.toHaveBeenCalled();
  });

  it("should replace or bootstrap settings without sending persistence requests", () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const store = new AppSettingsStore({ request });
    const replacement = createSettings({
      defaultModel: "gpt-5.5",
      language: "en",
      onboardingCompleted: true
    });

    store.replaceSettings(replacement);

    expect(store.settings).toEqual(replacement);
    expect(store.settings).not.toBe(replacement);
    expect(request).not.toHaveBeenCalled();

    const bootstrap = createSettings({
      defaultModel: "gpt-5.4",
      language: "fr"
    });
    store.applyBootstrap(bootstrap);

    expect(store.settings).toMatchObject(bootstrap);
    expect(request).not.toHaveBeenCalled();
  });

  it("should persist the commit model and resolved effort as one atomic patch", () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const store = new AppSettingsStore({ request });

    store.setCommitMessageModelAndEffort("gpt-5.5", "high");

    expect(store.settings.commitMessageModel).toBe("gpt-5.5");
    expect(store.settings.commitMessageReasoningEffort).toBe("high");
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({
      type: "settings.update",
      patch: {
        commitMessageModel: "gpt-5.5",
        commitMessageReasoningEffort: "high"
      }
    });
  });
});

/** Creates a complete settings fixture with focused overrides. */
function createSettings(overrides: Partial<OpenCodexSettings> = {}): OpenCodexSettings {
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
    defaultReasoningEffort: "medium",
    commitMessageModel: null,
    commitMessageReasoningEffort: "medium",
    commitMessageLanguage: "en",
    showActivityPanel: true,
    experimentalApi: true,
    allowTurnSteering: false,
    language: "system",
    colorScheme: "system",
    enterKeyBehavior: "newline",
    versioningVocabulary: "simple",
    desktopNotifications: {
      turnCompleted: false,
      approvalRequested: false
    },
    discordRichPresenceEnabled: true,
    onboardingCompleted: false,
    allowOutdatedCodex: false,
    developerMode: false,
    performanceMonitoringEnabled: true,
    advancedPerformanceMonitoringEnabled: false,
    ...overrides
  };
}
