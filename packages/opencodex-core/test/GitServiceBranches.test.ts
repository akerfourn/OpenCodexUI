/** Covers Git service branch listing and branch mutations. */
import { describe, expect, it } from "vitest";

import {
  createGitService,
  FakeCodexClient
} from "./gitServiceTestUtils";

describe("GitService branches", () => {
  it("should list local branches before remote branches", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "feature/ui\n", stderr: "" },
      {
        exitCode: 0,
        stdout: [
          "refs/remotes/origin/main\torigin/main\t",
          "refs/heads/main\tmain\torigin/main",
          "refs/remotes/origin/HEAD\torigin/HEAD\t",
          "refs/heads/feature/ui\tfeature/ui\t",
          ""
        ].join("\n"),
        stderr: ""
      }
    ]);
    const service = createGitService(client);

    const branches = await service.branches("/workspace/project", "source-1");

    expect(branches).toEqual([
      {
        name: "feature/ui",
        fullName: "refs/heads/feature/ui",
        kind: "local",
        upstreamName: null,
        isCurrent: true
      },
      {
        name: "main",
        fullName: "refs/heads/main",
        kind: "local",
        upstreamName: "origin/main",
        isCurrent: false
      },
      {
        name: "origin/main",
        fullName: "refs/remotes/origin/main",
        kind: "remote",
        upstreamName: null,
        isCurrent: false
      }
    ]);
    expect(client.commands).toEqual([
      ["git", "branch", "--show-current"],
      [
        "git",
        "for-each-ref",
        "--format=%(refname)%09%(refname:short)%09%(upstream:short)",
        "refs/heads",
        "refs/remotes"
      ]
    ]);
  });

  it("should checkout existing branches and refresh status", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head feature/api\0", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = createGitService(client);

    const status = await service.checkoutBranch(
      "/workspace/project",
      "source-1",
      "feature/api",
      "local"
    );

    expect(status.branchName).toBe("feature/api");
    expect(client.commands).toEqual([
      ["git", "checkout", "feature/api"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
  });

  it("should create and checkout a new local branch", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "feature/new\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head feature/new\0", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = createGitService(client);

    const status = await service.createBranch("/workspace/project", "source-1", "feature/new");

    expect(status.branchName).toBe("feature/new");
    expect(client.commands).toEqual([
      ["git", "check-ref-format", "--branch", "feature/new"],
      ["git", "checkout", "-b", "feature/new"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
  });

  it("should merge an existing local branch and refresh status", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "Already up to date.\n", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head main\0", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = createGitService(client);

    const status = await service.mergeBranch("/workspace/project", "source-1", "feature/api");

    expect(status.branchName).toBe("main");
    expect(client.commands).toEqual([
      ["git", "merge", "feature/api"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
  });

  it("should merge the current branch into another local branch", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head feature/api\0", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "Switched to branch 'main'.\n", stderr: "" },
      { exitCode: 0, stdout: "Already up to date.\n", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head main\0", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = createGitService(client);

    const status = await service.mergeBranchTo("/workspace/project", "source-1", "main");

    expect(status.branchName).toBe("main");
    expect(client.commands).toEqual([
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"],
      ["git", "show-ref", "--verify", "--quiet", "refs/heads/main"],
      ["git", "checkout", "main"],
      ["git", "merge", "feature/api"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
  });

  it("should reject merging to another branch when the worktree is dirty", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "true\n", stderr: "" },
      {
        exitCode: 0,
        stdout: "# branch.head feature/api\0" +
          "1 .M N... 100644 100644 100644 abc abc changed.ts\0",
        stderr: ""
      },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = createGitService(client);

    await expect(
      service.mergeBranchTo("/workspace/project", "source-1", "main")
    ).rejects.toThrow("uncommitted changes");
    expect(client.commands).toHaveLength(3);
  });

  it("should publish the current local branch and configure its upstream", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head feature/api\0", stderr: "" },
      { exitCode: 0, stdout: "origin\tgit@example.com:owner/repo.git (fetch)\n", stderr: "" },
      { exitCode: 0, stdout: "backup\norigin\n", stderr: "" },
      { exitCode: 0, stdout: "branch 'feature/api' set up to track 'origin/feature/api'.\n", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      {
        exitCode: 0,
        stdout: "# branch.head feature/api\0# branch.upstream origin/feature/api\0",
        stderr: ""
      },
      { exitCode: 0, stdout: "origin\tgit@example.com:owner/repo.git (fetch)\n", stderr: "" }
    ]);
    const service = createGitService(client);

    const status = await service.publishCurrentBranch("/workspace/project", "source-1");

    expect(status.branchName).toBe("feature/api");
    expect(status.upstreamName).toBe("origin/feature/api");
    expect(client.commands).toEqual([
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"],
      ["git", "remote"],
      ["git", "push", "--set-upstream", "origin", "feature/api"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
  });
});
