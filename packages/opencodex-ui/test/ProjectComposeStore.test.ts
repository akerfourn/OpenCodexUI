import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexDockerComposeLogs,
  OpenCodexDockerComposeSnapshot,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "../src/stores/project/ProjectStore";
import { ProjectComposeStore } from "../src/stores/project/ProjectComposeStore";

describe("ProjectComposeStore", () => {
  it("should not query Compose for an orphan project", async () => {
    const request = vi.fn(async () => createSnapshot());
    const store = createStore(request, null);

    await store.load();

    expect(request).not.toHaveBeenCalled();
    expect(store.snapshot).toBeNull();
  });

  it("should wait for a ready source before querying Compose", async () => {
    const request = vi.fn(async () => createSnapshot());
    const store = createStore(request, "source-1", false);

    await store.load();
    await store.stop("web");
    await store.openLogs("web");

    expect(request).not.toHaveBeenCalled();
    expect(store.snapshot).toBeNull();
  });

  it("should invalidate stale state while unavailable and reload after reconnection", async () => {
    let isSourceReady = true;
    const snapshots = [createSnapshot("running"), createSnapshot("stopped")];
    const request = vi.fn(async () => snapshots.shift());
    const projectStore = {
      project: {
        path: "/workspace/project",
        sourceId: "source-1"
      },
      get isCodexSourceReady(): boolean {
        return isSourceReady;
      },
      projectPath: "/workspace/project"
    } as unknown as ProjectStore;
    const store = new ProjectComposeStore(projectStore, { request } as never);

    await store.load();
    expect(store.hasLoaded).toBe(true);
    expect(store.snapshot?.services[0]?.state).toBe("running");

    isSourceReady = false;
    store.invalidateIfUnavailable();
    expect(store.snapshot).toBeNull();
    expect(store.hasLoaded).toBe(false);

    isSourceReady = true;
    await store.load();
    expect(request).toHaveBeenCalledTimes(2);
    expect(store.snapshot?.services[0]?.state).toBe("stopped");
  });

  it("should load services and retain the selected service", async () => {
    const snapshot = createSnapshot();
    const request = vi.fn(async () => snapshot);
    const store = createStore(request);

    await store.load();
    store.selectService("web");

    expect(request).toHaveBeenCalledWith({
      type: "docker.compose.snapshot.read",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(store.services).toEqual(snapshot.services);
    expect(store.selectedService?.name).toBe("web");
    expect(store.hasComposeFile).toBe(true);
  });

  it("should refresh the snapshot after a service action", async () => {
    const refreshedSnapshot = createSnapshot("stopped");
    const request = vi.fn(async (value: OpenCodexRequest) => {
      if (value.type === "docker.compose.service.stop") {
        return { ok: true };
      }

      return refreshedSnapshot;
    });
    const store = createStore(request);

    await store.stop("web");

    expect(request.mock.calls.map(([value]) => value)).toEqual([
      {
        type: "docker.compose.service.stop",
        projectPath: "/workspace/project",
        sourceId: "source-1",
        serviceName: "web"
      },
      {
        type: "docker.compose.snapshot.read",
        projectPath: "/workspace/project",
        sourceId: "source-1"
      }
    ]);
    expect(store.snapshot).toEqual(refreshedSnapshot);
    expect(store.isServicePending("web")).toBe(false);
  });

  it("should keep a newer service action pending after an older action is reset", async () => {
    let actionCount = 0;
    let resolveFirstAction: ((value: unknown) => void) | undefined;
    let resolveSecondAction: ((value: unknown) => void) | undefined;
    const request = vi.fn((value: OpenCodexRequest) => {
      if (value.type === "docker.compose.service.stop") {
        actionCount += 1;
        return new Promise<unknown>((resolve) => {
          if (actionCount === 1) {
            resolveFirstAction = resolve;
          } else {
            resolveSecondAction = resolve;
          }
        });
      }

      return Promise.resolve(createSnapshot("stopped"));
    });
    const store = createStore(request);
    const firstAction = store.stop("web");

    store.reset();
    const secondAction = store.stop("web");

    resolveFirstAction?.({ ok: true });
    await firstAction;
    expect(store.isServicePending("web")).toBe(true);

    resolveSecondAction?.({ ok: true });
    await secondAction;
    expect(store.isServicePending("web")).toBe(false);
  });

  it("should load bounded logs for the selected service", async () => {
    const logs: OpenCodexDockerComposeLogs = {
      serviceName: "web",
      stdout: "ready\n",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false
    };
    const request = vi.fn(async () => logs);
    const store = createStore(request);

    await store.openLogs("web");

    expect(request).toHaveBeenCalledWith({
      type: "docker.compose.service.logs.read",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      serviceName: "web",
      tail: 200
    });
    expect(store.selectedLogs).toEqual(logs);
    expect(store.isLogsOpen).toBe(true);

    store.closeLogs();
    expect(store.isLogsOpen).toBe(false);
    expect(store.selectedLogs).toBeNull();
  });

  it("should ignore a late snapshot response after the project is reset", async () => {
    let resolveSnapshot: ((snapshot: OpenCodexDockerComposeSnapshot) => void) | undefined;
    const request = vi.fn(() => new Promise<OpenCodexDockerComposeSnapshot>((resolve) => {
      resolveSnapshot = resolve;
    }));
    const store = createStore(request);
    const loading = store.load();

    store.reset();
    resolveSnapshot?.(createSnapshot());
    await loading;

    expect(store.snapshot).toBeNull();
    expect(store.hasLoaded).toBe(false);
  });

  it("should ignore a late log response after the dialog closes", async () => {
    let resolveLogs: ((logs: OpenCodexDockerComposeLogs) => void) | undefined;
    const logs: OpenCodexDockerComposeLogs = {
      serviceName: "web",
      stdout: "ready\n",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false
    };
    const request = vi.fn((value: OpenCodexRequest) => {
      if (value.type === "docker.compose.service.logs.read") {
        return new Promise<OpenCodexDockerComposeLogs>((resolve) => {
          resolveLogs = resolve;
        });
      }

      return Promise.resolve(createSnapshot());
    });
    const store = createStore(request);
    const loading = store.openLogs("web");

    store.closeLogs();
    resolveLogs?.(logs);
    await loading;

    expect(store.selectedLogs).toBeNull();
    expect(store.isLogsOpen).toBe(false);
  });
});

/** Creates a project Compose store with a transport test double. */
function createStore(
  request: (value: OpenCodexRequest) => Promise<unknown>,
  sourceId: string | null | undefined = "source-1",
  isCodexSourceReady = sourceId !== null && sourceId !== undefined
): ProjectComposeStore {
  const projectStore = {
    project: {
      path: "/workspace/project",
      sourceId
    },
    isCodexSourceReady,
    projectPath: "/workspace/project"
  } as unknown as ProjectStore;

  return new ProjectComposeStore(projectStore, { request } as never);
}

/** Creates a snapshot with one running service. */
function createSnapshot(state: "running" | "stopped" = "running"): OpenCodexDockerComposeSnapshot {
  return {
    projectPath: "/workspace/project",
    sourceId: "source-1",
    composeFile: "compose.yaml",
    errorMessage: null,
    services: [{
      name: "web",
      state,
      containers: [{
              name: "sample-web-1",
              state,
        health: state === "running" ? "healthy" : "",
        exitCode: 0,
        publishers: []
      }]
    }]
  };
}
