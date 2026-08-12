/**
 * Covers GitService repository mutations and bounded staged-diff operations.
 */
import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import { describe, expect, it } from "vitest";

import { GitService } from "../src/backend/GitService";

type FakeProcessResponse = Pick<
  v2.ProcessExitedNotification,
  "exitCode" | "stdout" | "stderr"
> & {
  stdoutCapReached?: boolean;
  stderrCapReached?: boolean;
};

type FakeProcessRun = {
  command: string[];
  timeoutMs: number | undefined;
  outputBytesCap: number | undefined;
};

type FakeNotificationListener = (notification: {
  method: string;
  params: v2.ProcessExitedNotification;
}) => void;

describe("GitService repository mutations", () => {
  it("should fetch tags with the bounded timeout and refresh the tag listing", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "From origin\n", stderr: "" },
      {
        exitCode: 0,
        stdout: "refs/tags/v1.2.0\tv1.2.0\tabc1234\t2026-05-01T10:00:00+00:00\n",
        stderr: ""
      },
      { exitCode: 0, stdout: "origin\n", stderr: "" },
      { exitCode: 0, stdout: "abc1234\trefs/tags/v1.2.0\n", stderr: "" }
    ]);
    const service = createGitService(client);

    const result = await service.fetchTags("/workspace/project", "source-1");

    expect(result.warning).toBeNull();
    expect(result.tags).toEqual([
      expect.objectContaining({
        name: "v1.2.0",
        remoteTargetHash: "abc1234",
        syncStatus: "synced"
      })
    ]);
    expect(client.runs.map((run) => run.command)).toEqual([
      ["git", "fetch", "--tags", "--prune-tags"],
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
    expect(client.runs[0]).toMatchObject({
      timeoutMs: 120_000,
      outputBytesCap: 2_000_000
    });
    expect(client.runs[3]).toMatchObject({ timeoutMs: 120_000 });
  });

  it("should stage paths and refresh status afterward", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "", stderr: "" },
      ...refreshedStatusResponses()
    ]);
    const service = createGitService(client);

    const status = await service.stage(
      "/workspace/project",
      "source-1",
      ["src/index.ts", "README.md"]
    );

    expect(status.branchName).toBe("main");
    expect(client.runs.map((run) => run.command)).toEqual([
      ["git", "add", "--", "src/index.ts", "README.md"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
  });

  it("should unstage paths and refresh status afterward", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "", stderr: "" },
      ...refreshedStatusResponses()
    ]);
    const service = createGitService(client);

    const status = await service.unstage("/workspace/project", "source-1", ["src/index.ts"]);

    expect(status.branchName).toBe("main");
    expect(client.runs.map((run) => run.command)).toEqual([
      ["git", "restore", "--staged", "--", "src/index.ts"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
  });

  it("should commit staged files without refreshing status", async () => {
    const client = new FakeCodexClient([
      {
        exitCode: 0,
        stdout: "[main abc1234] feat: add repository actions\n",
        stderr: " 1 file changed, 1 insertion(+)\n"
      }
    ]);
    const service = createGitService(client);

    const result = await service.commit(
      "/workspace/project",
      "source-1",
      "  feat: add repository actions  "
    );

    expect(result).toEqual({
      ok: true,
      output: "[main abc1234] feat: add repository actions\n\n 1 file changed, 1 insertion(+)\n"
    });
    expect(client.runs).toEqual([
      {
        command: ["git", "commit", "-m", "feat: add repository actions"],
        timeoutMs: 30_000,
        outputBytesCap: 2_000_000
      }
    ]);
  });

  it("should push commits with the bounded timeout and refresh status", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "Everything up-to-date\n", stderr: "" },
      ...refreshedStatusResponses()
    ]);
    const service = createGitService(client);

    const status = await service.push("/workspace/project", "source-1");

    expect(status.branchName).toBe("main");
    expect(client.runs.map((run) => run.command)).toEqual([
      ["git", "push"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
    expect(client.runs[0]).toMatchObject({ timeoutMs: 120_000 });
  });

  it("should pull with fast-forward-only and refresh status", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "Already up to date.\n", stderr: "" },
      ...refreshedStatusResponses()
    ]);
    const service = createGitService(client);

    const status = await service.pull("/workspace/project", "source-1");

    expect(status.branchName).toBe("main");
    expect(client.runs.map((run) => run.command)).toEqual([
      ["git", "pull", "--ff-only"],
      ["git", "rev-parse", "--is-inside-work-tree"],
      ["git", "status", "--porcelain=v2", "-z", "--branch"],
      ["git", "remote", "-v"]
    ]);
    expect(client.runs[0]).toMatchObject({ timeoutMs: 120_000 });
  });

  it("should read staged summaries and a bounded diff in parallel", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: " file | 2 ++\n", stderr: "" },
      { exitCode: 0, stdout: "M\tsrc/index.ts\n", stderr: "" },
      {
        exitCode: 0,
        stdout: "diff --git a/src/index.ts b/src/index.ts\n+added line\n",
        stderr: "",
        stdoutCapReached: true
      }
    ]);
    const service = createGitService(client);

    const context = await service.readStagedCommitContext("/workspace/project", "source-1");

    expect(context).toEqual({
      stat: " file | 2 ++\n",
      nameStatus: "M\tsrc/index.ts\n",
      diff: "diff --git a/src/index.ts b/src/index.ts\n+added line\n",
      isDiffTruncated: true
    });
    expect(client.runs.map((run) => run.command)).toEqual([
      ["git", "diff", "--cached", "--stat"],
      ["git", "diff", "--cached", "--name-status"],
      ["git", "diff", "--cached"]
    ]);
    expect(client.runs[2]).toMatchObject({
      timeoutMs: 30_000,
      outputBytesCap: 220_000
    });
  });
});

