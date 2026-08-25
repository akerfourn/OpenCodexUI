import type {
  CodexAppServerClient,
  CodexNotification
} from "@open-codex-ui/codex-rpc";
import type {
  CachedProjectCommand,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import { describe, expect, it, vi } from "vitest";

import { ProjectCommandService } from "../src/backend/projects/ProjectCommandService";

describe("ProjectCommandService", () => {
  it("should preserve the run, output, and exit event sequence", async () => {
    const { service, request, emit } = createService();

    const run = await service.runCommand("command-1", "/workspace/project", "source-1");

    expect(request).toHaveBeenCalledWith("process/spawn", expect.objectContaining({
      command: ["sh", "-lc", "npm test"],
      processHandle: run.processHandle,
      cwd: "/workspace/project"
    }));
    expect(emit).toHaveBeenNthCalledWith(1, {
      type: "projectCommand.started",
      projectId: "project-1",
      run
    });

    service.handleNotification(createNotification("process/outputDelta", {
      processHandle: run.processHandle,
      stream: "stdout",
      deltaBase64: Buffer.from("done\n", "utf8").toString("base64"),
      capReached: false
    }));
    service.handleNotification(createNotification("process/exited", {
      processHandle: run.processHandle,
      exitCode: 2,
      stdout: "",
      stdoutCapReached: false,
      stderr: "",
      stderrCapReached: false
    }));

    expect(emit).toHaveBeenNthCalledWith(2, {
      type: "projectCommand.output",
      projectId: "project-1",
      commandId: "command-1",
      runId: run.id,
      stream: "stdout",
      delta: "done\n"
    });
    expect(emit).toHaveBeenNthCalledWith(3, expect.objectContaining({
      type: "projectCommand.exited",
      projectId: "project-1",
      commandId: "command-1",
      runId: run.id,
      status: "failed",
      exitCode: 2
    }));
  });

  it("should ignore malformed and unrelated process notifications", async () => {
    const { service, emit } = createService();
    const run = await service.runCommand("command-1", "/workspace/project", "source-1");
    emit.mockClear();

    service.handleNotification(createNotification("process/outputDelta", {
      processHandle: run.processHandle,
      stream: "invalid",
      deltaBase64: ""
    }));
    service.handleNotification(createNotification("process/exited", {
      processHandle: "unrelated-process",
      exitCode: 0
    }));

    expect(emit).not.toHaveBeenCalled();
  });

  it("should report a stopped run as killed when its exit arrives", async () => {
    const { service, request, emit } = createService();
    const run = await service.runCommand("command-1", "/workspace/project", "source-1");
    request.mockClear();
    emit.mockClear();

    await service.stopRun(run.id);

    expect(request).toHaveBeenCalledWith("process/kill", {
      processHandle: run.processHandle
    });

    service.handleNotification(createNotification("process/exited", {
      processHandle: run.processHandle,
      exitCode: 0
    }));

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "projectCommand.exited",
      runId: run.id,
      status: "killed",
      exitCode: 0
    }));
  });
});

/** Creates a service with deterministic cache, client, and event ports. */
function createService() {
  const command = createCommand();
  const repository = {
    getProjectCommand: vi.fn(async () => command)
  } as unknown as OpenCodexCacheRepository;
  const request = vi.fn(async () => ({}));
  const client = { request } as unknown as CodexAppServerClient;
  const emit = vi.fn();
  const service = new ProjectCommandService({
    cacheRepository: repository,
    events: { emit },
    clients: { ensureClient: vi.fn(async () => client) }
  });

  return { service, request, emit };
}

/** Creates the configured command executed by integration tests. */
function createCommand(): CachedProjectCommand {
  return {
    id: "command-1",
    projectId: "project-1",
    name: "Tests",
    command: "npm test",
    allowParallel: false,
    persistLogs: false,
    sortOrder: 0,
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: "2026-08-12T10:00:00.000Z"
  };
}

/** Creates a notification value for the narrow method under test. */
function createNotification(method: string, params: unknown): CodexNotification {
  return { method, params } as unknown as CodexNotification;
}
