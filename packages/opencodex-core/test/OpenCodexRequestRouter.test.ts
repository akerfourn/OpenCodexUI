import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import type { OpenCodexBackendRuntime } from "../src/OpenCodexBackendRuntime";
import { OpenCodexRequestRouter } from "../src/OpenCodexRequestRouter";

describe("OpenCodexRequestRouter workspace routes", () => {
  it("should route creation and recovery without deriving source paths", async () => {
    const workspaces = { discover: vi.fn(), create: vi.fn(), pendingCreations: vi.fn(), reconcileCreation: vi.fn() };
    const runtime = { workspaces } as unknown as OpenCodexBackendRuntime;
    const router = new OpenCodexRequestRouter(runtime);
    const input = { projectId: "project", sourceId: "source", destinationPath: "/new",
      start: { mode: "detached" as const, startPoint: "HEAD" } };
    await router.handleRequest({ type: "projectWorkspaces.discover", projectId: "project", sourceId: "source" });
    await router.handleRequest({ type: "projectWorkspaces.create", input });
    await router.handleRequest({ type: "projectWorkspaces.creations.list", projectId: "project" });
    await router.handleRequest({ type: "projectWorkspaces.creations.reconcile", creationId: "creation" });
    expect(workspaces.discover).toHaveBeenCalledWith("project", "source");
    expect(workspaces.create).toHaveBeenCalledWith(input);
    expect(workspaces.pendingCreations).toHaveBeenCalledWith("project");
    expect(workspaces.reconcileCreation).toHaveBeenCalledWith("creation");
  });

  it("should forward workspace identities and explicit recovery without deriving a path", async () => {
    const workspaces = { rename: vi.fn(), list: vi.fn(), select: vi.fn(), reconcile: vi.fn() };
    const startTurn = vi.fn();
    const runtime = { workspaces, threads: { startTurn } } as unknown as OpenCodexBackendRuntime;
    const router = new OpenCodexRequestRouter(runtime);

    await router.handleRequest({ type: "projectWorkspaces.rename", projectId: "project-a", workspaceId: "workspace-a", name: "Feature" });
    await router.handleRequest({ type: "projectWorkspaces.list", projectId: "project-a" });
    await router.handleRequest({ type: "threads.workspace.select", threadId: "thread-a", workspaceId: "workspace-a" });
    await router.handleRequest({ type: "threads.workspace.reconcile", threadId: "thread-a" });
    await router.handleRequest({ type: "turn.start", threadId: null, workspaceId: "workspace-a", text: "start" });

    expect(workspaces.rename).toHaveBeenCalledWith("project-a", "workspace-a", "Feature");
    expect(workspaces.list).toHaveBeenCalledWith("project-a");
    expect(workspaces.select).toHaveBeenCalledWith("thread-a", "workspace-a");
    expect(workspaces.reconcile).toHaveBeenCalledWith("thread-a");
    expect(startTurn).toHaveBeenCalledWith(null, null, null, "start", [], [], null, null, null, "workspace-a");
  });
});

describe("OpenCodexRequestRouter Docker Compose routes", () => {
  it("should forward every Compose request with explicit source and project scope", async () => {
    const dockerCompose = {
      readSnapshot: vi.fn(async () => ({ services: [] })),
      up: vi.fn(async () => ({ ok: true as const })),
      stop: vi.fn(async () => ({ ok: true as const })),
      restart: vi.fn(async () => ({ ok: true as const })),
      readLogs: vi.fn(async () => ({
        serviceName: "web",
        stdout: "",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false
      }))
    };
    const runtime = {
      dockerCompose,
      handleRequestError: vi.fn()
    } as unknown as OpenCodexBackendRuntime;
    const router = new OpenCodexRequestRouter(runtime);

    const requests: OpenCodexRequest[] = [
      {
        type: "docker.compose.snapshot.read",
        projectPath: "/workspace/app",
        sourceId: "source-1"
      },
      {
        type: "docker.compose.service.up",
        projectPath: "/workspace/app",
        sourceId: "source-1",
        serviceName: "web"
      },
      {
        type: "docker.compose.service.stop",
        projectPath: "/workspace/app",
        sourceId: "source-1",
        serviceName: "web"
      },
      {
        type: "docker.compose.service.restart",
        projectPath: "/workspace/app",
        sourceId: "source-1",
        serviceName: "web"
      },
      {
        type: "docker.compose.service.logs.read",
        projectPath: "/workspace/app",
        sourceId: "source-1",
        serviceName: "web",
        tail: 50
      }
    ];

    for (const request of requests) {
      await router.handleRequest(request);
    }

    expect(dockerCompose.readSnapshot).toHaveBeenCalledWith("/workspace/app", "source-1");
    expect(dockerCompose.up).toHaveBeenCalledWith("/workspace/app", "source-1", "web");
    expect(dockerCompose.stop).toHaveBeenCalledWith("/workspace/app", "source-1", "web");
    expect(dockerCompose.restart).toHaveBeenCalledWith("/workspace/app", "source-1", "web");
    expect(dockerCompose.readLogs).toHaveBeenCalledWith(
      "/workspace/app",
      "source-1",
      "web",
      50
    );
  });
});

