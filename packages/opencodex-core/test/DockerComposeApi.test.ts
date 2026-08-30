import { describe, expect, it, vi } from "vitest";

import type { OpenCodexDockerComposeSnapshot } from "@open-codex-ui/opencodex-protocol";

import { DockerComposeApi } from "../src/backend/runtime/api/DockerComposeApi";

describe("DockerComposeApi", () => {
  it("should forward explicit project, source, and service identifiers", async () => {
    const snapshot = {
      projectPath: "/workspace/app",
      sourceId: "source-1",
      composeFile: "compose.yaml",
      errorMessage: null,
      services: []
    } satisfies OpenCodexDockerComposeSnapshot;
    const service = {
      readSnapshot: vi.fn(async () => snapshot),
      up: vi.fn(async () => ({ ok: true as const })),
      stop: vi.fn(async () => ({ ok: true as const })),
      restart: vi.fn(async () => ({ ok: true as const })),
      readLogs: vi.fn()
    };
    const api = new DockerComposeApi(service);

    await expect(api.readSnapshot("/workspace/app", "source-1")).resolves.toBe(snapshot);
    await api.stop("/workspace/app", "source-1", "web");

    expect(service.readSnapshot).toHaveBeenCalledWith("/workspace/app", "source-1");
    expect(service.stop).toHaveBeenCalledWith("/workspace/app", "source-1", "web");
  });
});
