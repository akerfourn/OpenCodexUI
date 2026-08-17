import { describe, expect, it, vi } from "vitest";
import { isObservableProp } from "mobx";

import type {
  OpenCodexGitCommitDetails,
  OpenCodexGitLogCommit,
  OpenCodexGitLogPage,
  OpenCodexGitStatus,
  OpenCodexProject
} from "@open-codex-ui/opencodex-protocol";

import { ProjectGitStore } from "../src/stores/ProjectGitStore";
import type { ProjectStore } from "../src/stores/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

describe("ProjectGitStore Git log history", () => {
  it("should load the first page with the exact request and reset loading state", async () => {
    const fixture = createFixture();
    const commits = [createCommit("commit-1"), createCommit("commit-2")];
    const page: OpenCodexGitLogPage = { commits, hasMore: true };
    fixture.request.mockResolvedValueOnce(page);

    await fixture.gitStore.loadGitLog(true);

    expect(fixture.request).toHaveBeenCalledTimes(1);
    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.log",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      limit: 50,
      skip: 0
    });
    expect(fixture.gitStore.logCommits).toEqual(commits);
    expect(fixture.gitStore.hasMoreLogCommits).toBe(true);
    expect(fixture.gitStore.hasLoadedLog).toBe(true);
    expect(fixture.gitStore.isLoadingLog).toBe(false);
  });

  it("should append the next page by length and deduplicate hashes across pages", async () => {
    const fixture = createFixture();
    const firstPage = [createCommit("commit-1"), createCommit("commit-2")];
    const nextPage = [createCommit("commit-2"), createCommit("commit-3")];
    fixture.request
      .mockResolvedValueOnce({ commits: firstPage, hasMore: true })
      .mockResolvedValueOnce({ commits: nextPage, hasMore: false });

    await fixture.gitStore.loadGitLog(true);
    await fixture.gitStore.loadMoreGitLog();

    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "git.log",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      limit: 50,
      skip: firstPage.length
    });
    expect(fixture.gitStore.logCommits).toEqual([
      firstPage[0],
      firstPage[1],
      nextPage[1]
    ]);
    expect(fixture.gitStore.hasMoreLogCommits).toBe(false);
    expect(fixture.gitStore.isLoadingLog).toBe(false);
  });

  it("should replace the log and clear cached commit details on reset", async () => {
    const fixture = createFixture();
    const previousCommit = createCommit("old-commit");
    const replacementCommit = createCommit("new-commit");
    fixture.gitStore.logCommits = [previousCommit];
    fixture.gitStore.commitDetailsByHash.set("old-commit", createDetails("old-commit"));
    fixture.request.mockResolvedValueOnce({
      commits: [replacementCommit],
      hasMore: false
    });

    await fixture.gitStore.loadGitLog(true);

    expect(fixture.gitStore.logCommits).toEqual([replacementCommit]);
    expect(fixture.gitStore.commitDetailsByHash.size).toBe(0);
  });

  it("should trim, request, cache and reuse commit details by hash", async () => {
    const fixture = createFixture();
    const details = createDetails("commit-1");
    fixture.request.mockResolvedValueOnce(details);

    await fixture.gitStore.loadCommitDetails("  commit-1  ");

    expect(fixture.request).toHaveBeenCalledTimes(1);
    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.commit.details",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      hash: "commit-1"
    });
    expect(fixture.gitStore.commitDetailsByHash.get("commit-1")).toEqual(details);
    expect(fixture.gitStore.loadingCommitDetailsHash).toBe(null);

    await fixture.gitStore.loadCommitDetails("commit-1");

    expect(fixture.request).toHaveBeenCalledTimes(1);
    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.commit.details",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      hash: "commit-1"
    });
  });

  it("should guard Git log loading when the source is unavailable", async () => {
    const fixture = createFixture({ sourceReady: false });

    await fixture.gitStore.loadGitLog(true);

    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.gitStore.logCommits).toEqual([]);
    expect(fixture.gitStore.isLoadingLog).toBe(false);
  });

  it("should guard Git log loading when the project is not a repository", async () => {
    const fixture = createFixture({ isRepository: false });

    await fixture.gitStore.loadGitLog(true);

    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.gitStore.logCommits).toEqual([]);
  });

  it("should guard commit details when the hash is empty", async () => {
    const fixture = createFixture();

    await fixture.gitStore.loadCommitDetails("   ");

    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.gitStore.loadingCommitDetailsHash).toBe(null);
  });

  it("should guard commit details when the source is unavailable", async () => {
    const fixture = createFixture({ sourceReady: false });

    await fixture.gitStore.loadCommitDetails("commit-1");

    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.gitStore.loadingCommitDetailsHash).toBe(null);
  });

  it("should guard commit details when the project is not a repository", async () => {
    const fixture = createFixture({ isRepository: false });

    await fixture.gitStore.loadCommitDetails("commit-1");

    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.gitStore.loadingCommitDetailsHash).toBe(null);
  });

  it("should guard commit details when the hash is already cached", async () => {
    const fixture = createFixture();
    fixture.gitStore.commitDetailsByHash.set("commit-1", createDetails("commit-1"));

    await fixture.gitStore.loadCommitDetails("commit-1");

    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.gitStore.loadingCommitDetailsHash).toBe(null);
  });

  it("should look up commit details by exact hash without trimming", () => {
    const fixture = createFixture();
    const details = createDetails("commit-1");
    fixture.gitStore.commitDetailsByHash.set("commit-1", details);

    expect(fixture.gitStore.getCommitDetails("commit-1")).toEqual(details);
    expect(fixture.gitStore.getCommitDetails(" commit-1 ")).toBe(null);
    expect(fixture.gitStore.getCommitDetails("missing")).toBe(null);
  });

  it("should guard Git log loading while another log request is active", async () => {
    const fixture = createFixture();
    fixture.gitStore.isLoadingLog = true;

    await fixture.gitStore.loadGitLog(true);

    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.gitStore.isLoadingLog).toBe(true);
  });

  it("should expose log errors and reset the log loading flag", async () => {
    const fixture = createFixture();
    fixture.request.mockRejectedValueOnce(new Error("log failed"));

    await fixture.gitStore.loadGitLog(true);

    expect(fixture.gitStore.logErrorMessage).toBe("log failed");
    expect(fixture.gitStore.hasLoadedLog).toBe(true);
    expect(fixture.gitStore.isLoadingLog).toBe(false);
  });

  it("should expose commit detail errors and reset the detail loading flag", async () => {
    const fixture = createFixture();
    fixture.request.mockRejectedValueOnce(new Error("details failed"));

    await fixture.gitStore.loadCommitDetails("commit-1");

    expect(fixture.gitStore.logErrorMessage).toBe("details failed");
    expect(fixture.gitStore.loadingCommitDetailsHash).toBe(null);
    expect(fixture.gitStore.commitDetailsByHash.size).toBe(0);
  });

  it("should clear all historical log fields", () => {
    const fixture = createFixture();
    fixture.gitStore.logCommits = [createCommit("commit-1")];
    fixture.gitStore.commitDetailsByHash.set("commit-1", createDetails("commit-1"));
    fixture.gitStore.hasLoadedLog = true;
    fixture.gitStore.hasMoreLogCommits = true;
    fixture.gitStore.isLoadingLog = true;
    fixture.gitStore.loadingCommitDetailsHash = "commit-1";
    fixture.gitStore.logErrorMessage = "old error";

    fixture.gitStore.clearLog();

    expect(fixture.gitStore.logCommits).toEqual([]);
    expect(fixture.gitStore.commitDetailsByHash.size).toBe(0);
    expect(fixture.gitStore.hasLoadedLog).toBe(false);
    expect(fixture.gitStore.hasMoreLogCommits).toBe(false);
    expect(fixture.gitStore.isLoadingLog).toBe(false);
    expect(fixture.gitStore.loadingCommitDetailsHash).toBe(null);
    expect(fixture.gitStore.logErrorMessage).toBe(null);
  });

  it("should expose observable history state and bind detached log methods", async () => {
    const fixture = createFixture();
    const commit = createCommit("commit-1");
    const details = createDetails("commit-1");
    fixture.request
      .mockResolvedValueOnce({ commits: [commit], hasMore: false })
      .mockResolvedValueOnce(details);

    expect(isObservableProp(fixture.gitStore, "logCommits")).toBe(true);
    expect(isObservableProp(fixture.gitStore, "commitDetailsByHash")).toBe(true);
    expect(isObservableProp(fixture.gitStore, "hasLoadedLog")).toBe(true);
    expect(isObservableProp(fixture.gitStore, "hasMoreLogCommits")).toBe(true);
    expect(isObservableProp(fixture.gitStore, "isLoadingLog")).toBe(true);
    expect(isObservableProp(fixture.gitStore, "loadingCommitDetailsHash")).toBe(true);
    expect(isObservableProp(fixture.gitStore, "logErrorMessage")).toBe(true);

    const loadGitLog = fixture.gitStore.loadGitLog;
    const loadCommitDetails = fixture.gitStore.loadCommitDetails;
    await loadGitLog(true);
    await loadCommitDetails("commit-1");

    expect(fixture.gitStore.logCommits).toEqual([commit]);
    expect(fixture.gitStore.commitDetailsByHash.get("commit-1")).toEqual(details);
    expect(fixture.gitStore.isLoadingLog).toBe(false);
    expect(fixture.gitStore.loadingCommitDetailsHash).toBe(null);
  });
});