/**
 * Creates the historical Git facade around one deterministic fake client.
 *
 * @param client Fake Codex client supplying process responses.
 * @returns Git service configured with the fake source client.
 */
function createGitService(client: FakeCodexClient): GitService {
  return new GitService({
    clients: { ensureClient: async () => client.asCodexClient() }
  });
}

/**
 * Creates the three process responses emitted by a refreshed repository status.
 *
 * @returns Repository check, porcelain status, and remote-list responses.
 */
function refreshedStatusResponses(): FakeProcessResponse[] {
  return [
    { exitCode: 0, stdout: "true\n", stderr: "" },
    { exitCode: 0, stdout: "# branch.head main\0", stderr: "" },
    { exitCode: 0, stdout: "", stderr: "" }
  ];
}

/**
 * Captures process requests and answers them with queued deterministic results.
 */
class FakeCodexClient {
  /** Process requests issued by the service. */
  readonly runs: FakeProcessRun[] = [];

  private readonly listeners = new Set<FakeNotificationListener>();

  /**
   * Creates a fake client.
   *
   * @param responses Process responses consumed in request order.
   */
  constructor(private readonly responses: FakeProcessResponse[]) {}

  /**
   * Exposes the fake as the typed Codex client expected by GitService.
   *
   * @returns Structural Codex client view.
   */
  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  /**
   * Registers one process-exit notification listener.
   *
   * @param listener Listener to call when a queued process exits.
   * @returns Disposable subscription.
   */
  onNotification(listener: FakeNotificationListener): { dispose(): void } {
    this.listeners.add(listener);

    return {
      dispose: () => {
        this.listeners.delete(listener);
      }
    };
  }

  /**
   * Handles process-spawn requests and emits their queued exit notification.
   *
   * @param method RPC method requested by GitService.
   * @param params RPC method parameters.
   * @returns Empty process-spawn response after scheduling the exit event.
   */
  async request<TResponse>(
    method: string,
    params: v2.ProcessSpawnParams
  ): Promise<TResponse> {
    expect(method).toBe("process/spawn");
    const processParams = params;
    this.runs.push({
      command: [...processParams.command],
      timeoutMs: processParams.timeoutMs,
      outputBytesCap: processParams.outputBytesCap
    });
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
          stdoutCapReached: response.stdoutCapReached === true,
          stderr: response.stderr,
          stderrCapReached: response.stderrCapReached === true
        }
      };

      for (const listener of this.listeners) {
        listener(notification);
      }
    });

    return {} as TResponse;
  }
}
