import { vi } from "vitest";

import type {
  OpenCodexGitFile,
  OpenCodexGitFileState,
  OpenCodexGitStatus,
  OpenCodexProject,
  OpenCodexProjectPreferences
} from "@open-codex-ui/opencodex-protocol";

import { ProjectGitStore } from "../src/stores/ProjectGitStore";
import type { ProjectStore } from "../src/stores/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

/** Options used to create a project Git workflow fixture. */
export type ProjectGitChangesFixtureOptions = {
  project?: OpenCodexProject;
  sourceReady?: boolean;
  status?: OpenCodexGitStatus;
};

/** Real store and transport surfaces used by the Git workflow tests. */
export type ProjectGitChangesFixture = {
  applyStatus: (status: OpenCodexGitStatus) => void;
  gitStore: ProjectGitStore;
  projectStore: ProjectStore;
  request: ReturnType<typeof vi.fn>;
  root: RootStore;
  setSourceReady: (value: boolean) => void;
};

/** Creates a real Git store with mutable project metadata and a mocked transport. */
export function createProjectGitChangesFixture(
  options: ProjectGitChangesFixtureOptions = {}
): ProjectGitChangesFixture {
  let currentProject = options.project ?? createProject();
  let sourceReady = options.sourceReady ?? true;
  let gitStore: ProjectGitStore;
  const request = vi.fn();
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
      settingsStore: { settings: {} }
    }
  } as unknown as RootStore;

  gitStore = new ProjectGitStore(projectStoreSurface, root);
  gitStore.statusStore.applyStatus(options.status ?? createStatus());

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
    }
  };
}

/** Creates stable project metadata for requests and preference reconciliation. */
export function createProject(
  preferences: OpenCodexProjectPreferences = {}
): OpenCodexProject {
  return {
    id: "project-1",
    sourceId: "source-1",
    path: "/workspace/project",
    defaultName: "Project",
    displayName: null,
    isHidden: false,
    preferences,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    editedAt: "2026-01-01T00:00:00.000Z"
  };
}

/** Creates unrelated preferences that must survive deferred-path updates. */
export function createPreferences(
  deferredPaths: string[] = []
): OpenCodexProjectPreferences {
  return {
    git: {
      referenceTagName: "v1.0.0",
      deferredPaths
    },
    context: {
      permissionsProfileId: "profile-1",
      folders: [{
        id: "folder-1",
        path: "docs",
        label: "Docs",
        enabled: true
      }],
      lastSyncedAt: "2026-01-02T00:00:00.000Z"
    }
  };
}

/** Creates a complete status snapshot with optional field overrides. */
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
    stagedFiles: [],
    ...overrides
  };
}

/** Creates a complete Git file entry for status and selection assertions. */
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
