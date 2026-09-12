/**
 * Covers application log pagination and cleanup.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

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

  it("should use the id tie-breaker when paginating equal timestamps", async () => {
    await repository.createLog({ type: "error", message: "First" });
    await repository.createLog({ type: "warning", message: "Second" });
    await repository.createLog({ type: "info", message: "Third" });

    await repository.close();
    const database = new Database(path.join(directory, "opencodex-cache.sqlite"));
    database.prepare("UPDATE logs SET created_at = ?").run("2026-09-01T00:00:00.000Z");
    database.close();
    repository = createOpenCodexSqliteCacheRepository({ directory });

    const completePage = await repository.listLogs({ limit: 10 });
    const firstPage = await repository.listLogs({ limit: 2 });
    const cursor = firstPage.logs.at(-1);

    expect(cursor).toBeDefined();
    const secondPage = await repository.listLogs({
      limit: 2,
      beforeCreatedAt: cursor?.createdAt,
      beforeId: cursor?.id
    });

    expect([...firstPage.logs, ...secondPage.logs].map((log) => log.id)).toEqual(
      completePage.logs.map((log) => log.id)
    );
    expect(secondPage.hasMore).toBe(false);
  });

  it("should return no logs when the severity filter is empty", async () => {
    await repository.createLog({ type: "error", message: "Hidden" });

    const page = await repository.listLogs({ limit: 10, types: [] });

    expect(page).toEqual({ logs: [], hasMore: false });
  });

  it("should preserve optional categories when creating and reading logs", async () => {
    const ordinaryLog = await repository.createLog({
      type: "warning",
      message: "Ordinary warning"
    });
    const performanceLog = await repository.createLog({
      type: "warning",
      message: "Performance slowdown detected",
      category: "performanceSlowdown"
    });

    expect(ordinaryLog).not.toHaveProperty("category");
    expect(performanceLog.category).toBe("performanceSlowdown");

    const page = await repository.listLogs({ limit: 10 });

    expect(page.logs).toEqual([
      expect.objectContaining({
        id: performanceLog.id,
        category: "performanceSlowdown"
      }),
      expect.objectContaining({
        id: ordinaryLog.id
      })
    ]);
    expect(page.logs[1]).not.toHaveProperty("category");
  });

  it("should isolate category and severity filters when clearing old logs", async () => {
    const performanceLog = await repository.createLog({
      type: "warning",
      message: "Performance slowdown detected",
      category: "performanceSlowdown"
    });
    await repository.createLog({ type: "warning", message: "Ordinary warning" });
    const ordinaryInfo = await repository.createLog({ type: "info", message: "Ordinary info" });

    await repository.clearLogsOlderThan("9999-01-01T00:00:00.000Z", {
      type: "warning",
      excludeCategory: "performanceSlowdown"
    });

    let page = await repository.listLogs({ limit: 10 });
    expect(page.logs.map((log) => log.id)).toEqual([ordinaryInfo.id, performanceLog.id]);

    await repository.clearLogsOlderThan("9999-01-01T00:00:00.000Z", {
      category: "performanceSlowdown"
    });

    page = await repository.listLogs({ limit: 10 });
    expect(page.logs.map((log) => log.id)).toEqual([ordinaryInfo.id]);
  });

  it("should classify only known legacy performance warnings during migration", async () => {
    await repository.close();

    const databasePath = path.join(directory, "opencodex-cache.sqlite");
    const database = new Database(databasePath);
    database.exec(`
      DROP INDEX IF EXISTS idx_logs_category_created;
      ALTER TABLE logs DROP COLUMN category;
      DELETE FROM schema_migrations WHERE version = 39;
    `);
    const insertLog = database.prepare(`
      INSERT INTO logs (id, type, message, details_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertLog.run(
      "legacy-english",
      "warning",
      "Performance slowdown detected",
      null,
      "2026-09-01T00:00:00.000Z"
    );
    insertLog.run(
      "legacy-french",
      "warning",
      "Ralentissement de performance détecté",
      null,
      "2026-09-01T00:00:01.000Z"
    );
    insertLog.run(
      "unknown-warning",
      "warning",
      "Performance slowdown detected with extra context",
      null,
      "2026-09-01T00:00:02.000Z"
    );
    insertLog.run(
      "unknown-severity",
      "info",
      "Performance slowdown detected",
      null,
      "2026-09-01T00:00:03.000Z"
    );
    database.close();

    repository = createOpenCodexSqliteCacheRepository({ directory });
    const page = await repository.listLogs({ limit: 10 });

    const logsById = new Map(page.logs.map((log) => [log.id, log]));

    expect(logsById.get("legacy-english")?.category).toBe("performanceSlowdown");
    expect(logsById.get("legacy-french")?.category).toBe("performanceSlowdown");
    expect(logsById.get("unknown-warning")).not.toHaveProperty("category");
    expect(logsById.get("unknown-severity")).not.toHaveProperty("category");
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
