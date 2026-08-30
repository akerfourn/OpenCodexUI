import { describe, expect, it } from "vitest";

import type {
  DockerCommandExecutor,
  DockerCommandHandle,
  DockerCommandObserver,
  DockerCommandRequest,
  DockerCommandResult
} from "../src/command.js";
import { DockerClient } from "../src/DockerClient.js";
import { DockerCommandError } from "../src/errors.js";

describe("DockerClient", () => {
  it("should list and control global containers through structured arguments", async () => {
    const executor = new FakeDockerCommandExecutor([
      successfulResult(`${JSON.stringify({
        ID: "container-1",
        Names: "web",
        Image: "nginx:latest",
        Command: "nginx",
        State: "running",
        Status: "Up 1 minute",
        Ports: "127.0.0.1:8080->80/tcp",
        CreatedAt: "2026-08-30 12:00:00 +0200 CEST",
        RunningFor: "1 minute",
        Labels: "com.docker.compose.project=sample"
      })}\n`),
      successfulResult(),
      successfulResult(),
      successfulResult()
    ]);
    const client = new DockerClient({ executor });

    const containers = await client.containers.list();
    await client.containers.start("container-1");
    await client.containers.stop("container-1");
    await client.containers.restart("container-1");

    expect(containers).toEqual([expect.objectContaining({
      id: "container-1",
      name: "web",
      state: "running"
    })]);
    expect(executor.requests.map((request) => request.args)).toEqual([
      ["container", "ls", "--all", "--no-trunc", "--format", "json"],
      ["container", "start", "container-1"],
      ["container", "stop", "container-1"],
      ["container", "restart", "container-1"]
    ]);
  });

  it("should report Docker availability without throwing", async () => {
    const executor = new FakeDockerCommandExecutor([
      successfulResult(JSON.stringify({
        clientVersion: "29.0.0",
        serverVersion: "29.0.0",
        serverApiVersion: "1.52"
      })),
      failedResult("Cannot connect to the Docker daemon")
    ]);
    const client = new DockerClient({ executor, command: "docker.exe" });

    await expect(client.system.availability()).resolves.toEqual({
      available: true,
      version: {
        clientVersion: "29.0.0",
        serverVersion: "29.0.0",
        serverApiVersion: "1.52"
      }
    });
    await expect(client.system.availability()).resolves.toEqual({
      available: false,
      message: expect.stringContaining("Cannot connect to the Docker daemon")
    });
    expect(executor.requests[0]?.command).toBe("docker.exe");
  });

  it("should expose non-zero commands as typed failures", async () => {
    const executor = new FakeDockerCommandExecutor([failedResult("container is paused")]);
    const client = new DockerClient({ executor });

    await expect(client.containers.restart("container-1")).rejects.toBeInstanceOf(
      DockerCommandError
    );
  });

  it("should reject positional values that could be interpreted as CLI options", async () => {
    const client = new DockerClient({ executor: new FakeDockerCommandExecutor([]) });

    await expect(client.containers.start("--help")).rejects.toThrow("must not start");
  });

  it("should build bounded and following container log commands", async () => {
    const executor = new FakeDockerCommandExecutor([
      successfulResult("line one\n", "warning\n"),
      successfulResult("line two\n")
    ]);
    const client = new DockerClient({ executor });
    const stdout: string[] = [];

    await expect(client.containers.logs("container-1", {
      tail: 20,
      since: "10m",
      timestamps: true
    })).resolves.toEqual({ stdout: "line one\n", stderr: "warning\n" });
    const handle = client.containers.followLogs(
      "container-1",
      { tail: "all" },
      { onStdout: (chunk) => stdout.push(chunk) }
    );
    await handle.completion;

    expect(stdout).toEqual(["line two\n"]);
    expect(executor.requests.map((request) => request.args)).toEqual([
      [
        "container", "logs", "--tail", "20", "--since", "10m",
        "--timestamps", "container-1"
      ],
      ["container", "logs", "--tail", "all", "--follow", "container-1"]
    ]);
    expect(executor.requests[1]?.timeoutMs).toBeUndefined();
  });

  it("should treat an explicitly stopped log follower as cancellation", async () => {
    const executor = new FakeDockerCommandExecutor([{
      ...successfulResult(),
      exitCode: null,
      signal: "SIGTERM"
    }]);
    const client = new DockerClient({ executor });

    const handle = client.containers.followLogs("container-1");
    handle.stop();

    await expect(handle.completion).resolves.toEqual(expect.objectContaining({
      exitCode: null,
      signal: "SIGTERM"
    }));
  });
});

/** Predictable executor that records requests and returns queued results. */
class FakeDockerCommandExecutor implements DockerCommandExecutor {
  /** Requests observed in execution order. */
  readonly requests: DockerCommandRequest[] = [];

  /** Creates an executor with deterministic command results. */
  constructor(private readonly results: DockerCommandResult[]) {}

  /** Returns the next queued bounded-command result. */
  async run(request: DockerCommandRequest): Promise<DockerCommandResult> {
    this.requests.push(request);
    return this.nextResult();
  }

  /** Emits the next result as one streaming fragment per populated channel. */
  stream(
    request: DockerCommandRequest,
    observer: DockerCommandObserver = {}
  ): DockerCommandHandle {
    this.requests.push(request);
    const result = this.nextResult();
    observer.onStdout?.(result.stdout);
    observer.onStderr?.(result.stderr);

    return {
      completion: Promise.resolve(result),
      stop: () => undefined
    };
  }

  /** Removes the next queued result or fails the test setup. */
  private nextResult(): DockerCommandResult {
    const result = this.results.shift();

    if (result === undefined) {
      throw new Error("No fake Docker result remains.");
    }

    return result;
  }
}

/** Creates a successful deterministic command result. */
function successfulResult(stdout = "", stderr = ""): DockerCommandResult {
  return {
    exitCode: 0,
    signal: null,
    stdout,
    stderr,
    stdoutTruncated: false,
    stderrTruncated: false
  };
}

/** Creates a failed deterministic command result. */
function failedResult(stderr: string): DockerCommandResult {
  return {
    ...successfulResult("", stderr),
    exitCode: 1
  };
}
