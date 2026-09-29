import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import { describe, expect, it } from "vitest";

import type { CodexNotification, Disposable } from "@open-codex-ui/codex-rpc";
import type { OpenCodexDockerComposeSnapshot } from "@open-codex-ui/opencodex-protocol";

import {
  aggregateComposeServiceState,
  DockerComposeService
} from "../src/backend/docker/DockerComposeService";
import type { SourceDockerProcessClient } from "../src/backend/docker/SourceDockerCommandExecutor";

describe("DockerComposeService", () => {
  it("should discover named variants and require a choice without invoking Docker", async () => {
    const client = new FakeSourceClient({ "docker-compose.yaml": true, "docker-compose.local.yaml": true,
      "docker-compose.prod.yml": true, "compose.debug.yaml": true, "other.yaml": true });
    const service = new DockerComposeService({ clients: { ensureClient: async () => client } });
    const snapshot = await service.readSnapshot("/workspace/app", "source-1");
    expect(snapshot).toMatchObject({ composeFile: null, selectionIssue: "required", services: [],
      composeFiles: ["compose.debug.yaml", "docker-compose.local.yaml", "docker-compose.prod.yml", "docker-compose.yaml"] });
    await expect(service.up("/workspace/app", "source-1", "mongo")).rejects.toThrow("Select a Docker Compose file");
    expect(client.spawnedCommands).toEqual([]);
  });

  it("should pin discovery, lifecycle operations and logs to the local configuration", async () => {
    const client = new FakeSourceClient({ "docker-compose.yaml": true, "docker-compose.local.yaml": true,
      configuredServices: ["mongo"] });
    const service = new DockerComposeService({ clients: { ensureClient: async () => client } });
    const file = "docker-compose.local.yaml";
    expect((await service.readSnapshot("/workspace/app", "source-1", undefined, file)).composeFile).toBe(file);
    await service.up("/workspace/app", "source-1", "mongo", undefined, file);
    await service.stop("/workspace/app", "source-1", "mongo", undefined, file);
    await service.restart("/workspace/app", "source-1", "mongo", undefined, file);
    await service.readLogs("/workspace/app", "source-1", "mongo", 10, undefined, file);
    expect(client.spawnedCommands).toHaveLength(6);
    for (const command of client.spawnedCommands) {
      expect(command.slice(0, 4)).toEqual(["docker", "compose", "--file", file]);
      expect(command).not.toContain("docker-compose.yaml");
    }
  });

  it("should never fall back when the chosen file disappears or contains a path", async () => {
    const client = new FakeSourceClient({ "docker-compose.yaml": true });
    const service = new DockerComposeService({ clients: { ensureClient: async () => client } });
    const file = "docker-compose.local.yaml";
    expect(await service.readSnapshot("/workspace/app", "source-1", undefined, file))
      .toMatchObject({ composeFile: null, composeFiles: ["docker-compose.yaml"], selectionIssue: "missing", services: [] });
    await expect(service.up("/workspace/app", "source-1", "mongo", undefined, file))
      .rejects.toThrow("no longer available");
    await expect(service.up("/workspace/app", "source-1", "mongo", undefined, "../docker-compose.yaml"))
      .rejects.toThrow("Select a Docker Compose file");
    expect(client.spawnedCommands).toEqual([]);
  });


  it("should isolate secondary stacks while retaining the primary Compose project name", async () => {
    const client = new FakeSourceClient({ "compose.yaml": true });
    const repository = { workspaces: { get: async (id: string) => ({
      id, projectId: "project", sourceId: "source-1", path: "/workspace/app",
      isPrimary: id === "primary", removedAt: null, managed: false
    }) } } as unknown as OpenCodexCacheRepository;
    const service = new DockerComposeService({ cacheRepository: repository,
      clients: { ensureClient: async () => client } });
    await service.up("/workspace/app", "source-1", "web", "primary", "compose.yaml");
    await service.up("/workspace/app", "source-1", "web", "secondary", "compose.yaml");
    await service.stop("/workspace/app", "source-1", "web", "secondary", "compose.yaml");
    expect(client.spawnedCommands[0]).not.toContain("--project-name");
    const secondary = client.spawnedCommands[1];
    const nameIndex = secondary.indexOf("--project-name") + 1;
    expect(secondary[nameIndex]).toMatch(/^opencodex-[a-f0-9]{24}$/u);
    expect(client.spawnedCommands[2][nameIndex]).toBe(secondary[nameIndex]);
  });

  it("should return an empty snapshot without spawning Docker when no Compose file exists", async () => {
    const client = new FakeSourceClient();
    const service = new DockerComposeService({
      clients: { ensureClient: async () => client }
    });

    const snapshot = await service.readSnapshot("/workspace/app", "source-1");
    expect(snapshot).toEqual({
      projectPath: "/workspace/app",
      sourceId: "source-1",
      composeFile: null,
      composeFiles: [],
      selectionIssue: null,
      errorMessage: null,
      services: []
    } satisfies OpenCodexDockerComposeSnapshot);
    expect(client.spawnedCommands).toEqual([]);
  });

  it("should inspect the source filesystem and map service containers safely", async () => {
    const sensitiveCommand = "node --token=fake-compose-secret";
    const client = new FakeSourceClient({
      "compose.yaml": true,
      services: [
        {
          ID: "web-1",
          Name: "app-web-1",
          Command: sensitiveCommand,
          Project: "app",
          Service: "web",
          State: "running",
          Health: "healthy",
          ExitCode: 0,
          Publishers: [{ URL: "127.0.0.1", TargetPort: 3000, PublishedPort: 3000, Protocol: "tcp" }]
        },
        {
          ID: "worker-1",
          Name: "app-worker-1",
          Command: "worker",
          Project: "app",
          Service: "worker",
          State: "exited",
          Health: "",
          ExitCode: 1,
          Publishers: []
        }
      ],
      configuredServices: ["web", "worker", "database"]
    });
    const service = new DockerComposeService({
      clients: { ensureClient: async () => client }
    });

    const snapshot = await service.readSnapshot("/workspace/app", "source-1");
    expect(snapshot).toEqual({
      projectPath: "/workspace/app",
      sourceId: "source-1",
      composeFile: "compose.yaml",
      composeFiles: ["compose.yaml"],
      selectionIssue: null,
      errorMessage: null,
      services: [
        {
          name: "web",
          state: "running",
          containers: [{
            name: "app-web-1",
            state: "running",
            health: "healthy",
            exitCode: 0,
            publishers: [{
              url: "127.0.0.1",
              targetPort: 3000,
              publishedPort: 3000,
              protocol: "tcp"
            }]
          }]
        },
        {
          name: "worker",
          state: "stopped",
          containers: [{
            name: "app-worker-1",
            state: "exited",
            health: "",
            exitCode: 1,
            publishers: []
          }]
        },
        { name: "database", state: "missing", containers: [] }
      ]
    });
    expect(client.directoryPaths).toEqual(["/workspace/app"]);
    expect(JSON.stringify(snapshot)).not.toContain(sensitiveCommand);
  });

  it("should detect Compose files in a Windows source path", async () => {
    const client = new FakeSourceClient({
      "docker-compose.yml": true
    });
    const service = new DockerComposeService({
      clients: { ensureClient: async () => client }
    });

    await expect(service.readSnapshot("C:\\workspace\\app", "source-1")).resolves.toMatchObject({
      projectPath: "C:\\workspace\\app",
      sourceId: "source-1",
      composeFile: "docker-compose.yml",
      errorMessage: null
    });
    expect(client.directoryPaths).toEqual(["C:\\workspace\\app"]);
    expect(client.spawnedCwds).toEqual([
      "C:\\workspace\\app",
      "C:\\workspace\\app"
    ]);
  });

  it("should route lifecycle and logs actions through the selected source", async () => {
    const client = new FakeSourceClient({ "compose.yml": true });
    const service = new DockerComposeService({
      clients: { ensureClient: async () => client }
    });

    await service.up("/workspace/app", "source-1", "web", undefined, "compose.yml");
    await service.stop("/workspace/app", "source-1", "web", undefined, "compose.yml");
    await service.restart("/workspace/app", "source-1", "web", undefined, "compose.yml");
    await expect(service.readLogs("/workspace/app", "source-1", "web", 10, undefined, "compose.yml")).resolves.toMatchObject({
      serviceName: "web",
      stdout: "service logs"
    });

    expect(client.spawnedCommands.map((entry) => entry.slice(1))).toEqual([
      ["compose", "--file", "compose.yml", "up", "--detach", "web"],
      ["compose", "--file", "compose.yml", "stop", "web"],
      ["compose", "--file", "compose.yml", "restart", "web"],
      ["compose", "--file", "compose.yml", "logs", "--no-color", "--tail", "10", "web"]
    ]);
  });

  it("should map every aggregate service state to the finite protocol", () => {
    const container = (state: string, health = "") => ({
      id: "id",
      name: "name",
      command: "command",
      project: "project",
      service: "service",
      state,
      health,
      exitCode: 0,
      publishers: []
    });

    expect(aggregateComposeServiceState([])).toBe("missing");
    expect(aggregateComposeServiceState([container("running")])).toBe("running");
    expect(aggregateComposeServiceState([container("running", "unhealthy")])).toBe("unhealthy");
    expect(aggregateComposeServiceState([container("exited", "unhealthy")])).toBe("stopped");
    expect(aggregateComposeServiceState([container("running", "starting")])).toBe("partial");
    expect(aggregateComposeServiceState([container("running", "healthy"), container("exited")])).toBe("partial");
    expect(aggregateComposeServiceState([container("running"), container("exited")])).toBe("partial");
    expect(aggregateComposeServiceState([container("exited")])).toBe("stopped");
    expect(aggregateComposeServiceState([container("created"), container("dead")])).toBe("stopped");
    expect(aggregateComposeServiceState([container("paused")])).toBe("unknown");
    expect(aggregateComposeServiceState([container("paused"), container("exited")])).toBe("partial");
  });

  it("should redact Docker command output from snapshots and operation errors", async () => {
    const sensitiveToken = "compose-secret-token";
    const client = new FakeSourceClient({
      "compose.yaml": true,
      exitCode: 17,
      stderr: `failed with ${sensitiveToken}`
    });
    const service = new DockerComposeService({
      clients: { ensureClient: async () => client }
    });

    const snapshot = await service.readSnapshot("/workspace/app", "source-1");
    expect(snapshot.errorMessage).toBe("Docker Compose snapshot failed (exit code 17).");
    expect(JSON.stringify(snapshot)).not.toContain(sensitiveToken);

    const operationErrors = [
      () => service.up("/workspace/app", "source-1", "web", undefined, "compose.yaml"),
      () => service.stop("/workspace/app", "source-1", "web", undefined, "compose.yaml"),
      () => service.restart("/workspace/app", "source-1", "web", undefined, "compose.yaml"),
      () => service.readLogs("/workspace/app", "source-1", "web", undefined, undefined, "compose.yaml")
    ];

    for (const operation of operationErrors) {
      await expect(operation()).rejects.toMatchObject({
        message: expect.not.stringContaining(sensitiveToken)
      });
    }
  });

  it("should redact malformed Compose output without forwarding the raw response", async () => {
    const sensitiveToken = "compose-response-secret";
    const client = new FakeSourceClient({
      "compose.yaml": true,
      configuredServices: ["web"],
      psOutput: `not-json-${sensitiveToken}`
    });
    const service = new DockerComposeService({
      clients: { ensureClient: async () => client }
    });

    const snapshot = await service.readSnapshot("/workspace/app", "source-1");

    expect(snapshot.errorMessage).toBe("Docker Compose snapshot returned an invalid response.");
    expect(JSON.stringify(snapshot)).not.toContain(sensitiveToken);
  });
});

