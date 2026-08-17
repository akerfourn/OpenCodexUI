import { vi } from "vitest";

import type {
  OpenCodexGitBranch,
  OpenCodexGitBranchKind,
  OpenCodexGitRemote,
  OpenCodexGitStatus,
  OpenCodexGitTagListResult,
  OpenCodexProject,
  OpenCodexProjectPreferences,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

import { ProjectGitStore } from "../src/stores/ProjectGitStore";
import type { ProjectStore } from "../src/stores/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

/** Options used to seed one real Git store and its dynamic project context. */
export type ProjectGitReferencesFixtureOptions = {
  sourceReady?: boolean;
  status?: OpenCodexGitStatus;
  project?: OpenCodexProject;
};

/** Real Git store and mocked transport used by reference workflow tests. */
export type ProjectGitReferencesFixture = {
  gitStore: ProjectGitStore;
  projectStore: ProjectStore;
  request: ReturnType<typeof vi.fn>;
  root: RootStore;
  setSourceReady(value: boolean): void;
};

/** Promise whose completion can be controlled by a synchronization test. */
export type Deferred<T> = {
  promise: Promise<T>;
  reject(reason?: unknown): void;
  resolve(value: T): void;
};

/** Creates the real ProjectGitStore surface used by all reference tests. */
export function createProjectGitReferencesFixture(
  options: ProjectGitReferencesFixtureOptions = {}
): ProjectGitReferencesFixture {
  const request = vi.fn<(request: OpenCodexRequest) => Promise<unknown>>();
  let sourceReady = options.sourceReady ?? true;
  let currentProject = options.project ?? createProject();
  let gitStore: ProjectGitStore;
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
    }
  } as unknown as ProjectStore;
  const root = {
    request,
    appStore: {
      showWarningMessage: vi.fn(),
      settingsStore: {
        settings: {
          commitMessageModel: null,
          commitMessageReasoningEffort: "medium",
          commitMessageLanguage: "en"
        }
      }
    }
  } as unknown as RootStore;

  gitStore = new ProjectGitStore(projectStoreSurface, root);
  gitStore.statusStore.applyStatus(options.status ?? createStatus());

  return {
    gitStore,
    projectStore: projectStoreSurface,
    request,
    root,
    setSourceReady(value: boolean): void {
      sourceReady = value;
    }
  };
}

/** Creates stable project metadata included in every scoped Git payload. */
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

/** Creates a complete status snapshot with the supplied Git overrides. */
export function createStatus(
  overrides: Partial<OpenCodexGitStatus> = {}
): OpenCodexGitStatus {
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

/** Creates a local or remote branch entry accepted by the branch dialogs. */
export function createBranch(
  name: string,
  overrides: Partial<OpenCodexGitBranch> = {}
): OpenCodexGitBranch {
  const kind: OpenCodexGitBranchKind = overrides.kind ?? "local";
  const prefix = kind === "local" ? "refs/heads/" : "refs/remotes/";

  return {
    name,
    fullName: `${prefix}${name}`,
    kind,
    upstreamName: null,
    isCurrent: false,
    ...overrides
  };
}

/** Creates deterministic remote metadata for status replacement assertions. */
export function createRemote(name: string): OpenCodexGitRemote {
  return {
    name,
    fetchUrl: `https://${name}.example.test/repository.git`,
    pushUrl: `https://${name}.example.test/repository.git`
  };
}

/** Creates the empty tag response consumed by post-mutation synchronization. */
export function createTagResult(): OpenCodexGitTagListResult {
  return {
    tags: [],
    remoteName: null,
    remoteError: null
  };
}

/** Returns request method names in transport order. */
export function requestTypes(fixture: ProjectGitReferencesFixture): string[] {
  return fixture.request.mock.calls.map(([request]) => (
    (request as OpenCodexRequest).type
  ));
}

/** Creates a promise that resolves only when the test releases it. */
export function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise
  };
}

/** Lets fire-and-forget tag callbacks settle before assertions inspect state. */
export async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
