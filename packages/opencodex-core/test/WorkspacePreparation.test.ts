import { describe, expect, it, vi } from "vitest";
import type { CodexAppServerClient, CodexNotification } from "@open-codex-ui/codex-rpc";
import type { CachedSource, OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexWorkspacePreparationInput } from "@open-codex-ui/opencodex-protocol";
import { ProjectCommandService } from "../src/backend/projects/ProjectCommandService";

/** Keeps effects source-local and deterministic; no shell, dependency download or host file access. */
function fixture(windows = false) {
  const projectPath = windows ? "C:\\repos\\app" : "/repos/app";
  const workspacePath = windows ? "D:\\workspaces\\été" : "/workspaces/été";
  const command = { id: "command", projectId: "project", name: "Prepare", command: "echo prepared",
    executionMode: "workspace" as const, persistLogs: false, updatedAt: "2026-10-22T10:00:00Z",
    createdAt: "2026-10-22T10:00:00Z", sortOrder: 0 };
  const project = { id: "project", sourceId: "remote", path: projectPath,
    preferences: { workspacePreparation: { commandId: "command" as string | null } } };
  const workspace = { id: "workspace", projectId: "project", sourceId: "remote", path: workspacePath,
    isPrimary: false, managed: true, name: "Feature", removedAt: null as string | null,
    movePending: false, removalPending: false };
  const input: OpenCodexWorkspacePreparationInput = { projectId: project.id, sourceId: "remote",
    workspaceId: workspace.id, workspacePath, command: { ...command } };
  const cache = { getProjectCommand: vi.fn(async () => ({ ...command })),
    listProjects: vi.fn(async () => [project]), workspaces: { get: vi.fn(async () => ({ ...workspace })) } };
  const config = { config: { projects: { [projectPath]: { trust_level: "trusted" } } } };
  const request = vi.fn(async (method: string, _params: unknown): Promise<unknown> => {
    if (method === "config/read") return config;
    if (method === "command/exec") return { exitCode: 1, stdout: "", stderr: "" };
    return {};
  });
  const getMetadata = vi.fn(async (_path: string) => ({ isDirectory: true, isSymlink: false }));
  const ensureClient = vi.fn(async (_sourceId: string) => ({ request, getMetadata }) as unknown as CodexAppServerClient);
  const source = { id: "remote", kind: "ssh", settings: {} } as CachedSource;
  const emit = vi.fn();
  const service = new ProjectCommandService({ cacheRepository: cache as unknown as OpenCodexCacheRepository,
    clients: { ensureClient }, events: { emit }, resolveSource: async () => source });
  return { service, input, command, workspace, project, config, cache, request, ensureClient, getMetadata, emit };
}

