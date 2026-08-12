/**
 * Covers the refactored Git panel sections through deterministic server rendering.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexGitFile,
  OpenCodexGitStatus
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "../src/stores/ProjectStore";
import type { ProjectGitStore } from "../src/stores/ProjectGitStore";
import type { RootStore } from "../src/stores/RootStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock("../src/components/projects/CommitMessageGenerationDialog", () => ({
  CommitMessageGenerationDialogX: () => null
}));
vi.mock("../src/components/projects/ProjectBranchSwitcherDialog", () => ({
  ProjectBranchSwitcherDialogX: () => null
}));
vi.mock("../src/components/projects/ProjectBranchMergeDialog", () => ({
  ProjectBranchMergeDialogX: () => null
}));
vi.mock("../src/components/projects/ProjectTagSelectorDialog", () => ({
  ProjectTagSelectorDialogX: () => null
}));
vi.mock("../src/components/projects/ProjectGitRemoteDialog", () => ({
  ProjectGitRemoteDialogX: () => null
}));
vi.mock("../src/components/projects/ProjectGitLogDialog", () => ({
  ProjectGitLogDialogX: () => null
}));

import { ProjectGitCommitSectionX } from "../src/components/projects/ProjectGitCommitSection";
import { ProjectGitFileSectionsX } from "../src/components/projects/ProjectGitFileSections";
import { ProjectGitPanelX } from "../src/components/projects/ProjectGitPanel";

describe("ProjectGitFileSections", () => {
  it("should render technical changed, deferred and staged files", () => {
    const markup = renderToStaticMarkup(
      <ProjectGitFileSectionsX
        canOpenFiles={false}
        gitLabelsKey="git.technical"
        gitStore={createGitStore()}
        onOpenFile={vi.fn()}
      />
    );

    expect(markup).toContain("git.technical.changed");
    expect(markup).toContain("git.technical.staged");
    expect(markup).toContain("git.deferred");
    expect(markup).toContain("git.technical.stageFile");
    expect(markup).toContain("git.technical.unstageFile");
    expect(markup).toContain("src/changed.ts");
    expect(markup).toContain("src/deferred.ts");
    expect(markup).toContain("src/staged.ts");
  });

  it("should render technical empty states when no files are available", () => {
    const markup = renderToStaticMarkup(
      <ProjectGitFileSectionsX
        canOpenFiles={false}
        gitLabelsKey="git.technical"
        gitStore={createGitStore({
          status: createStatus({
            changedFiles: [],
            stagedFiles: []
          }),
          changedFilesCount: 0,
          deferredChangedFiles: [],
          deferredFilesCount: 0,
          stageableChangedFiles: [],
          stagedFilesCount: 0
        })}
        onOpenFile={vi.fn()}
      />
    );

    expect(markup).toContain("git.technical.noChangedFiles");
    expect(markup).toContain("git.technical.noStagedFiles");
    expect(markup).not.toContain("git.deferred");
  });
});

describe("ProjectGitCommitSection", () => {
  it("should render the technical commit message and an enabled commit action", () => {
    const markup = renderToStaticMarkup(
      <ProjectGitCommitSectionX
        generateTooltip="git.technical.generateMessage"
        gitLabelsKey="git.technical"
        gitStore={createGitStore({
          canCommit: true,
          canGenerateCommitMessage: true,
          commitMessage: "release the change"
        })}
        onOpenGenerateDialog={vi.fn()}
      />
    );

    expect(markup).toContain("release the change");
    expect(markup).toContain("git.technical.commitMessage");
    expect(markup).toContain("git.technical.commit");
    expect(markup).not.toContain("disabled=\"\"");
  });

  it("should disable the technical commit controls while committing", () => {
    const markup = renderToStaticMarkup(
      <ProjectGitCommitSectionX
        generateTooltip="git.technical.generateMessage"
        gitLabelsKey="git.technical"
        gitStore={createGitStore({
          canCommit: false,
          canGenerateCommitMessage: false,
          isCommitting: true
        })}
        onOpenGenerateDialog={vi.fn()}
      />
    );

    expect(markup).toContain("git.technical.commitMessage");
    expect(markup).toContain("git.technical.commit");
    expect(markup).toContain("disabled=\"\"");
  });
});

describe("ProjectGitPanel", () => {
  it("should show source unavailability without the repository interface", () => {
    const markup = renderToStaticMarkup(
      <ProjectGitPanelX
        store={createRootStore()}
        projectStore={createProjectStore(
          createGitStore({
            isAvailable: false,
            status: createStatus({
              isRepository: false,
              changedFiles: [],
              stagedFiles: []
            })
          })
        )}
      />
    );

    expect(markup).toContain("git.sourceUnavailable");
    expect(markup).not.toContain("git.technical.changed");
    expect(markup).not.toContain("git.technical.staged");
    expect(markup).not.toContain("git.technical.commitMessage");
  });
});

/** Creates one file fixture with the status fields required by Git rows. */
function createFile(path: string, status: OpenCodexGitFile["status"]): OpenCodexGitFile {
  return {
    path,
    originalPath: null,
    status,
    stagedStatus: null,
    unstagedStatus: status
  };
}

