import { vi } from "vitest";

import type {
  OpenCodexGitFile,
  OpenCodexGitFileState,
  OpenCodexGitRemote,
  OpenCodexGitStatus,
  OpenCodexGitTag,
  OpenCodexGitTagListResult,
  OpenCodexProject
} from "@open-codex-ui/opencodex-protocol";

import { ProjectGitStore } from "../src/stores/project/git/ProjectGitStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

export type ProjectGitStatusFixtureOptions = {
  sourceReady?: boolean;
  status?: OpenCodexGitStatus;
};

export type ProjectGitStatusFixture = {
  gitStore: ProjectGitStore;
  projectStore: ProjectStore;
  root: RootStore;
  request: ReturnType<typeof vi.fn>;
  setSourceReady: (value: boolean) => void;
};

/** Creates the minimal project and root surfaces used by the Git status store. */
export function createProjectGitStatusFixture(
  options: ProjectGitStatusFixtureOptions = {}
): ProjectGitStatusFixture {
  const request = vi.fn();
  const project = createProject();
  const projectStoreSurface = {
    project,
    projectPath: project.path,
    isCodexSourceReady: options.sourceReady ?? true,
    setProject: vi.fn()
  } as unknown as ProjectStore;
  const root = {
    request,
    appStore: {
      showWarningMessage: vi.fn(),
      settingsStore: { settings: {} }
    }
  } as unknown as RootStore;
  const gitStore = new ProjectGitStore(projectStoreSurface, root);
  gitStore.statusStore.status = options.status ?? createStatus();

  return {
    gitStore,
    projectStore: projectStoreSurface,
    root,
    request,
    setSourceReady: (value) => {
      (projectStoreSurface as unknown as { isCodexSourceReady: boolean }).isCodexSourceReady = value;
    }
  };
}

/** Creates stable project metadata for requests that include project identity. */
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

/** Creates a complete normalized file entry for status selection assertions. */
export function createFile(path: string, status: OpenCodexGitFileState = "modified"): OpenCodexGitFile {
  return {
    path,
    originalPath: null,
    status,
    stagedStatus: null,
    unstagedStatus: status
  };
}

/** Creates deterministic remote metadata for full status replacement assertions. */
export function createRemote(name: string): OpenCodexGitRemote {
  return {
    name,
    fetchUrl: `https://${name}.example.test/repository.git`,
    pushUrl: `https://${name}.example.test/repository.git`
  };
}

/** Creates a successful empty tag response consumed after repository refresh. */
export function createTagResult(): OpenCodexGitTagListResult {
  return {
    tags: [],
    remoteName: null,
    remoteError: null
  };
}

/** Creates one loaded tag that can be cleared by a non-repository refresh. */
export function createTag(name: string): OpenCodexGitTag {
  return {
    name,
    fullName: `refs/tags/${name}`,
    targetHash: `${name}-hash`,
    createdAt: "2026-01-01T00:00:00.000Z",
    remoteTargetHash: `${name}-remote-hash`,
    syncStatus: "synced"
  };
}

/** Lets fire-and-forget tag loading finish before assertions inspect its state. */
export async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
