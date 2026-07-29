/**
 * Covers source-aware project opening.
 */
import type {
  CachedProject,
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import type { OpenCodexBackendOptions as CoreBackendOptions } from "../src/types";
import { ProjectSourceService } from "../src/backend/ProjectSourceService";

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
        getSettings: () => createSettings(source.id),
        setSettings: vi.fn(),
        emit: vi.fn(),
        ensureClient: vi.fn(async () => client),
        restartSourceClient: vi.fn(),
        getCodexUpdateStatus: () => ({
          supported: false,
          updateAvailable: false,
          latestVersion: null,
          checkedAt: null,
          message: null
        })
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
      getSettings: () => createSettings(source.id),
      setSettings: vi.fn(),
      emit: vi.fn(),
      ensureClient: vi.fn(async () => client),
      restartSourceClient: vi.fn(),
      getCodexUpdateStatus: () => ({
        supported: false,
        updateAvailable: false,
        latestVersion: null,
        checkedAt: null,
        message: null
      })
    });

    await service.openProject(projectPath, source.id, true);

    expect(client.createDirectory).toHaveBeenCalledWith(projectPath);
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