/** Creates the repository status shared by the Git section fixtures. */
function createStatus(overrides: Partial<OpenCodexGitStatus> = {}): OpenCodexGitStatus {
  return {
    isRepository: true,
    aheadCount: 0,
    behindCount: 0,
    branchName: "main",
    upstreamName: null,
    pendingCommitMessage: null,
    remotes: [],
    changedFiles: [
      createFile("src/changed.ts", "modified"),
      createFile("src/deferred.ts", "modified")
    ],
    stagedFiles: [createFile("src/staged.ts", "added")],
    ...overrides
  };
}

/** Creates the minimal Git store surface consumed by the refactored components. */
function createGitStore(overrides: Partial<ProjectGitStore> = {}): ProjectGitStore {
  return {
    status: createStatus(),
    commitMessage: "commit message",
    changedFilesCount: 1,
    stageableChangedFiles: [createFile("src/changed.ts", "modified")],
    deferredChangedFiles: [createFile("src/deferred.ts", "modified")],
    deferredFilesCount: 1,
    stagedFilesCount: 1,
    selectedChangedPaths: [],
    selectedStagedPaths: [],
    isBusy: false,
    isAvailable: true,
    isLoading: false,
    isInitializingRepository: false,
    isCommitting: false,
    isGeneratingCommitMessage: false,
    canCommit: true,
    canGenerateCommitMessage: true,
    canPull: false,
    canPush: false,
    isPulling: false,
    isPushing: false,
    hasLoaded: true,
    errorMessage: null,
    tagErrorMessage: null,
    selectedReferenceTagName: null,
    commitsSinceReferenceTag: null,
    refresh: vi.fn(),
    initializeRepository: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
    stageSelected: vi.fn(),
    stageAll: vi.fn(),
    deferSelected: vi.fn(),
    deferPath: vi.fn(),
    stagePath: vi.fn(),
    toggleChangedPath: vi.fn(),
    restoreAllDeferred: vi.fn(),
    restoreDeferredPath: vi.fn(),
    getDeferredPathFor: vi.fn(() => "src"),
    unstageSelected: vi.fn(),
    unstageAll: vi.fn(),
    unstagePath: vi.fn(),
    toggleStagedPath: vi.fn(),
    setCommitMessage: vi.fn(),
    commit: vi.fn(),
    ...overrides
  } as unknown as ProjectGitStore;
}

/** Creates the project store surface read by the Git panel. */
function createProjectStore(gitStore: ProjectGitStore): ProjectStore {
  return {
    project: {
      id: "project-1",
      sourceId: "source-1"
    },
    projectPath: "/workspace/project-1",
    gitStore
  } as unknown as ProjectStore;
}

/** Creates a root store whose source list intentionally cannot resolve the project source. */
function createRootStore(): RootStore {
  return {
    sourcesStore: {
      sources: [],
      hasLocalAccess: vi.fn(() => false)
    },
    appStore: {
      settingsStore: {
        settings: {
          versioningVocabulary: "technical"
        }
      }
    },
    openExternalLink: vi.fn()
  } as unknown as RootStore;
}
