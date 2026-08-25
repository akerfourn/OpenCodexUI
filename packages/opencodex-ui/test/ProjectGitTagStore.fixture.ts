import { expect, vi } from "vitest";

import type {
  OpenCodexGitStatus,
  OpenCodexGitTag,
  OpenCodexProject,
  OpenCodexProjectPreferences
} from "@open-codex-ui/opencodex-protocol";

import { ProjectGitStore } from "../src/stores/project/git/ProjectGitStore";
import type { ProjectGitTagStore } from "../src/stores/project/git/ProjectGitTagStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

export type FixtureOptions = {
  sourceReady?: boolean;
  isRepository?: boolean;
  preferences?: OpenCodexProjectPreferences;
};

export type Fixture = {
  gitStore: ProjectGitStore;
  tagStore: ProjectGitTagStore;
  projectStore: ProjectStore;
  root: RootStore;
  request: ReturnType<typeof vi.fn>;
  setSourceReady: (value: boolean) => void;
};

/** Creates the minimal project/root surface exercised by the real Git store. */
export function createFixture(options: FixtureOptions = {}): Fixture {
  const request = vi.fn();
  const sourceReady = options.sourceReady ?? true;
  const project = createProject(options.preferences ?? {});
  const projectStoreSurface = {
    project,
    projectPath: project.path,
    isCodexSourceReady: sourceReady,
    setProject: vi.fn()
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
  const gitStore = new ProjectGitStore(projectStoreSurface, root);
  gitStore.statusStore.status = createStatus(options.isRepository ?? true);

  return {
    gitStore,
    tagStore: gitStore.tagStore,
    projectStore: projectStoreSurface,
    root,
    request,
    setSourceReady: (value) => {
      (projectStoreSurface as unknown as { isCodexSourceReady: boolean }).isCodexSourceReady = value;
    }
  };
}

/** Creates stable project metadata accepted by project preference persistence. */
export function createProject(preferences: OpenCodexProjectPreferences): OpenCodexProject {
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

/** Creates the repository status required by tag guards. */
export function createStatus(isRepository = true): OpenCodexGitStatus {
  return {
    isRepository,
    aheadCount: 0,
    behindCount: 0,
    branchName: null,
    upstreamName: null,
    pendingCommitMessage: null,
    remotes: [],
    changedFiles: [],
    stagedFiles: []
  };
}

/** Creates a compact tag with deterministic metadata. */
export function createTag(
  name: string,
  syncStatus: OpenCodexGitTag["syncStatus"]
): OpenCodexGitTag {
  return {
    name,
    fullName: `refs/tags/${name}`,
    targetHash: `${name}-hash`,
    createdAt: "2026-01-01T00:00:00.000Z",
    remoteTargetHash: syncStatus === "local-only" ? null : `${name}-remote-hash`,
    syncStatus
  };
}

/** Creates preferences whose unrelated fields must survive reference updates. */
export function createPreferences(): OpenCodexProjectPreferences {
  return {
    git: { referenceTagName: "old", deferredPaths: ["dist"] },
    context: {
      permissionsProfileId: "profile-1",
      folders: [{ id: "folder-1", path: "docs", label: "Docs", enabled: true }],
      lastSyncedAt: "2026-01-02T00:00:00.000Z"
    }
  };
}

/** Seeds every tag field so clear behavior is asserted rather than inferred. */
export function seedTagState(tagStore: ProjectGitTagStore): void {
  tagStore.tags = [createTag("old", "synced")];
  tagStore.tagsRemoteName = "origin";
  tagStore.selectedReferenceTagName = "old";
  tagStore.commitsSinceReferenceTag = 3;
  tagStore.tagErrorMessage = "old error";
  tagStore.tagSyncErrorMessage = "old warning";
}

/** Verifies the complete tag state cleared by repository/source guards. */
export function expectTagStateCleared(
  tagStore: ProjectGitTagStore,
  includeTagError = true
): void {
  expect(tagStore.tags).toEqual([]);
  expect(tagStore.tagsRemoteName).toBe(null);
  expect(tagStore.selectedReferenceTagName).toBe(null);
  expect(tagStore.commitsSinceReferenceTag).toBe(null);
  if (includeTagError) {
    expect(tagStore.tagErrorMessage).toBe(null);
  }
  expect(tagStore.tagSyncErrorMessage).toBe(null);
}

/** Lets fire-and-forget preference persistence finish its promise callbacks. */
export async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
