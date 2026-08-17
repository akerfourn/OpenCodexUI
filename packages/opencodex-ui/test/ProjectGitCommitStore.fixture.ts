import { vi } from "vitest";

import type {
  OpenCodexGitFile,
  OpenCodexGitFileState,
  OpenCodexGitStatus,
  OpenCodexGitTagListResult,
  OpenCodexProject,
  OpenCodexRequest,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import { ProjectGitStore } from "../src/stores/ProjectGitStore";
import { ProjectGitStatusStore } from "../src/stores/ProjectGitStatusStore";
import type { ProjectStore } from "../src/stores/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

const storesWithStubbedRefresh = new WeakSet<ProjectGitStatusStore>();
const originalStatusRefresh = ProjectGitStatusStore.prototype.refresh;
const statusRefreshSpy = vi.spyOn(ProjectGitStatusStore.prototype, "refresh");
statusRefreshSpy.mockImplementation(function (this: ProjectGitStatusStore): Promise<void> {
  if (storesWithStubbedRefresh.has(this)) {
    return Promise.resolve();
  }

  return originalStatusRefresh.call(this);
});

/** Options used to create a commit workflow fixture. */
export type ProjectGitCommitFixtureOptions = {
  project?: OpenCodexProject;
  sourceReady?: boolean;
  status?: OpenCodexGitStatus;
  stubStatusRefresh?: boolean;
  settings?: Partial<OpenCodexSettings>;
};

/** Real Git store and mocked transport used by commit workflow tests. */
export type ProjectGitCommitFixture = {
  applyStatus: (status: OpenCodexGitStatus) => void;
  gitStore: ProjectGitStore;
  projectStore: ProjectStore;
  request: ReturnType<typeof vi.fn>;
  root: RootStore;
  setSourceReady: (value: boolean) => void;
  statusRefresh: ReturnType<typeof vi.spyOn>;
};

/** Creates a real ProjectGitStore with complete settings and a mocked transport. */
export function createProjectGitCommitFixture(
  options: ProjectGitCommitFixtureOptions = {}
): ProjectGitCommitFixture {
  let currentProject = options.project ?? createProject();
  let sourceReady = options.sourceReady ?? true;
  let gitStore: ProjectGitStore;
  const request = vi.fn<(request: OpenCodexRequest) => Promise<unknown>>();
  const projectStoreSurface = {
    get project(): OpenCodexProject {
      return currentProject;
    },
    get projectPath(): string {
      return currentProject.path;
    },
    get isCodexSourceReady(): boolean {
      return sourceReady;
    },
    setProject(project: OpenCodexProject): void {
      currentProject = project;
      gitStore.applyProjectPreferences(project.preferences);
    }
  } as unknown as ProjectStore;
  const root = {
    request,
    appStore: {
      showWarningMessage: vi.fn(),
      settingsStore: {
        settings: createSettings(options.settings)
      }
    }
  } as unknown as RootStore;

  gitStore = new ProjectGitStore(projectStoreSurface, root);
  gitStore.statusStore.applyStatus(options.status ?? createStatus());

  statusRefreshSpy.mockClear();
  if (options.stubStatusRefresh ?? true) {
    storesWithStubbedRefresh.add(gitStore.statusStore);
  }

  return {
    applyStatus: (status) => {
      gitStore.statusStore.applyStatus(status);
    },
    gitStore,
    projectStore: projectStoreSurface,
    request,
    root,
    setSourceReady: (value) => {
      sourceReady = value;
    },
    statusRefresh: statusRefreshSpy
  };
}

/** Creates stable project metadata for requests containing project context. */
export function createProject(): OpenCodexProject {
  return {
    id: "project-1",
    sourceId: "source-1",
    path: "/workspace/project",
    defaultName: "Project",
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    editedAt: "2026-01-01T00:00:00.000Z"
  };
}

/** Creates a repository status with one staged file by default. */
export function createStatus(overrides: Partial<OpenCodexGitStatus> = {}): OpenCodexGitStatus {
  return {
    isRepository: true,
    aheadCount: 0,
    behindCount: 0,
    branchName: "main",
    upstreamName: "origin/main",
    pendingCommitMessage: null,
    remotes: [],
    changedFiles: [],
    stagedFiles: [createFile("src/staged.ts", "added")],
    ...overrides
  };
}

/** Creates a complete normalized file fixture for status assertions. */
export function createFile(
  path: string,
  status: OpenCodexGitFileState = "modified"
): OpenCodexGitFile {
  return {
    path,
    originalPath: null,
    status,
    stagedStatus: null,
    unstagedStatus: status
  };
}

/** Creates the empty tag response used by a real status refresh. */
export function createTagResult(): OpenCodexGitTagListResult {
  return {
    tags: [],
    remoteName: null,
    remoteError: null
  };
}

/** Lets fire-and-forget tag loading finish before assertions inspect state. */
export async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Creates complete application settings with focused commit overrides. */
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
    commitMessageModel: "gpt-5.5",
    commitMessageReasoningEffort: "high",
    commitMessageLanguage: "fr",
    showActivityPanel: true,
    experimentalApi: true,
    allowTurnSteering: false,
    language: "system",
    colorScheme: "system",
    enterKeyBehavior: "newline",
    versioningVocabulary: "technical",
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
