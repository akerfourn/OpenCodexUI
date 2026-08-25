import { autorun, isObservableProp, runInAction } from "mobx";
import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexModel,
  OpenCodexRequest,
  OpenCodexSettings,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";

import {
  AppLifecycleStore,
  type AppLifecycleRequestPort
} from "../src/stores/app/AppLifecycleStore";
import { AppStore } from "../src/stores/app/AppStore";
import type { RootStore } from "../src/stores/RootStore";

describe("AppLifecycleStore", () => {
  it("should request bootstrap before clearing its state on the completion event", async () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const store = new AppLifecycleStore({ request });
    await store.bootstrap();

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({ type: "app.bootstrap" });
    expect(store.isBootstrapping).toBe(true);

    store.handleEvent({ type: "projects.updated", projects: [] });

    expect(store.isBootstrapping).toBe(false);
  });

  it("should clear bootstrap state and swallow a failed bootstrap request", async () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => {
      throw new Error("backend unavailable");
    });
    const store = new AppLifecycleStore({ request });

    await expect(store.bootstrap()).resolves.toBeUndefined();

    expect(store.isBootstrapping).toBe(false);
  });

  it("should apply bootstrap settings and host metadata through the public event reducer", () => {
    const store = new AppLifecycleStore(createRequestPort());
    const settings = createSettings({
      defaultModel: "gpt-5.5",
      defaultReasoningEffort: "high",
      language: "en",
      onboardingCompleted: true
    });

    store.handleEvent({
      type: "app.bootstrap",
      settings,
      sources: [],
      projectPath: "/workspace/project",
      appVersion: "1.2.3",
      isPrerelease: true
    });

    expect(store.settingsStore.settings).toMatchObject(settings);
    expect(store.settingsStore.settings).not.toBe(settings);
    expect(store.launchProjectPath).toBe("/workspace/project");
    expect(store.selectedModel).toBe("gpt-5.5");
    expect(store.reasoningEffort).toBe("high");
    expect(store.appVersion).toBe("1.2.3");
    expect(store.isPrerelease).toBe(true);
  });

  it("should fall back to medium when bootstrap omits the default reasoning effort", () => {
    const store = new AppLifecycleStore(createRequestPort());

    store.handleEvent({
      type: "app.bootstrap",
      settings: createSettings({ defaultReasoningEffort: null }),
      sources: [],
      projectPath: null,
      appVersion: null,
      isPrerelease: false
    });

    expect(store.reasoningEffort).toBe("medium");
  });

  it("should update connection and bootstrap lifecycle events", () => {
    const store = new AppLifecycleStore(createRequestPort());
    store.handleEvent({ type: "connection.status", status: "ready" });
    expect(store.connectionStatus).toBe("ready");

    store.isBootstrapping = true;
    store.handleEvent({ type: "projects.updated", projects: [] });
    expect(store.isBootstrapping).toBe(false);
  });

  it("should store a successful Git diagnostic and always finish loading", async () => {
    const pending = createDeferred<OpenCodexToolVersionStatus>();
    const request = vi.fn(async (_request: OpenCodexRequest) => pending.promise);
    const store = new AppLifecycleStore({ request });
    const status = createGitStatus();

    const loading = store.loadGitVersion();

    expect(store.isLoadingGitVersion).toBe(true);
    expect(request).toHaveBeenCalledWith({ type: "git.version" });

    pending.resolve(status);
    await loading;

    expect(store.gitVersionStatus).toEqual(status);
    expect(store.isLoadingGitVersion).toBe(false);
  });

  it("should reject failed Git diagnostics while clearing the loading flag", async () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<OpenCodexToolVersionStatus> => {
      throw new Error("git is unavailable");
    });
    const store = new AppLifecycleStore({ request });

    await expect(store.loadGitVersion()).rejects.toThrow("git is unavailable");

    expect(store.gitVersionStatus).toBeNull();
    expect(store.isLoadingGitVersion).toBe(false);
  });

  it("should ignore a concurrent Git diagnostic while the first one is pending", async () => {
    const pending = createDeferred<OpenCodexToolVersionStatus>();
    const request = vi.fn(async (_request: OpenCodexRequest) => pending.promise);
    const store = new AppLifecycleStore({ request });
    const status = createGitStatus();

    const firstLoad = store.loadGitVersion();
    await store.loadGitVersion();

    expect(request).toHaveBeenCalledOnce();

    pending.resolve(status);
    await firstLoad;
    expect(store.gitVersionStatus).toEqual(status);
  });

  it("should expose observable lifecycle fields", () => {
    const store = new AppLifecycleStore(createRequestPort());

    expect(isObservableProp(store, "connectionStatus")).toBe(true);
    expect(isObservableProp(store, "isBootstrapping")).toBe(true);
    expect(isObservableProp(store, "gitVersionStatus")).toBe(true);

  });
});

