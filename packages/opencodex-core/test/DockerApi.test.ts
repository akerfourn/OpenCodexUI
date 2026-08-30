import { describe, expect, it, vi } from "vitest";

import type { OpenCodexDockerHostSnapshot } from "@open-codex-ui/opencodex-protocol";

import { DockerApi } from "../src/backend/runtime/api/DockerApi";

describe("DockerApi", () => {
  it("should forward host Docker operations with concise names", async () => {
    const snapshot = {
      availability: { available: false, message: "unavailable" },
      containers: []
    } as OpenCodexDockerHostSnapshot;
    const service = {
      readSnapshot: vi.fn(async () => snapshot),
      start: vi.fn(async () => ({ ok: true as const })),
      stop: vi.fn(async () => ({ ok: true as const })),
      restart: vi.fn(async () => ({ ok: true as const })),
      readLogs: vi.fn()
    };
    const api = new DockerApi(service);

    await expect(api.readSnapshot()).resolves.toBe(snapshot);
    await api.restart("container-1");

    expect(service.readSnapshot).toHaveBeenCalledOnce();
    expect(service.restart).toHaveBeenCalledWith("container-1");
  });
});