type FixtureOptions = {
  sourceReady?: boolean;
  isRepository?: boolean;
};

type Fixture = {
  gitStore: ProjectGitStore;
  request: ReturnType<typeof vi.fn>;
};

/** Creates the smallest project/root surface used by the real Git store. */
function createFixture(options: FixtureOptions = {}): Fixture {
  const request = vi.fn();
  const project: OpenCodexProject = {
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
  const projectStore = {
    project,
    projectPath: project.path,
    isCodexSourceReady: options.sourceReady ?? true
  } as unknown as ProjectStore;
  const root = { request } as unknown as RootStore;
  const gitStore = new ProjectGitStore(projectStore, root);
  gitStore.status = createStatus(options.isRepository ?? true);

  return { gitStore, request };
}

/** Creates the repository status required for the log guards. */
function createStatus(isRepository: boolean): OpenCodexGitStatus {
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

/** Creates a compact commit fixture with stable values for exact assertions. */
function createCommit(hash: string): OpenCodexGitLogCommit {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    authorName: "Ada Lovelace",
    authorEmail: "ada@example.com",
    authoredAt: "2026-01-01T00:00:00.000Z",
    subject: `Subject ${hash}`,
    refs: []
  };
}

/** Creates the commit detail fixture used by cache and reset assertions. */
function createDetails(hash: string): OpenCodexGitCommitDetails {
  return {
    hash,
    message: `Message ${hash}`,
    files: []
  };
}
