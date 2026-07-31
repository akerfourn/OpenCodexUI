/**
 * Covers source-scoped rate-limit history persistence.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../src/SqliteOpenCodexCacheRepository";
import type { OpenCodexCacheRepository } from "../src/types";

describe("usage rate-limit history", () => {
  let directory: string;
  let repository: OpenCodexCacheRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-rate-limit-history-"));
    repository = createOpenCodexSqliteCacheRepository({ directory });
  });

  afterEach(async () => {
    await repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should keep distinct source-scoped snapshots and preserve JSON payloads", async () => {
    await repository.saveUsageRateLimitSnapshot(createSnapshot(
      "source-a",
      "fingerprint-a",
      "2026-07-31T10:00:00.000Z",
      { rateLimits: { weekly: 10 }, futureField: { enabled: true } }
    ));
    await repository.saveUsageRateLimitSnapshot(createSnapshot(
      "source-a",
      "fingerprint-a",
      "2026-07-31T10:01:00.000Z",
      { rateLimits: { weekly: 10 }, futureField: { enabled: false } }
    ));
    await repository.saveUsageRateLimitSnapshot(createSnapshot(
      "source-a",
      "fingerprint-b",
      "2026-07-31T10:02:00.000Z",
      { rateLimits: { weekly: 11 }, futureField: { enabled: false } }
    ));
    await repository.saveUsageRateLimitSnapshot(createSnapshot(
      "source-b",
      "fingerprint-a",
      "2026-07-31T10:03:00.000Z",
      { rateLimits: { weekly: 10 } }
    ));

    const snapshots = await repository.listUsageRateLimitSnapshots({ sourceId: "source-a" });

    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((snapshot) => snapshot.fingerprint)).toEqual([
      "fingerprint-a",
      "fingerprint-b"
    ]);
    expect(JSON.parse(snapshots[0]?.payloadJson ?? "{}")).toMatchObject({
      futureField: { enabled: true }
    });
  });

  it("should apply the requested time range", async () => {
    await repository.saveUsageRateLimitSnapshot(createSnapshot(
      "source-a",
      "fingerprint-a",
      "2026-07-31T10:00:00.000Z",
      {}
    ));
    await repository.saveUsageRateLimitSnapshot(createSnapshot(
      "source-a",
      "fingerprint-b",
      "2026-07-31T11:00:00.000Z",
      {}
    ));
    await repository.saveUsageRateLimitSnapshot(createSnapshot(
      "source-a",
      "fingerprint-c",
      "2026-07-31T12:00:00.000Z",
      {}
    ));

    const snapshots = await repository.listUsageRateLimitSnapshots({
      sourceId: "source-a",
      fromObservedAt: "2026-07-31T11:00:00.000Z",
      toObservedAt: "2026-07-31T12:00:00.000Z"
    });

    expect(snapshots.map((snapshot) => snapshot.fingerprint)).toEqual(["fingerprint-b"]);
  });
});

function createSnapshot(
  sourceId: string,
  fingerprint: string,
  observedAt: string,
  payload: unknown
) {
  return {
    sourceId,
    observedAt,
    origin: "notification" as const,
    reason: "accountRateLimitsUpdated",
    fingerprint,
    payloadJson: JSON.stringify(payload)
  };
}
