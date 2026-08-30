import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import type { OpenCodexBackendRuntime } from "../src/OpenCodexBackendRuntime";
import { OpenCodexRequestRouter } from "../src/OpenCodexRequestRouter";

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
