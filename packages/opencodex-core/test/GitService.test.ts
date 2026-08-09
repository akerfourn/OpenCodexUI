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
      clients: { ensureClient: async () => client.asCodexClient() }
    });

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
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

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
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

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
      clients: { ensureClient: async () => client.asCodexClient() }
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
      { exitCode: 0, stdout: "# branch.head feature/api\0", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
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
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

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
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

    const status = await service.mergeBranch("/workspace/project", "source-1", "feature/api");

    expect(status.branchName).toBe("main");
    expect(client.commands).toEqual([
      ["git", "merge", "feature/api"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
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
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

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

  it("should list configured remotes with fetch and push URLs", async () => {
    const client = new FakeCodexClient([
      {
        exitCode: 0,
        stdout: [
          "origin\tgit@example.com:owner/repo.git (fetch)",
          "origin\tgit@example.com:owner/repo.git (push)",
          "backup\tssh://backup.example.com/repo.git (fetch)",
          ""
        ].join("\n"),
        stderr: ""
      }
    ]);
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

    const remotes = await service.remotes("/workspace/project", "source-1");

    expect(remotes).toEqual([
      {
        name: "backup",
        fetchUrl: "ssh://backup.example.com/repo.git",
        pushUrl: null
      },
      {
        name: "origin",
        fetchUrl: "git@example.com:owner/repo.git",
        pushUrl: "git@example.com:owner/repo.git"
      }
    ]);
    expect(client.commands).toEqual([
      ["git", "remote", "-v"]
    ]);
  });

  it("should add missing remotes before refreshing status", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "true\n", stderr: "" },
      { exitCode: 0, stdout: "# branch.head main\0", stderr: "" },
      { exitCode: 0, stdout: "origin\tgit@example.com:owner/repo.git (fetch)\n", stderr: "" }
    ]);
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

    const status = await service.upsertRemote(
      "/workspace/project",
      "source-1",
      "origin",
      "git@example.com:owner/repo.git"
    );

    expect(status.remotes).toEqual([
      {
        name: "origin",
        fetchUrl: "git@example.com:owner/repo.git",
        pushUrl: null
      }
    ]);
    expect(client.commands).toEqual([
      ["git", "remote", "-v"],
      ["git", "remote", "add", "origin", "git@example.com:owner/repo.git"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
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
      },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

    const tags = await service.tags("/workspace/project", "source-1");

    expect(tags).toEqual({
      tags: [
        {
          name: "v1.2.0",
          fullName: "refs/tags/v1.2.0",
          targetHash: "abc1234",
          createdAt: "2026-05-01T10:00:00+00:00",
          remoteTargetHash: null,
          syncStatus: "unknown"
        },
        {
          name: "v1.1.0",
          fullName: "refs/tags/v1.1.0",
          targetHash: "def5678",
          createdAt: "2026-04-01T10:00:00+00:00",
          remoteTargetHash: null,
          syncStatus: "unknown"
        }
      ],
      remoteName: null,
      remoteError: null
    });
    expect(client.commands).toEqual([
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
        "refs/tags"
      ],
      ["git", "remote"]
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
      },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

    const tags = await service.createTag("/workspace/project", "source-1", "v1.2.1");

    expect(tags.tags[0]?.name).toBe("v1.2.1");
    expect(client.commands).toEqual([
      ["git", "check-ref-format", "refs/tags/v1.2.1"],
      ["git", "tag", "v1.2.1"],
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
        "refs/tags"
      ],
      ["git", "remote"]
    ]);
  });

  it("should classify local tags against the configured remote", async () => {
    const syncedHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const divergedLocalHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const divergedRemoteHash = "cccccccccccccccccccccccccccccccccccccccc";
    const localOnlyHash = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const client = new FakeCodexClient([
      {
        exitCode: 0,
        stdout: [
          `refs/tags/v1.3.0\tv1.3.0\t${syncedHash}\t2026-05-03T10:00:00+00:00`,
          `refs/tags/v1.2.0\tv1.2.0\t${divergedLocalHash}\t2026-05-02T10:00:00+00:00`,
          `refs/tags/v1.1.0\tv1.1.0\t${localOnlyHash}\t2026-05-01T10:00:00+00:00`,
          ""
        ].join("\n"),
        stderr: ""
      },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      {
        exitCode: 0,
        stdout: [
          `${syncedHash}\trefs/tags/v1.3.0`,
          `${divergedRemoteHash}\trefs/tags/v1.2.0`,
          ""
        ].join("\n"),
        stderr: ""
      }
    ]);
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

    const result = await service.tags("/workspace/project", "source-1");

    expect(result.remoteName).toBe("origin");
    expect(result.remoteError).toBeNull();
    expect(result.tags).toEqual([
      expect.objectContaining({
        name: "v1.3.0",
        targetHash: syncedHash,
        remoteTargetHash: syncedHash,
        syncStatus: "synced"
      }),
      expect.objectContaining({
        name: "v1.2.0",
        targetHash: divergedLocalHash,
        remoteTargetHash: divergedRemoteHash,
        syncStatus: "diverged"
      }),
      expect.objectContaining({
        name: "v1.1.0",
        targetHash: localOnlyHash,
        remoteTargetHash: null,
        syncStatus: "local-only"
      })
    ]);
    expect(client.commands).toEqual([
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
        "refs/tags"
      ],
      ["git", "remote"],
      ["git", "ls-remote", "--tags", "--refs", "origin"]
    ]);
  });

  it("should push one tag without force and refresh synchronization state", async () => {
    const tagHash = "dddddddddddddddddddddddddddddddddddddddd";
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: "Everything up-to-date\n", stderr: "" },
      {
        exitCode: 0,
        stdout: `refs/tags/v1.4.0\tv1.4.0\t${tagHash}\t2026-05-04T10:00:00+00:00\n`,
        stderr: ""
      },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: `${tagHash}\trefs/tags/v1.4.0\n`, stderr: "" }
    ]);
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

    const result = await service.pushTag("/workspace/project", "source-1", "v1.4.0", false);

    expect(result.tags[0]).toEqual(expect.objectContaining({
      name: "v1.4.0",
      syncStatus: "synced",
      remoteTargetHash: tagHash
    }));
    expect(client.commands).toEqual([
      ["git", "check-ref-format", "refs/tags/v1.4.0"],
      ["git", "remote"],
      ["git", "push", "origin", "refs/tags/v1.4.0"],
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
        "refs/tags"
      ],
      ["git", "remote"],
      ["git", "ls-remote", "--tags", "--refs", "origin"]
    ]);
  });

  it("should use a forced tag refspec only for explicit force pushes", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: "forced\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

    await service.pushTag("/workspace/project", "source-1", "v1.4.1", true);

    expect(client.commands).toEqual([
      ["git", "check-ref-format", "refs/tags/v1.4.1"],
      ["git", "remote"],
      ["git", "push", "--force", "origin", "refs/tags/v1.4.1"],
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
        "refs/tags"
      ],
      ["git", "remote"],
      ["git", "ls-remote", "--tags", "--refs", "origin"]
    ]);
  });

  it("should push all local tags without force", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: "pushed\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: "", stderr: "" }
    ]);
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

    await service.pushTags("/workspace/project", "source-1");

    expect(client.commands).toEqual([
      ["git", "remote"],
      ["git", "push", "origin", "--tags"],
      [
        "git",
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname)%09%(refname:short)%09%(objectname)%09%(creatordate:iso-strict)",
        "refs/tags"
      ],
      ["git", "remote"],
      ["git", "ls-remote", "--tags", "--refs", "origin"]
    ]);
  });

  it("should count commits since a tag", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "7\n", stderr: "" }
    ]);
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

    const count = await service.commitsSinceTag("/workspace/project", "source-1", "v1.2.0");

    expect(count).toBe(7);
    expect(client.commands).toEqual([
      ["git", "rev-list", "--count", "v1.2.0..HEAD"]
    ]);
  });

  it("should read a paginated Git log", async () => {
    const client = new FakeCodexClient([
      {
        exitCode: 0,
        stdout: [
          "\x1eabc123456789\tabc1234\tAdrien\ta@example.com\t2026-06-01T10:00:00+00:00\tfirst commit\tHEAD -> main, tag: v1.0.0",
          "\x1edef987654321\tdef9876\tAdrien\ta@example.com\t2026-06-01T09:00:00+00:00\tsecond commit\t"
        ].join(""),
        stderr: ""
      }
    ]);
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

    const page = await service.log("/workspace/project", "source-1", 1, 2);

    expect(page).toEqual({
      commits: [
        {
          hash: "abc123456789",
          shortHash: "abc1234",
          authorName: "Adrien",
          authorEmail: "a@example.com",
          authoredAt: "2026-06-01T10:00:00+00:00",
          subject: "first commit",
          refs: ["HEAD -> main", "tag: v1.0.0"]
        }
      ],
      hasMore: true
    });
    expect(client.commands).toEqual([
      [
        "git",
        "log",
        "--max-count=2",
        "--skip=2",
        "--date=iso-strict",
        "--format=%x1e%H%x09%h%x09%an%x09%ae%x09%aI%x09%s%x09%D"
      ]
    ]);
  });

  it("should read Git commit details without loading a diff", async () => {
    const client = new FakeCodexClient([
      {
        exitCode: 0,
        stdout: "feat(ui): add history modal\n\nShow recent commits in Git panel.\n",
        stderr: ""
      },
      {
        exitCode: 0,
        stdout: [
          "M\tpackages/opencodex-ui/src/components/projects/ProjectGitPanel.tsx",
          "R100\told/path.ts\tnew/path.ts",
          ""
        ].join("\n"),
        stderr: ""
      }
    ]);
    const service = new GitService({
      clients: { ensureClient: async () => client.asCodexClient() }
    });

    const details = await service.commitDetails("/workspace/project", "source-1", "abc1234");

    expect(details).toEqual({
      hash: "abc1234",
      message: "feat(ui): add history modal\n\nShow recent commits in Git panel.",
      files: [
        {
          status: "modified",
          path: "packages/opencodex-ui/src/components/projects/ProjectGitPanel.tsx",
          originalPath: null
        },
        {
          status: "renamed",
          path: "new/path.ts",
          originalPath: "old/path.ts"
        }
      ]
    });
    expect(client.commands).toEqual([
      ["git", "show", "-s", "--format=%B", "abc1234"],
      ["git", "show", "--format=", "--name-status", "abc1234"]
    ]);
  });
});

