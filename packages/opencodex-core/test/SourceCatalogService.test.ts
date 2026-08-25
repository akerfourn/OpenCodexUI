/**
 * Covers source catalog behavior through cache, settings, detection, and lifecycle ports.
 */
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexSettings,
  OpenCodexSource,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import {
  SourceCatalogService,
  type SourceCatalogServiceOptions
} from "../src/backend/sources/SourceCatalogService";

describe("SourceCatalogService", () => {
  it("should initialize and persist a generated default source when settings are unset", async () => {
    const fixture = createFixture({ defaultSourceId: null });

    await fixture.service.ensureSourcesInitialized();

    expect(fixture.repository.ensureDefaultSource).toHaveBeenCalledOnce();
    expect(fixture.settings.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultSourceId: fixture.source.id })
    );
    expect(fixture.host.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultSourceId: fixture.source.id })
    );
  });

  it("should initialize legacy default settings but early-return for an already configured source", async () => {
    const legacyFixture = createFixture({ defaultSourceId: "default" });
    await legacyFixture.service.ensureSourcesInitialized();

    expect(legacyFixture.settings.setSettings).toHaveBeenCalledOnce();
    expect(legacyFixture.host.saveSettings).toHaveBeenCalledOnce();

    const configuredFixture = createFixture({ defaultSourceId: "source-configured" });
    await configuredFixture.service.ensureSourcesInitialized();

    expect(configuredFixture.repository.ensureDefaultSource).toHaveBeenCalledOnce();
    expect(configuredFixture.settings.setSettings).not.toHaveBeenCalled();
    expect(configuredFixture.host.saveSettings).not.toHaveBeenCalled();
  });

  it("should return without touching settings when the repository is absent", async () => {
    const fixture = createFixture({ cacheRepository: null, defaultSourceId: null });

    await expect(fixture.service.ensureSourcesInitialized()).resolves.toBeUndefined();

    expect(fixture.settings.setSettings).not.toHaveBeenCalled();
    expect(fixture.host.saveSettings).not.toHaveBeenCalled();
  });

  it("should resolve an explicit source and the configured default source", async () => {
    const sources = [createSource("source-first"), createSource("source-default")];
    const fixture = createFixture({ sources, defaultSourceId: "source-default" });

    await expect(fixture.service.resolveSource("source-first")).resolves.toBe(sources[0]);
    await expect(fixture.service.resolveSource(null)).resolves.toBe(sources[1]);
  });

  it("should preserve the historical first-source fallback for an unknown source", async () => {
    const firstSource = createSource("source-first");
    const fixture = createFixture({
      sources: [firstSource, createSource("source-second")],
      defaultSourceId: "source-default"
    });

    await expect(fixture.service.resolveSource("missing-source")).resolves.toBe(firstSource);
  });

  it("should provide the synthetic default source and empty cached list without storage", async () => {
    const fixture = createFixture({ cacheRepository: null, defaultSourceId: null });

    await expect(fixture.service.resolveSource("missing-source")).resolves.toMatchObject({
      id: "default",
      kind: "local"
    });
    await expect(fixture.service.listCachedSources()).resolves.toEqual([]);
    await expect(fixture.service.listOpenCodexSources()).resolves.toHaveLength(1);
  });

  it("should build source DTOs with project count, detection, candidates, and update status", async () => {
    const source = createSource("source-1");
    const status = createStatus("ready", "0.147.0", "codex-cli 0.147.0");
    const candidates = [{
      command: "codex",
      linkTarget: null,
      codex: status
    }];
    const updateStatus = createUpdateStatus(true);
    const fixture = createFixture({
      sources: [source],
      projectCount: 3,
      detectionStatus: status,
      candidates,
      updateStatus
    });

    const listedSources = await fixture.service.listOpenCodexSources();

    expect(listedSources).toEqual([
      expect.objectContaining({
        id: source.id,
        associatedProjectCount: 3,
        codex: status,
        commandCandidates: candidates,
        codexUpdate: updateStatus
      })
    ]);
    expect(fixture.repository.getSourceProjectCount).toHaveBeenCalledWith(source.id);
    expect(fixture.detection.readAndStoreCodexVersionStatus).toHaveBeenCalledWith(
      source,
      "codex"
    );
    expect(fixture.detection.readCommandCandidates).toHaveBeenCalledOnce();
    expect(fixture.updates.getSourceUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: source.id }),
      "codex"
    );
  });

  it("should build a synthetic DTO with zero projects when storage is absent", async () => {
    const status = createStatus("unavailable", null, "Codex unavailable");
    const fixture = createFixture({
      cacheRepository: null,
      detectionStatus: status,
      candidates: []
    });

    const listedSources = await fixture.service.listOpenCodexSources();

    expect(listedSources[0]).toMatchObject({
      id: "default",
      associatedProjectCount: 0,
      codex: status,
      commandCandidates: []
    });
    expect(fixture.detection.readAndStoreCodexVersionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: "default" }),
      "codex"
    );
    expect(fixture.repository.getSourceProjectCount).not.toHaveBeenCalled();
  });

  it("should create a source and return its detected protocol DTO", async () => {
    const createdSource = createSource("source-created");
    const fixture = createFixture({ createdSource, projectCount: 9 });

    const source = await fixture.service.createSource(
      "Created",
      "custom",
      { command: "codex-custom" }
    );

    expect(fixture.repository.createSource).toHaveBeenCalledWith("Created", {
      kind: "custom",
      settings: { command: "codex-custom" }
    });
    expect(source.source).toMatchObject({
      id: createdSource.id,
      associatedProjectCount: 0,
      codex: fixture.detectionStatus,
      commandCandidates: fixture.candidates,
      codexUpdate: fixture.updateStatus
    });
    expect(source.defaultSourceId).toBe("source-1");
    expect(fixture.repository.getSourceProjectCount).not.toHaveBeenCalled();
  });

  it("should update metadata without clearing associations or restarting for a non-launch patch", async () => {
    const source = createSource("source-1");
    const updatedSource = { ...source, name: "Renamed" };
    const fixture = createFixture({
      sources: [source],
      updatedSource,
      projectCount: 4
    });

    const result = await fixture.service.updateSource(source.id, { name: "Renamed" });

    expect(result.source).toMatchObject({
      id: source.id,
      name: "Renamed",
      associatedProjectCount: 4
    });
    expect(result.defaultSourceId).toBe("source-1");
    expect(fixture.repository.updateSource).toHaveBeenCalledWith(source.id, { name: "Renamed" });
    expect(fixture.repository.clearSourceAssociations).not.toHaveBeenCalled();
    expect(fixture.clients.restartClient).not.toHaveBeenCalled();
  });

  it("should clear associations and restart after a launch command change", async () => {
    const source = createSource("source-1");
    const updatedSource = createSource("source-1", "custom", {
      settings: {
        ...source.settings,
        command: "codex-new"
      }
    });
    const operations: string[] = [];
    const fixture = createFixture({
      sources: [source],
      updatedSource,
      onClearAssociations: async () => operations.push("clear"),
      onRestart: async () => operations.push("restart")
    });

    await fixture.service.updateSource(source.id, {
      settings: { command: "codex-new" }
    });

    expect(operations).toEqual(["clear", "restart"]);
    expect(fixture.repository.clearSourceAssociations).toHaveBeenCalledWith(source.id);
    expect(fixture.clients.restartClient).toHaveBeenCalledWith(source.id);
  });

  it("should restart when the source kind changes even if command fields are absent", async () => {
    const source = createSource("source-1", "local");
    const updatedSource = createSource("source-1", "custom");
    const fixture = createFixture({ sources: [source], updatedSource });

    await fixture.service.updateSource(source.id, {
      settings: { command: "codex" }
    });

    expect(fixture.repository.clearSourceAssociations).toHaveBeenCalledWith(source.id);
    expect(fixture.clients.restartClient).toHaveBeenCalledWith(source.id);
  });

  it("should clear associations before deleting a non-default source", async () => {
    const operations: string[] = [];
    const fixture = createFixture({
      defaultSourceId: "source-default",
      onClearAssociations: async () => operations.push("clear"),
      onDeleteSource: async () => operations.push("delete")
    });

    await expect(fixture.service.deleteSource("source-1")).resolves.toEqual({
      defaultSourceId: "source-default"
    });

    expect(operations).toEqual(["clear", "delete"]);
  });

  it("should refuse deleting the configured default source before storage operations", async () => {
    const fixture = createFixture({ defaultSourceId: "source-1" });

    await expect(fixture.service.deleteSource("source-1")).rejects.toThrow(
      "Default source cannot be deleted."
    );
    expect(fixture.repository.clearSourceAssociations).not.toHaveBeenCalled();
    expect(fixture.repository.deleteSource).not.toHaveBeenCalled();
  });

  it("should preserve storage errors from source mutations", async () => {
    const createError = new Error("create failed");
    const fixture = createFixture({
      createSourceError: createError
    });

    await expect(fixture.service.createSource("Created", "custom", {})).rejects.toBe(createError);

    const updateError = new Error("update failed");
    fixture.repository.updateSource.mockRejectedValueOnce(updateError);
    await expect(fixture.service.updateSource("source-1", { name: "Updated" }))
      .rejects.toBe(updateError);

    const deleteError = new Error("clear associations failed");
    fixture.repository.clearSourceAssociations.mockRejectedValueOnce(deleteError);
    await expect(fixture.service.deleteSource("source-other")).rejects.toBe(deleteError);
  });

  it.each([
    ["createSource", "Source storage is unavailable."],
    ["updateSource", "Source storage is unavailable."],
    ["deleteSource", "Source storage is unavailable."]
  ] as const)("should reject %s when storage is absent", async (operation, message) => {
    const fixture = createFixture({ cacheRepository: null, defaultSourceId: "source-other" });

    const promise = operation === "createSource"
      ? fixture.service.createSource("Created", "custom", {})
      : operation === "updateSource"
        ? fixture.service.updateSource("source-1", { name: "Updated" })
        : fixture.service.deleteSource("source-1");

    await expect(promise).rejects.toThrow(message);
  });
});

