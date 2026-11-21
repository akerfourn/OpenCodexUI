import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexDockerContainerLogs,
  OpenCodexDockerHostSnapshot,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

import {
  DockerHostStore,
  type DockerHostRequestPort
} from "../src/stores/app/DockerHostStore";

describe("DockerHostStore", () => {
  it("should expose an unavailable optional Docker installation without adding errors on repeated checks", async () => {
    let snapshot: OpenCodexDockerHostSnapshot = { availability: { available: false, reason: "cli-missing",
      message: "Docker executable was not found in this environment." }, containers: [] };
    const reportError = vi.fn();
    const store = new DockerHostStore({ request: vi.fn(async () => snapshot), reportError });
    await store.load();
    await store.load();
    expect(store.hasAttention).toBe(true);
    expect(reportError).not.toHaveBeenCalled();
    snapshot = createSnapshot();
    await store.load();
    expect(store.hasAttention).toBe(false);
  });

  it("should keep unexpected Docker failures in the journal and deduplicate an unchanged state", async () => {
    const reportError = vi.fn();
    const store = new DockerHostStore({ request: vi.fn(async () => ({ availability: { available: false,
      reason: "unknown", message: "Docker check failed", diagnostics: { operation: "container-list", exitCode: 1 } }, containers: [] })),
      reportError } as unknown as DockerHostRequestPort);
    await store.load();
    await store.load();
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0][1]).toMatchObject({ scope: "host", operation: "container-list", exitCode: 1 });
  });
  it("should load and memoize the latest host snapshot", async () => {
    const request = vi.fn(async () => createSnapshot());
    const store = new DockerHostStore({ request } as DockerHostRequestPort);

    await store.load();

    expect(store.snapshot).toEqual(createSnapshot());
    expect(store.hasLoaded).toBe(true);
    expect(store.isLoading).toBe(false);
    expect(request).toHaveBeenCalledWith({ type: "docker.host.snapshot.read" });
  });

  it("should refresh containers after a lifecycle action", async () => {
    const refreshedSnapshot = createSnapshot("exited");
    const request = vi.fn(async (value: OpenCodexRequest) => {
      if (value.type === "docker.host.container.stop") {
        return { ok: true };
      }

      return refreshedSnapshot;
    });
    const store = new DockerHostStore({ request } as DockerHostRequestPort);

    await store.stop("container-1");

    expect(request.mock.calls.map(([value]) => value)).toEqual([
      { type: "docker.host.container.stop", containerId: "container-1" },
      { type: "docker.host.snapshot.read" }
    ]);
    expect(store.snapshot).toEqual(refreshedSnapshot);
    expect(store.isContainerPending("container-1")).toBe(false);
  });

  it("should load bounded logs for the selected container", async () => {
    const logs: OpenCodexDockerContainerLogs = {
      containerId: "container-1",
      stdout: "ready\n",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false
    };
    const request = vi.fn(async () => logs);
    const store = new DockerHostStore({ request } as DockerHostRequestPort);

    await store.openLogs("container-1");

    expect(store.selectedContainerId).toBe("container-1");
    expect(store.selectedLogs).toEqual(logs);
    expect(request).toHaveBeenCalledWith({
      type: "docker.host.container.logs.read",
      containerId: "container-1",
      tail: 200
    });

    store.closeLogs();
    expect(store.selectedContainerId).toBeNull();
    expect(store.selectedLogs).toBeNull();
  });
});

/** Creates a ready Docker snapshot with one container. */
function createSnapshot(state = "running"): OpenCodexDockerHostSnapshot {
  return {
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
      state,
      status: state,
      ports: "127.0.0.1:8080->80/tcp"
    }]
  };
}