class FakeCodexClient {
  readonly commands: string[][] = [];
  readonly filesByPath = new Map<string, string>();
  readonly metadataByPath = new Map<string, v2.FsGetMetadataResponse>();
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
    params: v2.ProcessSpawnParams | v2.FsGetMetadataParams | v2.FsReadFileParams
  ): Promise<TResponse> {
    if (method === "fs/getMetadata") {
      return this.getMetadata(params as v2.FsGetMetadataParams) as TResponse;
    }

    if (method === "fs/readFile") {
      return this.readFile(params as v2.FsReadFileParams) as TResponse;
    }

    expect(method).toBe("process/spawn");
    const processParams = params as v2.ProcessSpawnParams;
    this.commands.push([...processParams.command]);
    const response = this.responses.shift();

    if (response === undefined) {
      throw new Error("No fake Git response configured.");
    }

    queueMicrotask(() => {
      const notification = {
        method: "process/exited",
        params: {
          processHandle: processParams.processHandle,
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

  private getMetadata(params: v2.FsGetMetadataParams): v2.FsGetMetadataResponse {
    const metadata = this.metadataByPath.get(params.path);

    if (metadata === undefined) {
      throw new Error(`No fake metadata configured for ${params.path}.`);
    }

    return metadata;
  }

  private readFile(params: v2.FsReadFileParams): v2.FsReadFileResponse {
    const content = this.filesByPath.get(params.path);

    if (content === undefined) {
      throw new Error(`No fake file configured for ${params.path}.`);
    }

    return {
      dataBase64: Buffer.from(content, "utf8").toString("base64")
    };
  }
}
