/**
 * Covers source-aware project opening.
 */
import type {
  CachedProject,
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

const toolVersionMocks = vi.hoisted(() => ({
  readCodexCommandCandidateStatuses: vi.fn(),
  readCodexVersionStatus: vi.fn()
}));

vi.mock("../src/backend/sources/toolVersionDetection", () => toolVersionMocks);

import type { OpenCodexBackendOptions as CoreBackendOptions } from "../src/types";
import { ProjectSourceService } from "../src/backend/projects/ProjectSourceService";

describe("ProjectSourceService", () => {
  it.each(["wsl", "ssh"] as const)(
    "should preserve a %s project path without validating it on the Windows host",
    async (sourceKind) => {
      const projectPath = "/home/adrien/perso/OpenCodexUI";
      const source = createRemoteSource(sourceKind);
      const project = createProject(projectPath, source.id);
      const client = createSourceClient();
      const ensureProjectDirectory = vi.fn(async () => {
        throw new Error("The remote path must not be resolved on the host.");
      });
      const repository = createRepository(source, project);

      const service = new ProjectSourceService({
        backendOptions: createBackendOptions(ensureProjectDirectory),
        cacheRepository: repository,
        settings: createSettingsPort(source.id),
        events: { emit: vi.fn() },
        clients: createClientPort(client),
        updates: {
          getSourceUpdateStatus: () => ({
            supported: false,
            updateAvailable: false,
            latestVersion: null,
            checkedAt: null,
            message: null
          })
        }
      });

      const openedProject = await service.openProject(projectPath, source.id, false);

      expect(openedProject.path).toBe(projectPath);
      expect(repository.upsertProject).toHaveBeenCalledWith(projectPath, source.id);
      expect(ensureProjectDirectory).not.toHaveBeenCalled();
      expect(client.getMetadata).toHaveBeenCalledWith(projectPath);
    }
  );

  it("should create a missing remote project directory through the source client", async () => {
    const projectPath = "/home/adrien/perso/NewProject";
    const source = createRemoteSource("wsl");
    const project = createProject(projectPath, source.id);
    const client = createSourceClient();
    vi.mocked(client.getMetadata).mockRejectedValueOnce(new Error("ENOENT: no such file"));
    const repository = createRepository(source, project);

    const service = new ProjectSourceService({
      backendOptions: createBackendOptions(vi.fn()),
      cacheRepository: repository,
      settings: createSettingsPort(source.id),
      events: { emit: vi.fn() },
      clients: createClientPort(client),
      updates: {
        getSourceUpdateStatus: () => ({
          supported: false,
          updateAvailable: false,
          latestVersion: null,
          checkedAt: null,
          message: null
        })
      }
    });

    await service.openProject(projectPath, source.id, true);

    expect(client.createDirectory).toHaveBeenCalledWith(projectPath);
  });
});

describe("ProjectSourceService synchronization", () => {
  it("should return an empty project list without events when the repository is absent", async () => {
    const emit = vi.fn<(event: OpenCodexEvent) => void>();
    const service = new ProjectSourceService({
      backendOptions: {
        ...createBackendOptions(vi.fn()),
        logger: vi.fn()
      },
      cacheRepository: null,
      settings: createSettingsPort("source-1"),
      events: { emit },
      clients: {
        ensureClient: vi.fn(async () => {
          throw new Error("A client must not be started without a repository.");
        }),
        restartClient: vi.fn(async () => undefined)
      },
      updates: {
        getSourceUpdateStatus: () => createUpdateStatus()
      }
    });

    await expect(service.syncSources(null)).resolves.toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });

  it("should synchronize every source sequentially and emit projects before sources", async () => {
    const sources = [createSyncSource("source-a"), createSyncSource("source-b")];
    const fixture = createSyncFixture(sources, { defaultSourceId: "source-b" });

    await expect(fixture.service.syncSources(null)).resolves.toEqual([fixture.project]);

    expect(fixture.operations.filter((operation) => (
      operation.startsWith("list:") || operation.startsWith("write:")
    ))).toEqual([
      "list:source-a",
      "write:source-a",
      "list:source-b",
      "write:source-b"
    ]);
    expect(fixture.events.map((event) => event.type)).toEqual([
      "projects.updated",
      "sources.updated"
    ]);
    expect(fixture.events[0]).toEqual({
      type: "projects.updated",
      projects: [fixture.project]
    });
    expect(fixture.events[1]).toMatchObject({
      type: "sources.updated",
      defaultSourceId: "source-b",
      sources: [
        { id: "source-a" },
        { id: "source-b" }
      ]
    });
  });

  it("should preserve the historical first-source fallback for an unknown explicit id", async () => {
    const sources = [createSyncSource("source-a"), createSyncSource("source-b")];
    const fixture = createSyncFixture(sources, { defaultSourceId: "source-b" });

    await fixture.service.syncSources("missing-source");

    expect(fixture.operations.filter((operation) => operation.startsWith("list:"))).toEqual([
      "list:source-a"
    ]);
    expect(fixture.clients.ensureClient).toHaveBeenCalledWith("source-a");
    expect(fixture.clients.ensureClient).not.toHaveBeenCalledWith("source-b");
  });
});

function createRemoteSource(kind: "wsl" | "ssh"): CachedSource {
  const source = {
    id: `source-${kind}`,
    name: "WSL",
    lastDetectedCodexVersion: null,
    lastDetectedCodexAt: null,
    lastDetectionError: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    kind
  };

  if (kind === "wsl") {
    return {
      ...source,
      kind,
      name: "WSL",
      settings: {
        distro: null,
        codexCommand: "codex",
        color: "blue"
      }
    };
  }

  return {
    ...source,
    kind,
    name: "SSH",
    settings: {
      host: "example.test",
      user: null,
      port: null,
      identityFile: null,
      codexCommand: "codex",
      color: "blue"
    }
  };
}

function createProject(path: string, sourceId: string): CachedProject {
  return {
    id: "project-1",
    sourceId,
    path,
    defaultName: "OpenCodexUI",
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    editedAt: "2026-01-01T00:00:00.000Z"
  };
}

function createRepository(source: CachedSource, project: CachedProject): OpenCodexCacheRepository {
  return {
    ensureDefaultSource: vi.fn(async () => source),
    listSources: vi.fn(async () => [source]),
    upsertProject: vi.fn(async () => project),
    listProjects: vi.fn(async () => [project])
  } as unknown as OpenCodexCacheRepository;
}

function createSourceClient(): CodexAppServerClient {
  return {
    getMetadata: vi.fn(async () => ({ isDirectory: true })),
    createDirectory: vi.fn(async () => ({}))
  } as unknown as CodexAppServerClient;
}

function createClientPort(client: CodexAppServerClient) {
  return {
    ensureClient: vi.fn(async () => client),
    getClient: vi.fn(() => client),
    restartClient: vi.fn(async () => undefined)
  };
}

function createSettingsPort(defaultSourceId: string) {
  const settings = createSettings(defaultSourceId);

  return {
    getSettings: vi.fn(() => settings),
    setSettings: vi.fn((nextSettings: OpenCodexSettings) => {
      Object.assign(settings, nextSettings);
    })
  };
}

function createBackendOptions(
  ensureProjectDirectory: CoreBackendOptions["ensureProjectDirectory"]
): CoreBackendOptions {
  return {
    settings: createSettings("source-wsl"),
    projectPath: null,
    emit: vi.fn(),
    ensureProjectDirectory
  };
}

function createSettings(defaultSourceId: string): OpenCodexSettings {
  return {
    codexCommand: "codex",
    codexReleaseCheck: {
      latestVersion: null,
      checkedAt: null,
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

type SyncFixtureOptions = {
  defaultSourceId: string;
};

/** Builds the smallest project/source graph needed to test sync orchestration. */
function createSyncFixture(
  sources: CachedSource[],
  options: SyncFixtureOptions
) {
  const operations: string[] = [];
  const events: OpenCodexEvent[] = [];
  const project = createProject("/workspace/project", sources[0]?.id ?? "source-a");
  const clientsBySourceId = new Map<string, CodexAppServerClient>();

  for (const source of sources) {
    clientsBySourceId.set(source.id, createSyncClient(source.id, operations));
  }

  toolVersionMocks.readCodexVersionStatus.mockImplementation(async () => createReadyStatus());
  toolVersionMocks.readCodexCommandCandidateStatuses.mockResolvedValue([]);

  const repository = {
    ensureDefaultSource: vi.fn(async () => sources[0] ?? createSyncSource("default")),
    listSources: vi.fn(async () => sources),
    updateSourceCodexDetection: vi.fn(async () => undefined),
    upsertThreadIndex: vi.fn(async (threads: Array<{ sourceId: string | null }>) => {
      operations.push(`write:${threads[0]?.sourceId ?? "empty"}`);
    }),
    deleteEmptyUnsyncedThreads: vi.fn(async () => 0),
    deleteRedundantOrphanProjects: vi.fn(async () => 0),
    listProjects: vi.fn(async () => [project]),
    getSourceProjectCount: vi.fn(async () => 1)
  } as unknown as OpenCodexCacheRepository;
  const settings = createSettingsPort(options.defaultSourceId);
  const ensureClient = vi.fn(async (sourceId: string | null) => {
    const client = clientsBySourceId.get(sourceId ?? "");

    if (client === undefined) {
      throw new Error(`Unexpected source client: ${sourceId}`);
    }

    return client;
  });
  const logger = vi.fn();
  const service = new ProjectSourceService({
    backendOptions: {
      ...createBackendOptions(vi.fn()),
      logger
    },
    cacheRepository: repository,
    settings,
    events: {
      emit: vi.fn((event: OpenCodexEvent) => events.push(event))
    },
    clients: {
      ensureClient,
      restartClient: vi.fn(async () => undefined)
    },
    updates: {
      getSourceUpdateStatus: () => createUpdateStatus()
    }
  });

  return {
    service,
    project,
    events,
    operations,
    clients: { ensureClient },
    repository
  };
}

/** Creates a source whose thread paths belong to a Codex-owned filesystem. */
function createSyncSource(id: string): CachedSource {
  return {
    id,
    name: id,
    kind: "custom",
    settings: {
      commandMode: "custom",
      command: "codex",
      hasLocalAccess: false,
      color: "blue",
      openFolderCommand: null,
      openFileCommand: null
    },
    lastDetectedCodexVersion: null,
    lastDetectedCodexAt: null,
    lastDetectionError: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

/** Creates a client that exposes one deterministic, source-labelled thread row. */
function createSyncClient(
  sourceId: string,
  operations: string[]
): CodexAppServerClient {
  return {
    listThreads: vi.fn(async () => {
      operations.push(`list:${sourceId}`);
      return {
        data: [{
          id: `thread-${sourceId}`,
          name: sourceId,
          cwd: null,
          preview: "",
          updatedAt: "2026-08-12T00:00:00.000Z",
          threadSource: "cli"
        }]
      };
    }),
    request: vi.fn(async () => ({ isDirectory: true }))
  } as unknown as CodexAppServerClient;
}

/** Creates a stable ready status used by final source snapshots as well as sync. */
function createReadyStatus(): OpenCodexToolVersionStatus {
  return {
    status: "ready",
    version: "0.147.0",
    message: "codex-cli 0.147.0",
    checkedAt: "2026-08-12T00:00:00.000Z"
  };
}

/** Creates the neutral source update state used by source snapshot assertions. */
function createUpdateStatus() {
  return {
    supported: false,
    updateAvailable: false,
    latestVersion: null,
    checkedAt: null,
    message: null
  };
}