describe("explicit workspace preparation", () => {
  it("should run only the reviewed script on its explicit remote source and protect lifecycle operations", async () => {
    const { service, input, request, ensureClient, emit } = fixture();
    expect(request).not.toHaveBeenCalled();
    const run = await service.prepareWorkspace(input);
    expect(ensureClient.mock.calls.every(call => call[0] === "remote")).toBe(true);
    expect(request).toHaveBeenCalledWith("process/spawn", expect.objectContaining({
      cwd: input.workspacePath, command: ["sh", "-lc", input.command.command], processHandle: run.processHandle
    }));
    const params = request.mock.calls.find(call => call[0] === "process/spawn")![1] as object;
    expect(params).not.toHaveProperty("env");
    expect(run).toMatchObject({ workspaceId: "workspace", sourceId: "remote", cwd: input.workspacePath });
    expect(() => service.requireWorkspaceIdle("workspace", "remote", input.workspacePath)).toThrow("Stop project commands");
    await service.stopRun(run.id);
    expect(request).toHaveBeenLastCalledWith("process/kill", { processHandle: run.processHandle });
    service.handleNotification({ method: "process/exited", params: { processHandle: run.processHandle, exitCode: 0 } } as CodexNotification);
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ type: "projectCommand.exited", status: "killed" }));
    expect(() => service.requireWorkspaceIdle("workspace", "remote", input.workspacePath)).not.toThrow();
  });

  it("should resolve Windows paths and PowerShell entirely in the owning source", async () => {
    const { service, input, request, getMetadata } = fixture(true);
    await service.prepareWorkspace(input);
    expect(request).toHaveBeenCalledWith("command/exec", expect.objectContaining({ cwd: input.workspacePath,
      command: ["where.exe", "/q", "$PATH:pwsh.exe"] }));
    expect(request).toHaveBeenCalledWith("process/spawn", expect.objectContaining({ cwd: input.workspacePath,
      command: expect.arrayContaining(["powershell.exe", "-EncodedCommand"]) }));
    expect(getMetadata).toHaveBeenCalledWith("D:\\");
  });

  it("should reject an untrusted project before any process or shell probe", async () => {
    const { service, input, config, request } = fixture();
    config.config.projects["/repos/app"]!.trust_level = "untrusted";
    await expect(service.prepareWorkspace(input)).rejects.toThrow("Trust the project");
    expect(request.mock.calls.map(call => call[0])).toEqual(["config/read"]);
  });

  it.each(["source", "path", "project", "move", "removal", "removed"])(
    "should reject a stale or unavailable workspace context (%s)", async scenario => {
      const { service, input, workspace, request } = fixture();
      if (scenario === "source") workspace.sourceId = "different";
      if (scenario === "path") workspace.path = "/elsewhere";
      if (scenario === "project") workspace.projectId = "different";
      if (scenario === "move") workspace.movePending = true;
      if (scenario === "removal") workspace.removalPending = true;
      if (scenario === "removed") workspace.removedAt = "2026-10-22";
      await expect(service.prepareWorkspace(input)).rejects.toThrow(/context changed|does not belong|pending|unavailable/u);
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("should reject symbolic-link ancestors without executing the script", async () => {
    const { service, input, getMetadata, request } = fixture();
    getMetadata.mockImplementation(async value => ({ isDirectory: true, isSymlink: value === "/workspaces" }));
    await expect(service.prepareWorkspace(input)).rejects.toThrow("literal directories");
    expect(request.mock.calls.map(call => call[0])).toEqual(["config/read"]);
  });

  it("should require another review after the script changes even if its timestamp is unchanged", async () => {
    const { service, input, command, request } = fixture();
    command.command = "echo different";
    await expect(service.prepareWorkspace(input)).rejects.toThrow("review its new contents");
    expect(request.mock.calls.some(call => call[0] === "process/spawn")).toBe(false);
  });

  it("should reject a disabled hook or a command from another project", async () => {
    const { service, input, project, command } = fixture();
    project.preferences.workspacePreparation.commandId = null;
    await expect(service.prepareWorkspace(input)).rejects.toThrow("configured preparation command changed");
    project.preferences.workspacePreparation.commandId = command.id;
    command.projectId = "another-project";
    await expect(service.prepareWorkspace(input)).rejects.toThrow("preparation command changed");
  });

  it("should refuse simultaneous preparations before process registration", async () => {
    const { service, input, request } = fixture();
    const results = await Promise.allSettled([service.prepareWorkspace(input), service.prepareWorkspace(input)]);
    expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(request.mock.calls.filter(call => call[0] === "process/spawn")).toHaveLength(1);
  });

  it("should mark a disconnected preparation as unknown without automatically replaying it", async () => {
    const { service, input, request, emit } = fixture();
    const run = await service.prepareWorkspace(input);
    service.handleClientClosed("remote");
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ type: "projectCommand.exited", runId: run.id,
      status: "failed", exitCode: null }));
    expect(request.mock.calls.filter(call => call[0] === "process/spawn")).toHaveLength(1);
  });

  it("should return the final status if the process exits before spawn acknowledgement", async () => {
    const { service, input, request } = fixture();
    request.mockImplementation(async (method, params) => {
      if (method === "config/read") return { config: { projects: { "/repos/app": { trust_level: "trusted" } } } };
      if (method === "process/spawn") {
        const { processHandle } = params as { processHandle: string };
        service.handleNotification({ method: "process/exited", params: { processHandle, exitCode: 2 } } as CodexNotification);
      }
      return {};
    });
    await expect(service.prepareWorkspace(input)).resolves.toMatchObject({ status: "failed", exitCode: 2 });
  });
});
