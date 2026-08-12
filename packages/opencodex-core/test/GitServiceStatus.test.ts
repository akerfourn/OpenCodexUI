/** Covers Git service status, initialization, and pending-message handling. */
import { describe, expect, it } from "vitest";

import {
  createGitService,
  FakeCodexClient
} from "./gitServiceTestUtils";

describe("GitService status", () => {
  it("should treat a non-zero repository check as a non-repository project", async () => {
    const client = new FakeCodexClient([
      {
        exitCode: 128,
        stdout: "",
        stderr: "fatal: ceci n'est pas un dépôt git"
      }
    ]);
    const service = createGitService(client);

    const status = await service.status("/workspace/project", "source-1");

    expect(status).toEqual({
      isRepository: false,
      aheadCount: 0,
      behindCount: 0,
      branchName: null,
      upstreamName: null,
      pendingCommitMessage: null,
      remotes: [],
      changedFiles: [],
      stagedFiles: []
    });
    expect(client.commands).toEqual([
      ["git", "rev-parse", "--is-inside-work-tree"]
    ]);
  });

  it("should initialize a repository before reading its status", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "Initialized empty Git repository", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head main\0", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = createGitService(client);

    const status = await service.init("/workspace/project", "source-1");

    expect(status.isRepository).toBe(true);
    expect(status.branchName).toBe("main");
    expect(client.commands).toEqual([
      ["git", "init"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
  });

  it("should read a prepared revert commit message when a revert is pending", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "true\n", stderr: "" },
      {
        exitCode: 0,
        stdout: "1 M. N... 100644 100644 100644 abc abc docs/releases/release-1.6.0.md\0",
        stderr: ""
      },
      { exitCode: 0, stdout: "/workspace/project/.git/REVERT_HEAD\n", stderr: "" },
      { exitCode: 0, stdout: "/workspace/project/.git/MERGE_MSG\n", stderr: "" },
      { exitCode: 0, stdout: "origin\tgit@example.com:owner/repo.git (fetch)\n", stderr: "" }
    ]);
    client.metadataByPath.set("/workspace/project/.git/REVERT_HEAD", {
      isDirectory: false,
      isFile: true,
      isSymlink: false,
      createdAtMs: 0,
      modifiedAtMs: 0
    });
    client.filesByPath.set(
      "/workspace/project/.git/MERGE_MSG",
      "Revert \"docs(releases): expand 1.6.0 notes\"\n\nThis reverts commit 14f6c7f.\n"
    );
    const service = createGitService(client);

    const status = await service.status("/workspace/project", "source-1");

    expect(status.pendingCommitMessage).toBe(
      "Revert \"docs(releases): expand 1.6.0 notes\"\n\nThis reverts commit 14f6c7f."
    );
    expect(client.commands).toEqual([
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "rev-parse", "--path-format=absolute", "--git-path", "REVERT_HEAD"],
      ["git", "rev-parse", "--path-format=absolute", "--git-path", "MERGE_MSG"],
      ["git", "remote", "-v"]
    ]);
  });
});
