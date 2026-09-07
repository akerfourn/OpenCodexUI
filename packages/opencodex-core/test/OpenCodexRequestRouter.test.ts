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
});
