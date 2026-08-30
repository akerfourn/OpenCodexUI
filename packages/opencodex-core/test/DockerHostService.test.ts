import { describe, expect, it, vi } from "vitest";

import type {
  DockerAvailability,
  DockerContainerSummary,
  DockerLogOutput
} from "@open-codex-ui/docker-client";

import {
  DockerHostService,
  type DockerHostClientPort
} from "../src/backend/docker/DockerHostService.js";

describe("DockerHostService", () => {
  it("should return an unavailable snapshot without listing containers", async () => {
    const client = createClient({
      availability: { available: false, message: "Docker daemon is stopped." }
    });
    const service = new DockerHostService(client);

    await expect(service.readSnapshot()).resolves.toEqual({
      availability: { available: false, message: "Docker daemon is stopped." },
      containers: []
    });
    expect(client.containers.list).not.toHaveBeenCalled();
  });

  it("should map only display-safe container fields into the protocol", async () => {
    const client = createClient({ containers: [createContainer()] });
    const service = new DockerHostService(client);

    await expect(service.readSnapshot()).resolves.toEqual({
      availability: {
        available: true,
        clientVersion: "29.0.0",
        serverVersion: "29.0.0",
        serverApiVersion: "1.52"
      },
      containers: [{
        id: "container-1",
        name: "web",
        image: "nginx:latest",
        state: "running",
        status: "Up 1 minute",
        ports: "127.0.0.1:8080->80/tcp"
      }]
    });
  });

  it("should forward safe lifecycle operations to the typed client", async () => {
    const client = createClient();
    const service = new DockerHostService(client);

    await service.start("container-1");
    await service.stop("container-1");
    await service.restart("container-1");

    expect(client.containers.start).toHaveBeenCalledWith("container-1");
    expect(client.containers.stop).toHaveBeenCalledWith("container-1");
    expect(client.containers.restart).toHaveBeenCalledWith("container-1");
  });

  it("should bound log payloads and reject excessive tail requests", async () => {
    const client = createClient({
      logs: { stdout: `prefix${"x".repeat(250_000)}`, stderr: "warning" }
    });
    const service = new DockerHostService(client);

    const logs = await service.readLogs("container-1", 500);

    expect(logs.stdout).toHaveLength(250_000);
    expect(logs.stdout.startsWith("prefix")).toBe(false);
    expect(logs.stdoutTruncated).toBe(true);
    expect(logs.stderrTruncated).toBe(false);
    expect(client.containers.logs).toHaveBeenCalledWith("container-1", { tail: 500 });
    await expect(service.readLogs("container-1", 2_001)).rejects.toThrow("between 1 and 2000");
  });
});

interface ClientFixtureOptions {
  availability?: DockerAvailability;
  containers?: DockerContainerSummary[];
  logs?: DockerLogOutput;
}

/** Creates the minimal mocked low-level Docker client used by the service. */
function createClient(options: ClientFixtureOptions = {}): DockerHostClientPort {
  return {
    system: {
      availability: vi.fn(async () => options.availability ?? ({
        available: true,
        version: {
          clientVersion: "29.0.0",
          serverVersion: "29.0.0",
          serverApiVersion: "1.52"
        }
      }))
    },
    containers: {
      list: vi.fn(async () => options.containers ?? []),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      logs: vi.fn(async () => options.logs ?? { stdout: "", stderr: "" })
    }
  };
}

/** Creates one low-level container containing both displayed and private fields. */
function createContainer(): DockerContainerSummary {
  return {
    id: "container-1",
    name: "web",
    image: "nginx:latest",
    command: "nginx -g daemon off",
    state: "running",
    status: "Up 1 minute",
    ports: "127.0.0.1:8080->80/tcp",
    createdAt: "2026-08-30T18:00:00Z",
    runningFor: "1 minute",
    labels: "private=value"
  };
}
