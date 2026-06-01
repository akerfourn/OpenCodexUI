/**
 * Covers Git service command orchestration.
 */
import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import { describe, expect, it } from "vitest";

import { GitService } from "../src/backend/GitService";

type FakeProcessResponse = Pick<
  v2.ProcessExitedNotification,
  "exitCode" | "stdout" | "stderr"
>;

type FakeNotificationListener = (notification: {
  method: string;
  params: v2.ProcessExitedNotification;
}) => void;

describe("GitService", () => {
  it("should treat a non-zero repository check as a non-repository project", async () => {
    const client = new FakeCodexClient([
      {
        exitCode: 128,
        stdout: "",
        stderr: "fatal: ceci n'est pas un dépôt git"
      }
    ]);
    const service = new GitService({
      ensureClient: async () => client.asCodexClient()
    });

    const status = await service.status("/workspace/project", "source-1");

    expect(status).toEqual({
      isRepository: false,
      aheadCount: 0,
      behindCount: 0,
      branchName: null,
      upstreamName: null,
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
      { exitCode: 0, stdout: "# branch.head main\0", stderr: "" }
    ]);
    const service = new GitService({
      ensureClient: async () => client.asCodexClient()
    });

    const status = await service.init("/workspace/project", "source-1");

    expect(status.isRepository).toBe(true);
    expect(status.branchName).toBe("main");
    expect(client.commands).toEqual([
      ["git", "init"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"]
    ]);
  });

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
    const service = new GitService({
      ensureClient: async () => client.asCodexClient()
    });

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
      { exitCode: 0, stdout: "# branch.head feature/api\0", stderr: "" }
    ]);
    const service = new GitService({
      ensureClient: async () => client.asCodexClient()
    });

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
      ["git", "status", "--porcelain=v2", "-z", "--branch"]
    ]);
  });

  it("should create and checkout a new local branch", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "feature/new\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head feature/new\0", stderr: "" }
    ]);
    const service = new GitService({
      ensureClient: async () => client.asCodexClient()
    });

    const status = await service.createBranch("/workspace/project", "source-1", "feature/new");

    expect(status.branchName).toBe("feature/new");
    expect(client.commands).toEqual([
      ["git", "check-ref-format", "--branch", "feature/new"],
      ["git", "checkout", "-b", "feature/new"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"]
    ]);
  });

  it("should merge an existing local branch and refresh status", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "Already up to date.\n", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head main\0", stderr: "" }
    ]);
    const service = new GitService({
      ensureClient: async () => client.asCodexClient()
    });

    const status = await service.mergeBranch("/workspace/project", "source-1", "feature/api");

    expect(status.branchName).toBe("main");
    expect(client.commands).toEqual([
      ["git", "merge", "feature/api"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"]
    ]);
  });

  it("should publish the current local branch and configure its upstream", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head feature/api\0", stderr: "" },
      { exitCode: 0, stdout: "backup\norigin\n", stderr: "" },
      { exitCode: 0, stdout: "branch 'feature/api' set up to track 'origin/feature/api'.\n", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      {
        exitCode: 0,
        stdout: "# branch.head feature/api\0# branch.upstream origin/feature/api\0",
        stderr: ""
      }
    ]);
    const service = new GitService({
      ensureClient: async () => client.asCodexClient()
    });

    const status = await service.publishCurrentBranch("/workspace/project", "source-1");

    expect(status.branchName).toBe("feature/api");
    expect(status.upstreamName).toBe("origin/feature/api");
    expect(client.commands).toEqual([
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote"],
      ["git", "push", "--set-upstream", "origin", "feature/api"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"]
    ]);
  });

  it("should list Git tags with metadata", async () => {
    const client = new FakeCodexClient([
      {
        exitCode: 0,
        stdout: [
          "refs/tags/v1.2.0\tv1.2.0\tabc1234\t2026-05-01T10:00:00+00:00",
          "refs/tags/v1.1.0\tv1.1.0\tdef5678\t2026-04-01T10:00:00+00:00",
          ""
        ].join("\n"),
        stderr: ""
      }
    ]);
    const service = new GitService({
      ensureClient: async () => client.asCodexClient()
    });

    const tags = await service.tags("/workspace/project", "source-1");

    expect(tags).toEqual([
      {
        name: "v1.2.0",
        fullName: "refs/tags/v1.2.0",
        targetHash: "abc1234",
        createdAt: "2026-05-01T10:00:00+00:00"
      },
      {
        name: "v1.1.0",
        fullName: "refs/tags/v1.1.0",
        targetHash: "def5678",
        createdAt: "2026-04-01T10:00:00+00:00"
      }
    ]);
    expect(client.commands).toEqual([
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname:short)%09%(creatordate:iso-strict)",
        "refs/tags"
      ]
    ]);
  });

  it("should create lightweight tags and refresh the tag list", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      {
        exitCode: 0,
        stdout: "refs/tags/v1.2.1\tv1.2.1\tabc1234\t2026-05-02T10:00:00+00:00\n",
        stderr: ""
      }
    ]);
    const service = new GitService({
      ensureClient: async () => client.asCodexClient()
    });

    const tags = await service.createTag("/workspace/project", "source-1", "v1.2.1");

    expect(tags[0]?.name).toBe("v1.2.1");
    expect(client.commands).toEqual([
      ["git", "check-ref-format", "refs/tags/v1.2.1"],
      ["git", "tag", "v1.2.1"],
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname:short)%09%(creatordate:iso-strict)",
        "refs/tags"
      ]
    ]);
  });

  it("should count commits since a tag", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "7\n", stderr: "" }
    ]);
    const service = new GitService({
      ensureClient: async () => client.asCodexClient()
    });

    const count = await service.commitsSinceTag("/workspace/project", "source-1", "v1.2.0");

    expect(count).toBe(7);
    expect(client.commands).toEqual([
      ["git", "rev-list", "--count", "v1.2.0..HEAD"]
    ]);
  });
});

class FakeCodexClient {
  readonly commands: string[][] = [];
  private readonly listeners = new Set<FakeNotificationListener>();

  constructor(private readonly responses: FakeProcessResponse[]) {}

  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  onNotification(listener: FakeNotificationListener): { dispose(): void } {
    this.listeners.add(listener);

    return {
      dispose: () => {
        this.listeners.delete(listener);
      }
    };
  }

  async request<TResponse>(
    method: string,
    params: v2.ProcessSpawnParams
  ): Promise<TResponse> {
    expect(method).toBe("process/spawn");
    this.commands.push([...params.command]);
    const response = this.responses.shift();

    if (response === undefined) {
      throw new Error("No fake Git response configured.");
    }

    queueMicrotask(() => {
      const notification = {
        method: "process/exited",
        params: {
          processHandle: params.processHandle,
          exitCode: response.exitCode,
          stdout: response.stdout,
          stdoutCapReached: false,
          stderr: response.stderr,
          stderrCapReached: false
        }
      };

      for (const listener of this.listeners) {
        listener(notification);
      }
    });

    return {} as TResponse;
  }
}