describe("OpenCodexRequestRouter plugin routes", () => {
  it("should keep plugin discovery bounded and source-aware", async () => {
    const plugins = {
      installed: vi.fn(async () => ({ plugins: [] })),
      search: vi.fn(async () => ({ plugins: [], nextCursor: null })),
      refresh: vi.fn(async () => ({ ok: true as const, loadErrors: [] }))
    };
    const runtime = {
      plugins,
      handleRequestError: vi.fn()
    } as unknown as OpenCodexBackendRuntime;
    const router = new OpenCodexRequestRouter(runtime);

    await router.handleRequest({ type: "plugins.installed", sourceId: "source-a" });
    await router.handleRequest({
      type: "plugins.search",
      sourceId: "source-a",
      searchTerm: "github",
      cursor: "cursor-a",
      limit: 25
    });
    await router.handleRequest({ type: "plugins.refresh", sourceId: "source-a" });

    expect(plugins.installed).toHaveBeenCalledWith("source-a");
    expect(plugins.search).toHaveBeenCalledWith("source-a", "github", "cursor-a", 25);
    expect(plugins.refresh).toHaveBeenCalledWith("source-a");
  });
});

describe("OpenCodexRequestRouter Git routes", () => {
  it("should forward the workspace identity for commits", async () => {
    const commit = vi.fn(async () => ({ hash: "commit-1" }));
    const resolveToolRequest = vi.fn(async (request: OpenCodexRequest) => request);
    const runtime = {
      git: { commit },
      resolveToolRequest,
      handleRequestError: vi.fn()
    } as unknown as OpenCodexBackendRuntime;
    const router = new OpenCodexRequestRouter(runtime);

    await router.handleRequest({
      type: "git.commit",
      projectPath: "/workspace/project-feature",
      sourceId: "source-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      message: "release changes"
    });

    expect(commit).toHaveBeenCalledWith(
      "/workspace/project-feature",
      "source-1",
      "release changes",
      "project-1",
      "workspace-1"
    );
  });

  it("should route merge-to with an explicit target branch", async () => {
    const mergeBranchTo = vi.fn(async () => ({ branchName: "main" }));
    const runtime = {
      git: { mergeBranchTo },
      handleRequestError: vi.fn()
    } as unknown as OpenCodexBackendRuntime;
    const router = new OpenCodexRequestRouter(runtime);

    await router.handleRequest({
      type: "git.merge.to",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      targetBranchName: "main"
    });

    expect(mergeBranchTo).toHaveBeenCalledWith("/workspace/project", "source-1", "main");
  });

  it("should forward an explicit dirty-worktree confirmation for merge-to", async () => {
    const mergeBranchTo = vi.fn(async () => ({ branchName: "main" }));
    const runtime = {
      git: { mergeBranchTo },
      handleRequestError: vi.fn()
    } as unknown as OpenCodexBackendRuntime;
    const router = new OpenCodexRequestRouter(runtime);

    await router.handleRequest({
      type: "git.merge.to",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      targetBranchName: "main",
      allowDirtyWorktree: true
    });

    expect(mergeBranchTo).toHaveBeenCalledWith(
      "/workspace/project",
      "source-1",
      "main",
      true
    );
  });
});

describe("OpenCodexRequestRouter project goal routes", () => {
  it("should forward catalogue operations without deriving a chat scope", async () => {
    const goals = {
      list: vi.fn(async () => []),
      create: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      updateExecution: vi.fn(async () => undefined),
      archive: vi.fn(async () => undefined),
      unarchive: vi.fn(async () => undefined),
      delete: vi.fn(async () => ({ ok: true as const }))
    };
    const runtime = { goals } as unknown as OpenCodexBackendRuntime;
    const router = new OpenCodexRequestRouter(runtime);

    await router.handleRequest({
      type: "projectGoals.list",
      projectId: "project-1",
      includeArchived: true
    });
    await router.handleRequest({
      type: "projectGoals.create",
      projectId: "project-1",
      name: "Release",
      objective: "Prepare the release.",
      tokenBudget: 10_000
    });
    await router.handleRequest({
      type: "projectGoals.update",
      goalId: "goal-1",
      patch: { name: "Release v2" }
    });
    await router.handleRequest({
      type: "projectGoals.execution.update",
      goalId: "goal-1",
      patch: {
        status: "active",
        sourceId: "source-1",
        threadId: "thread-1"
      }
    });
    await router.handleRequest({ type: "projectGoals.archive", goalId: "goal-1" });
    await router.handleRequest({ type: "projectGoals.unarchive", goalId: "goal-1" });
    await router.handleRequest({ type: "projectGoals.delete", goalId: "goal-1" });

    expect(goals.list).toHaveBeenCalledWith("project-1", true);
    expect(goals.create).toHaveBeenCalledWith(
      "project-1",
      "Release",
      "Prepare the release.",
      10_000
    );
    expect(goals.update).toHaveBeenCalledWith("goal-1", { name: "Release v2" });
    expect(goals.updateExecution).toHaveBeenCalledWith("goal-1", {
      status: "active",
      sourceId: "source-1",
      threadId: "thread-1"
    });
    expect(goals.archive).toHaveBeenCalledWith("goal-1");
    expect(goals.unarchive).toHaveBeenCalledWith("goal-1");
    expect(goals.delete).toHaveBeenCalledWith("goal-1");
  });
});