describe("AppStore lifecycle compatibility", () => {
  it("should expose settings through the dedicated store without persisting replacements", () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const appStore = new AppStore({ request } as unknown as RootStore);

    appStore.settingsStore.replaceSettings(createSettings({ language: "en" }));

    expect(appStore.settingsStore.settings.language).toBe("en");
    expect(request).not.toHaveBeenCalled();
    expect("settings" in appStore).toBe(false);
    expect("setLanguage" in appStore).toBe(false);
    expect("setDeveloperMode" in appStore).toBe(false);
  });

  it("should hide onboarding while bootstrap is pending", async () => {
    const pending = createDeferred<unknown>();
    const request = vi.fn(async (_request: OpenCodexRequest) => pending.promise);
    const appStore = new AppStore({ request } as unknown as RootStore);

    const bootstrap = appStore.bootstrap();

    expect(appStore.isBootstrapping).toBe(true);
    expect(appStore.shouldShowOnboarding).toBe(false);

    pending.resolve(undefined);
    await bootstrap;
  });

  it("should show onboarding when it has not been completed", () => {
    const appStore = new AppStore(createRequestPort() as unknown as RootStore);

    appStore.settingsStore.replaceSettings(createSettings({ onboardingCompleted: false }));

    expect(appStore.shouldShowOnboarding).toBe(true);
  });

  it("should hide onboarding after it has been completed", () => {
    const appStore = new AppStore(createRequestPort() as unknown as RootStore);

    appStore.settingsStore.replaceSettings(createSettings({ onboardingCompleted: true }));

    expect(appStore.shouldShowOnboarding).toBe(false);
  });

  it("should show forced onboarding until it is dismissed", () => {
    const appStore = new AppStore(createRequestPort() as unknown as RootStore);
    appStore.settingsStore.replaceSettings(createSettings({ onboardingCompleted: true }));

    appStore.forceOnboarding = true;
    expect(appStore.shouldShowOnboarding).toBe(true);

    appStore.forcedOnboardingDismissed = true;
    expect(appStore.shouldShowOnboarding).toBe(false);
  });

  it("should update forced onboarding through its public setter", () => {
    const appStore = new AppStore(createRequestPort() as unknown as RootStore);
    appStore.settingsStore.replaceSettings(createSettings({ onboardingCompleted: true }));

    appStore.setForceOnboarding(true);
    expect(appStore.forceOnboarding).toBe(true);
    expect(appStore.shouldShowOnboarding).toBe(true);

    appStore.setForceOnboarding(false);
    expect(appStore.forceOnboarding).toBe(false);
    expect(appStore.shouldShowOnboarding).toBe(false);
  });

  it("should keep onboarding flags publicly assignable", () => {
    const appStore = new AppStore(createRequestPort() as unknown as RootStore);

    appStore.forceOnboarding = true;
    appStore.forcedOnboardingDismissed = true;

    expect(appStore.forceOnboarding).toBe(true);
    expect(appStore.forcedOnboardingDismissed).toBe(true);
  });

  it("should complete onboarding locally and send exactly one settings update", () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const appStore = new AppStore({ request } as unknown as RootStore);
    appStore.settingsStore.replaceSettings(createSettings({ onboardingCompleted: false }));
    appStore.setForceOnboarding(true);

    expect(appStore.completeOnboarding()).toBeUndefined();

    expect(appStore.settingsStore.settings.onboardingCompleted).toBe(true);
    expect(appStore.forcedOnboardingDismissed).toBe(true);
    expect(appStore.shouldShowOnboarding).toBe(false);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({
      type: "settings.update",
      patch: { onboardingCompleted: true }
    });
  });

  it("should keep completion requests fire-and-forget when the request rejects", async () => {
    const requestError = new Error("settings unavailable");
    const rejectedRequest = Promise.reject(requestError);
    rejectedRequest.catch(() => undefined);
    const request = vi.fn((_request: OpenCodexRequest): Promise<unknown> => rejectedRequest);
    const appStore = new AppStore({ request } as unknown as RootStore);

    expect(() => appStore.completeOnboarding()).not.toThrow();
    await rejectedRequest.catch(() => undefined);

    expect(request).toHaveBeenCalledWith({
      type: "settings.update",
      patch: { onboardingCompleted: true }
    });
    expect(appStore.errorMessage).toBeNull();
    expect(appStore.warningMessage).toBeNull();
  });

  it("should keep error and warning notifications on AppStore", () => {
    const appStore = new AppStore(createRequestPort() as unknown as RootStore);

    appStore.applyError({ type: "error", message: "backend unavailable" });
    appStore.showWarningMessage("Git is unavailable");

    expect(appStore.errorMessage).toBe("backend unavailable");
    expect(appStore.warningMessage).toBe("Git is unavailable");
    expect("errorMessage" in new AppLifecycleStore(createRequestPort())).toBe(false);
    expect("warningMessage" in new AppLifecycleStore(createRequestPort())).toBe(false);
  });

  it("should preserve public lifecycle properties and delegate lifecycle events", () => {
    const request = vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined);
    const appStore = new AppStore({ request } as unknown as RootStore);
    const settings = createSettings({
      defaultModel: "gpt-5.5",
      defaultReasoningEffort: "high",
      language: "fr"
    });
    const model = createModel("gpt-5.5");

    appStore.handleEvent({
      type: "app.bootstrap",
      settings,
      sources: [],
      projectPath: "/workspace/project",
      appVersion: "1.2.3",
      isPrerelease: false
    });
    appStore.handleEvent({ type: "connection.status", status: "ready" });
    appStore.handleEvent({ type: "models.updated", models: [model] });

    expect(appStore.connectionStatus).toBe("ready");
    expect(appStore.isBootstrapping).toBe(false);
    expect(appStore.appVersion).toBe("1.2.3");
    expect(appStore.isPrerelease).toBe(false);
    expect(appStore.launchProjectPath).toBe("/workspace/project");
    expect(appStore.selectedModel).toBe("gpt-5.5");
    expect(appStore.reasoningEffort).toBe("high");
    expect(appStore.models).toEqual([model]);

    appStore.connectionStatus = "stopped";
    appStore.isBootstrapping = true;
    appStore.appVersion = "1.2.4";
    appStore.isPrerelease = true;
    appStore.settingsStore.replaceSettings(createSettings({ onboardingCompleted: true }));
    appStore.launchProjectPath = "/workspace/other-project";
    appStore.selectedModel = "manual-model";
    appStore.reasoningEffort = "low";
    appStore.gitVersionStatus = createGitStatus();
    appStore.isLoadingGitVersion = true;

    expect(appStore.connectionStatus).toBe("stopped");
    expect(appStore.isBootstrapping).toBe(true);
    expect(appStore.appVersion).toBe("1.2.4");
    expect(appStore.isPrerelease).toBe(true);
    expect(appStore.settingsStore.settings.onboardingCompleted).toBe(true);
    expect(appStore.launchProjectPath).toBe("/workspace/other-project");
    expect(appStore.selectedModel).toBe("manual-model");
    expect(appStore.reasoningEffort).toBe("low");
    expect(appStore.gitVersionStatus).toEqual(createGitStatus());
    expect(appStore.isLoadingGitVersion).toBe(true);
  });

  it("should keep lifecycle properties observable after extraction", () => {
    const appStore = new AppStore(createRequestPort() as unknown as RootStore);

    expect(isObservableProp(appStore.settingsStore, "settings")).toBe(true);
    expect(isObservableProp(appStore, "launchProjectPath")).toBe(true);
    expect(isObservableProp(appStore, "selectedModel")).toBe(true);
    expect(isObservableProp(appStore, "reasoningEffort")).toBe(true);
    expect(isObservableProp(appStore, "connectionStatus")).toBe(true);
    expect(isObservableProp(appStore, "isBootstrapping")).toBe(true);
    expect(isObservableProp(appStore, "appVersion")).toBe(true);
    expect(isObservableProp(appStore, "gitVersionStatus")).toBe(true);
  });

  it("should invalidate onboarding visibility when inherited state changes", () => {
    const appStore = new AppStore(createRequestPort() as unknown as RootStore);
    const visibility: boolean[] = [];
    const dispose = autorun(() => {
      visibility.push(appStore.shouldShowOnboarding);
    });

    runInAction(() => {
      appStore.isBootstrapping = true;
    });
    runInAction(() => {
      appStore.isBootstrapping = false;
    });
    runInAction(() => {
      appStore.settingsStore.replaceSettings(createSettings({ onboardingCompleted: true }));
    });
    runInAction(() => {
      appStore.forceOnboarding = true;
    });
    runInAction(() => {
      appStore.forcedOnboardingDismissed = true;
    });

    dispose();

    expect(visibility).toEqual([true, false, true, false, true, false]);
  });

  it("should invalidate model option reactions when observable models change", () => {
    const appStore = new AppStore(createRequestPort() as unknown as RootStore);
    const initialModel = createModel("gpt-5.5", {
      supportedReasoningEfforts: [{ reasoningEffort: "low", description: "Fast" }],
      serviceTiers: [{ id: "fast", name: "Fast", description: "Lower latency" }]
    });
    const updatedModel = createModel("gpt-5.5", {
      supportedReasoningEfforts: [{ reasoningEffort: "high", description: "Deep" }],
      serviceTiers: [{ id: "batch", name: "Batch", description: "Lower cost" }]
    });
    const snapshots: Array<{ efforts: string[]; tiers: string[] }> = [];
    const dispose = autorun(() => {
      snapshots.push({
        efforts: appStore.getReasoningEffortOptions("gpt-5.5")
          .map((option) => option.reasoningEffort),
        tiers: appStore.getServiceTierOptions("gpt-5.5")
          .map((tier) => tier.id)
      });
    });

    runInAction(() => {
      appStore.models = [initialModel];
    });
    runInAction(() => {
      appStore.models = [updatedModel];
    });

    dispose();

    expect(snapshots).toEqual([
      { efforts: ["low", "medium", "high", "xhigh"], tiers: [] },
      { efforts: ["low"], tiers: ["fast"] },
      { efforts: ["high"], tiers: ["batch"] }
    ]);
  });
});

function createRequestPort(): AppLifecycleRequestPort {
  return {
    request: vi.fn(async (_request: OpenCodexRequest): Promise<unknown> => undefined)
  };
}

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

function createModel(model: string, overrides: Partial<OpenCodexModel> = {}): OpenCodexModel {
  return {
    id: `${model}-id`,
    model,
    displayName: model,
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    serviceTiers: [],
    ...overrides
  };
}

function createGitStatus(): OpenCodexToolVersionStatus {
  return {
    status: "ready",
    version: "2.1.0",
    message: null,
    checkedAt: "2026-08-12T12:00:00.000Z"
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise
  };
}
