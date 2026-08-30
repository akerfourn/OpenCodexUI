import { describe, expect, it } from "vitest";

import type { CodexNotification, Disposable } from "@open-codex-ui/codex-rpc";

import {
  SourceDockerCommandExecutor,
  type SourceDockerProcessClient
} from "../src/backend/docker/SourceDockerCommandExecutor";

describe("SourceDockerCommandExecutor", () => {
  it("should spawn a bounded process through the source client and collect its exit output", async () => {
    const client = new FakeSourceProcessClient();
    const executor = new SourceDockerCommandExecutor(client);
    const completion = executor.run({
      command: "docker",
      args: ["compose", "ps"],
      cwd: "/workspace/app",
      timeoutMs: 1_000,
      outputBytesCap: 10_000
    });

    await waitForSpawn(client);
    client.emit({
      method: "process/exited",
      params: {
        processHandle: client.processHandle,
        exitCode: 0,
        stdout: "service output",
        stdoutCapReached: false,
        stderr: "",
        stderrCapReached: false
      }
    });

    await expect(completion).resolves.toMatchObject({
      exitCode: 0,
      stdout: "service output",
      stderr: ""
    });
    expect(client.spawnParams).toEqual({
      command: ["docker", "compose", "ps"],
      processHandle: client.processHandle,
      cwd: "/workspace/app",
      streamStdoutStderr: false,
      outputBytesCap: 10_000,
      timeoutMs: 1_000
    });
  });

  it("should decode streamed output and stop timed-out processes", async () => {
    const client = new FakeSourceProcessClient();
    const executor = new SourceDockerCommandExecutor(client);
    const completion = executor.run({
      command: "docker",
      args: ["compose", "logs"],
      cwd: "/workspace/app",
      timeoutMs: 1
    });

    await waitForSpawn(client);
    client.emit({
      method: "process/outputDelta",
      params: {
        processHandle: client.processHandle,
        stream: "stdout",
        deltaBase64: Buffer.from("partial output").toString("base64"),
        capReached: true
      }
    });
    await expect(completion).rejects.toThrow("timed out");
    expect(client.killParams).toEqual({ processHandle: client.processHandle });
  });

  it("should explicitly reject unsupported streaming", () => {
    const executor = new SourceDockerCommandExecutor(new FakeSourceProcessClient());

    expect(() => executor.stream({ command: "docker", args: [] })).toThrow("not supported");
  });

  it("should translate Docker environment overrides to nullable app-server values", async () => {
    const client = new FakeSourceProcessClient();
    const executor = new SourceDockerCommandExecutor(client);
    const completion = executor.run({
      command: "docker",
      args: ["compose", "config"],
      cwd: "/workspace/app",
      env: { COMPOSE_PROJECT_NAME: "app", DOCKER_HOST: undefined }
    });

    await waitForSpawn(client);
    client.emit({
      method: "process/exited",
      params: {
        processHandle: client.processHandle,
        exitCode: 0,
        stdout: "",
        stdoutCapReached: false,
        stderr: "",
        stderrCapReached: false
      }
    });

    await expect(completion).resolves.toBeDefined();
    expect(client.spawnParams?.env).toEqual({
      COMPOSE_PROJECT_NAME: "app",
      DOCKER_HOST: null
    });
  });

  it("should reject an invalid output cap before spawning a source process", async () => {
    const client = new FakeSourceProcessClient();
    const executor = new SourceDockerCommandExecutor(client);

    await expect(executor.run({
      command: "docker",
      args: [],
      outputBytesCap: -1
    })).rejects.toThrow("outputBytesCap");
    expect(client.spawnParams).toBeNull();
  });
});

/** In-memory process client used to exercise process notifications. */
class FakeSourceProcessClient implements SourceDockerProcessClient {
  processHandle = "";
  spawnParams: Record<string, unknown> | null = null;
  killParams: Record<string, unknown> | null = null;
  private readonly listeners = new Set<(notification: CodexNotification) => void>();

  onNotification(listener: (notification: CodexNotification) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (method === "process/spawn") {
      this.spawnParams = params as Record<string, unknown>;
      this.processHandle = String(this.spawnParams.processHandle);
    } else if (method === "process/kill") {
      this.killParams = params as Record<string, unknown>;
    }

    return {} as T;
  }

  emit(notification: CodexNotification): void {
    for (const listener of this.listeners) {
      listener(notification);
    }
  }
}

/** Waits until process/spawn parameters have reached the fake client. */
async function waitForSpawn(client: FakeSourceProcessClient): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (client.spawnParams !== null) {
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Timed out waiting for process/spawn.");
}
