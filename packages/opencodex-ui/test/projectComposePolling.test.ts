import { describe, expect, it } from "vitest";

import type { OpenCodexDockerComposeService } from "@open-codex-ui/opencodex-protocol";

import {
  COMPOSE_REFRESH_INTERVAL_MS,
  COMPOSE_SNAPSHOT_STALE_AFTER_MS,
  COMPOSE_TRANSIENT_REFRESH_INTERVAL_MS,
  readComposePollingInterval,
  shouldRefreshComposeSnapshot
} from "../src/components/projects/useProjectComposePolling";

describe("project Compose polling", () => {
  it("should refresh when no successful snapshot exists", () => {
    expect(shouldRefreshComposeSnapshot(null, 10_000)).toBe(true);
  });

  it("should wait while the last snapshot is still fresh", () => {
    expect(shouldRefreshComposeSnapshot(10_000, 10_000 + COMPOSE_SNAPSHOT_STALE_AFTER_MS - 1))
      .toBe(false);
  });

  it("should refresh when the last snapshot reaches the stale threshold", () => {
    expect(shouldRefreshComposeSnapshot(10_000, 10_000 + COMPOSE_SNAPSHOT_STALE_AFTER_MS))
      .toBe(true);
  });

  it("should poll transient service states more frequently", () => {
    const services: OpenCodexDockerComposeService[] = [{
      name: "postgres",
      state: "partial",
      containers: []
    }];

    expect(readComposePollingInterval(services)).toBe(COMPOSE_TRANSIENT_REFRESH_INTERVAL_MS);
  });

  it("should use the regular interval for stable service states", () => {
    const services: OpenCodexDockerComposeService[] = [{
      name: "postgres",
      state: "running",
      containers: [{
        name: "postgres-1",
        state: "running",
        health: "healthy",
        exitCode: 0,
        publishers: []
      }]
    }];

    expect(readComposePollingInterval(services)).toBe(COMPOSE_REFRESH_INTERVAL_MS);
  });
});
