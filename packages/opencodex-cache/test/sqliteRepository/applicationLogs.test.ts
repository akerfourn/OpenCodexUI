/**
 * Covers application log pagination and cleanup.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../../src/SqliteOpenCodexCacheRepository";
import type { OpenCodexCacheRepository } from "../../src/types";

describe("application logs", () => {
  let directory: string;
  let repository: OpenCodexCacheRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-cache-"));
    repository = createOpenCodexSqliteCacheRepository({ directory });
  });

  afterEach(async () => {
    await repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should persist and page application logs", async () => {
    await repository.createLog({
      type: "error",
      message: "First error",
      details: { code: "first" }
    });
    const secondLog = await repository.createLog({
      type: "warning",
      message: "Second warning"
    });

    const firstPage = await repository.listLogs({ limit: 1 });

    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.logs).toMatchObject([
      {
        id: secondLog.id,
        type: "warning",
        message: "Second warning",
        details: null
      }
    ]);

    const secondPage = await repository.listLogs({
      limit: 1,
      beforeCreatedAt: firstPage.logs[0]?.createdAt
    });

    expect(secondPage.logs).toMatchObject([
      {
        type: "error",
        message: "First error",
        details: { code: "first" }
      }
    ]);
  });

  it("should page matching log types instead of paging through unrelated entries", async () => {
    await repository.createLog({ type: "error", message: "First error" });
    await repository.createLog({ type: "info", message: "Noise one" });
    await repository.createLog({ type: "warning", message: "Warning" });
    await repository.createLog({ type: "info", message: "Noise two" });
    await repository.createLog({ type: "error", message: "Latest error" });

    const firstPage = await repository.listLogs({
      limit: 2,
      types: ["error", "warning"]
    });

    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.logs.map((log) => log.message)).toEqual([
      "Latest error",
      "Warning"
    ]);

    const secondPage = await repository.listLogs({
      limit: 2,
      beforeCreatedAt: firstPage.logs[1]?.createdAt,
      types: ["error", "warning"]
    });

    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.logs.map((log) => log.message)).toEqual(["First error"]);
  });

  it("should return no logs when the severity filter is empty", async () => {
    await repository.createLog({ type: "error", message: "Hidden" });

    const page = await repository.listLogs({ limit: 10, types: [] });

    expect(page).toEqual({ logs: [], hasMore: false });
  });

  it("should delete and clear application logs", async () => {
    const firstLog = await repository.createLog({ type: "error", message: "First" });
    await repository.createLog({ type: "error", message: "Second" });

    await repository.deleteLog(firstLog.id);

    const remainingPage = await repository.listLogs({ limit: 10 });

    expect(remainingPage.logs.map((log) => log.message)).toEqual(["Second"]);

    await repository.clearLogs();

    const emptyPage = await repository.listLogs({ limit: 10 });

    expect(emptyPage.logs).toHaveLength(0);
  });
});
