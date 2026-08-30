import { describe, expect, it } from "vitest";

import type {
  DockerCommandExecutor,
  DockerCommandHandle,
  DockerCommandObserver,
  DockerCommandRequest,
  DockerCommandResult
} from "../src/command.js";
import { DockerClient } from "../src/DockerClient.js";

describe("DockerComposeClient", () => {
  it("should merge configured services with their runtime containers", async () => {
    const executor = new QueueExecutor([
      result("web\ndatabase\n"),
      result(`${JSON.stringify({
        ID: "compose-web-1",
        Name: "sample-web-1",
        Command: "npm run dev",
        Project: "sample",
        Service: "web",
        State: "running",
        Health: "healthy",
        ExitCode: 0,
        Publishers: [{
          URL: "127.0.0.1",
          TargetPort: 3000,
          PublishedPort: 3000,
          Protocol: "tcp"
        }]
      })}\n`)
    ]);
    const compose = new DockerClient({ executor }).compose({
      projectPath: "/workspace/sample",
      files: ["compose.yaml", "compose.local.yaml"],
      projectName: "sample",
      profiles: ["development"]
    });

    const services = await compose.services.list();

    expect(services).toEqual([
      {
        name: "web",
        containers: [expect.objectContaining({
          id: "compose-web-1",
          state: "running",
          publishers: [{
            url: "127.0.0.1",
            targetPort: 3000,
            publishedPort: 3000,
            protocol: "tcp"
          }]
        })]
      },
      { name: "database", containers: [] }
    ]);
    expect(executor.requests).toEqual([
      expect.objectContaining({
        cwd: "/workspace/sample",
        args: [
          "compose", "--file", "compose.yaml", "--file", "compose.local.yaml",
          "--project-name", "sample", "--profile", "development",
          "config", "--services"
        ]
      }),
      expect.objectContaining({
        args: [
          "compose", "--file", "compose.yaml", "--file", "compose.local.yaml",
          "--project-name", "sample", "--profile", "development",
          "ps", "--all", "--no-trunc", "--format", "json"
        ]
      })
    ]);
  });

  it("should keep start and up semantics explicit", async () => {
    const executor = new QueueExecutor([result(), result(), result(), result()]);
    const services = new DockerClient({ executor })
      .compose({ projectPath: "/workspace/sample" })
      .services;

    await services.start(["web"], { wait: true, waitTimeoutSeconds: 15 });
    await services.up(["web"], { build: true, wait: true });
    await services.stop(["web"], { timeoutSeconds: 10 });
    await services.restart(["web"]);

    expect(executor.requests.map((request) => request.args)).toEqual([
      ["compose", "start", "--wait", "--wait-timeout", "15", "web"],
      ["compose", "up", "--detach", "--build", "--wait", "web"],
      ["compose", "stop", "--timeout", "10", "web"],
      ["compose", "restart", "web"]
    ]);
  });

  it("should reject a wait timeout when health waiting is disabled", async () => {
    const services = new DockerClient({ executor: new QueueExecutor([]) })
      .compose({ projectPath: "/workspace/sample" })
      .services;

    await expect(services.start([], { waitTimeoutSeconds: 5 })).rejects.toThrow(
      "waitTimeoutSeconds requires wait"
    );
  });
});

/** Minimal ordered executor for Compose command tests. */
class QueueExecutor implements DockerCommandExecutor {
  /** Requests observed in execution order. */
  readonly requests: DockerCommandRequest[] = [];

  /** Creates an executor with queued results. */
  constructor(private readonly results: DockerCommandResult[]) {}

  /** Returns one queued command result. */
  async run(request: DockerCommandRequest): Promise<DockerCommandResult> {
    this.requests.push(request);
    return this.take();
  }

  /** Implements the streaming contract for completeness. */
  stream(
    request: DockerCommandRequest,
    _observer?: DockerCommandObserver
  ): DockerCommandHandle {
    this.requests.push(request);
    return { completion: Promise.resolve(this.take()), stop: () => undefined };
  }

  /** Takes the next queued command result. */
  private take(): DockerCommandResult {
    const next = this.results.shift();

    if (next === undefined) {
      throw new Error("No queued result remains.");
    }

    return next;
  }
}

/** Creates a successful Compose command result. */
function result(stdout = ""): DockerCommandResult {
  return {
    exitCode: 0,
    signal: null,
    stdout,
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false
  };
}