type FixtureOptions = {
  cacheRepository?: SourceCatalogServiceOptions["cacheRepository"];
  sources?: CachedSource[];
  defaultSourceId?: string | null;
  projectCount?: number;
  detectionStatus?: OpenCodexToolVersionStatus;
  candidates?: OpenCodexSource["commandCandidates"];
  updateStatus?: OpenCodexSource["codexUpdate"];
  createdSource?: CachedSource;
  updatedSource?: CachedSource;
  createSourceError?: Error;
  onClearAssociations?: () => Promise<void>;
  onDeleteSource?: () => Promise<void>;
  onRestart?: () => Promise<void>;
};

/** Builds deterministic catalog ports while keeping each test focused on behavior. */
function createFixture(options: FixtureOptions = {}) {
  const source = options.sources?.[0] ?? createSource("source-1");
  const sources = options.sources ?? [source];
  const createdSource = options.createdSource ?? createSource("source-created");
  const updatedSource = options.updatedSource ?? source;
  const detectionStatus = options.detectionStatus ?? createStatus(
    "ready",
    "0.147.0",
    "codex-cli 0.147.0"
  );
  const candidates = options.candidates ?? [];
  const updateStatus = options.updateStatus ?? createUpdateStatus(false);
  const settingsValue = createSettings(
    options.defaultSourceId === undefined ? "source-1" : options.defaultSourceId
  );
  const settings = {
    getSettings: vi.fn(() => settingsValue),
    setSettings: vi.fn((nextSettings: OpenCodexSettings) => {
      Object.assign(settingsValue, nextSettings);
    })
  };
  const saveSettings = vi.fn(async () => undefined);
  const host = { saveSettings };
  const detection = {
    readAndStoreCodexVersionStatus: vi.fn(async () => detectionStatus),
    readCommandCandidates: vi.fn(async () => candidates)
  };
  const updates = {
    getSourceUpdateStatus: vi.fn(() => updateStatus)
  };
  const clients = {
    restartClient: vi.fn(options.onRestart ?? (async () => undefined))
  };
  const repository = {
    ensureDefaultSource: vi.fn(async () => source),
    listSources: vi.fn(async () => sources),
    createSource: vi.fn(async () => {
      if (options.createSourceError !== undefined) {
        throw options.createSourceError;
      }

      return createdSource;
    }),
    getSourceProjectCount: vi.fn(async () => options.projectCount ?? 0),
    updateSource: vi.fn(async () => updatedSource),
    clearSourceAssociations: vi.fn(
      options.onClearAssociations ?? (async () => undefined)
    ),
    deleteSource: vi.fn(options.onDeleteSource ?? (async () => undefined))
  } as unknown as NonNullable<SourceCatalogServiceOptions["cacheRepository"]>;
  const service = new SourceCatalogService({
    cacheRepository: options.cacheRepository === undefined ? repository : options.cacheRepository,
    settings,
    clients,
    detection,
    updates,
    host
  });

  return {
    service,
    source,
    settings,
    host,
    detection,
    updates,
    clients,
    repository,
    detectionStatus,
    candidates,
    updateStatus
  };
}