/** Minimal source client double that executes process/spawn notifications. */
class FakeSourceClient implements SourceDockerProcessClient {
  readonly directoryPaths: string[] = [];
  readonly spawnedCommands: string[][] = [];
  readonly spawnedCwds: string[] = [];
  private readonly listeners = new Set<(notification: CodexNotification) => void>();
  private readonly options: FakeSourceClientOptions;

  constructor(options: FakeSourceClientOptions = {}) {
    this.options = options;
  }

  onNotification(listener: (notification: CodexNotification) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (method === "fs/readDirectory") {
      this.directoryPaths.push((params as { path: string }).path);
      return { entries: Object.entries(this.options).filter(([, value]) => value === true)
        .map(([fileName]) => ({ fileName, isFile: true, isDirectory: false })) } as T;
    }
    if (method !== "process/spawn") {
      return {} as T;
    }

    const spawnParams = params as { command: string[]; processHandle: string };
    this.spawnedCommands.push(spawnParams.command);
    this.spawnedCwds.push(String((params as { cwd?: string }).cwd));
    const operation = spawnParams.command.find(arg => ["config", "ps", "up", "stop", "restart", "logs"].includes(arg));
    const stdout = operation === "logs"
      ? "service logs"
      : operation === "config"
        ? `${(this.options.configuredServices ?? []).join("\n")}\n`
        : operation === "ps"
          ? this.options.psOutput ?? (this.options.services ?? [])
            .map((entry) => JSON.stringify(entry))
            .join("\n")
          : "";
    queueMicrotask(() => {
      for (const listener of this.listeners) {
        listener({
          method: "process/exited",
          params: {
            processHandle: spawnParams.processHandle,
            exitCode: this.options.exitCode ?? 0,
            stdout,
            stdoutCapReached: false,
            stderr: this.options.stderr ?? "",
            stderrCapReached: false
          }
        });
      }
    });
    return {} as T;
  }
}

type FakeSourceClientOptions = {
  "docker-compose.local.yaml"?: boolean;
  "docker-compose.prod.yml"?: boolean;
  "compose.debug.yaml"?: boolean;
  "other.yaml"?: boolean;
  "compose.yaml"?: boolean;
  "compose.yml"?: boolean;
  "docker-compose.yaml"?: boolean;
  "docker-compose.yml"?: boolean;
  configuredServices?: string[];
  services?: Record<string, unknown>[];
  exitCode?: number;
  stderr?: string;
  psOutput?: string;
};