/** Creates a source with launch settings suitable for comparison tests. */
function createSource(
  id: string,
  kind: "local" | "custom" = "custom",
  overrides: Partial<CachedSource> = {}
): CachedSource {
  const settings = kind === "local"
    ? {
        commandMode: "auto" as const,
        command: null,
        color: "blue" as const,
        openFolderCommand: null,
        openFileCommand: null
      }
    : {
        commandMode: "custom" as const,
        command: "codex",
        hasLocalAccess: false,
        color: "blue" as const,
        openFolderCommand: null,
        openFileCommand: null
      };

  return {
    id,
    name: id,
    kind,
    settings,
    lastDetectedCodexVersion: null,
    lastDetectedCodexAt: null,
    lastDetectionError: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  } as CachedSource;
}

/** Creates the complete settings snapshot required by source command mapping. */
function createSettings(defaultSourceId: string | null): OpenCodexSettings {
  return {
    codexCommand: "codex",
    codexReleaseCheck: {
      latestVersion: "1.12.0",
      checkedAt: "2026-08-12T00:00:00.000Z",
      error: null
    },
    defaultSourceId,
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

/** Creates a deterministic Codex status for DTO and persistence assertions. */
function createStatus(
  status: OpenCodexToolVersionStatus["status"],
  version: string | null,
  message: string | null
): OpenCodexToolVersionStatus {
  return {
    status,
    version,
    message,
    checkedAt: "2026-08-12T00:00:00.000Z"
  };
}

/** Creates the update availability value returned by the update port. */
function createUpdateStatus(updateAvailable: boolean): OpenCodexSource["codexUpdate"] {
  return {
    supported: true,
    updateAvailable,
    latestVersion: "1.12.0",
    checkedAt: "2026-08-12T00:00:00.000Z",
    message: null
  };
}
