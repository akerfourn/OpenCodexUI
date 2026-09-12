import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOpenCodexSqliteCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexEvent, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { ApplicationLogService } from "../src/backend/support/ApplicationLogService";

describe("application log policies with SQLite", () => {
  let directory: string;
  let repository: OpenCodexCacheRepository;
  let service: ApplicationLogService;
  let events: OpenCodexEvent[];

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "opencodex-log-policies-"));
    repository = createOpenCodexSqliteCacheRepository({ directory });
    events = [];
    service = new ApplicationLogService({
      cacheRepository: repository,
      events: { emit: (event) => events.push(event) }
    });
  });

  afterEach(async () => {
    await service.dispose();
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("should expose session information without persisting it across a backend restart", async () => {
    await service.createLog("info", "Session information", { value: 1 });
    await service.createLog("error", "Persistent error", null);
    await service.createLog("warning", "Slowdown report", null, "performanceSlowdown");

    const disk = await repository.listLogs({ limit: 30 });
    expect(disk.logs.map((entry) => entry.message)).toEqual([
      "Slowdown report", "Persistent error"
    ]);
    const combined = await service.listLogs(null, 30);
    expect(combined.logs).toHaveLength(3);
    expect(combined.logs.find((entry) => entry.type === "info"))
      .toMatchObject({ storage: "session", details: { value: 1 } });

    await service.dispose();
    await repository.close();
    repository = createOpenCodexSqliteCacheRepository({ directory });
    service = new ApplicationLogService({
      cacheRepository: repository,
      events: { emit: (event) => events.push(event) }
    });
    expect((await service.listLogs(null, 30)).logs.map((entry) => entry.message))
      .toEqual(["Slowdown report", "Persistent error"]);
  });

  it("should delete and clear both memory and disk records through the same API", async () => {
    await service.createLog("info", "Temporary entry", null);
    await service.createLog("warning", "Stored entry", null);
    const page = await service.listLogs(null, 30);
    const temporary = page.logs.find((entry) => entry.type === "info");
    expect(temporary).toBeDefined();
    await service.deleteLog(temporary!.id);
    expect((await service.listLogs(null, 30)).logs.map((entry) => entry.message))
      .toEqual(["Stored entry"]);

    await service.createLog("info", "Another temporary entry", null);
    await service.clearLogs("all", 24, "hours");
    expect((await service.listLogs(null, 30)).logs).toEqual([]);
    expect((await repository.listLogs({ limit: 30 })).logs).toEqual([]);
    expect(events).toContainEqual({ type: "logs.cleared" });
  });

  it("should page through session and disk entries sharing the same timestamp", async () => {
    await service.createLog("info", "Session", null);
    const session = (await service.listLogs(null, 30)).logs[0];
    const database = new Database(path.join(directory, "opencodex-cache.sqlite"));
    try {
      const insert = database.prepare(
        "INSERT INTO logs (id, type, message, created_at) VALUES (?, 'warning', ?, ?)"
      );
      insert.run("a-persistent", "Disk A", session.createdAt);
      insert.run("z-persistent", "Disk Z", session.createdAt);
    } finally {
      database.close();
    }

    const first = await service.listLogs(null, 1);
    const second = await service.listLogs(first.logs[0].createdAt, 1, undefined, first.logs[0].id);
    const third = await service.listLogs(second.logs[0].createdAt, 1, undefined, second.logs[0].id);

    expect([first.logs[0].message, second.logs[0].message, third.logs[0].message])
      .toEqual(["Disk Z", "Session", "Disk A"]);
    expect([first.hasMore, second.hasMore, third.hasMore]).toEqual([true, true, false]);
  });

  it("should purge only expired policy categories at startup and after a settings change", async () => {
    await repository.createLog({ type: "info", message: "Historical information" });
    await repository.createLog({ type: "warning", message: "Ordinary warning" });
    await repository.createLog({ type: "error", message: "Error" });
    await repository.createLog({
      type: "warning", message: "Historical slowdown", category: "performanceSlowdown"
    });
    const database = new Database(path.join(directory, "opencodex-cache.sqlite"));
    try {
      database.prepare("UPDATE logs SET created_at = ?").run("2020-01-01T00:00:00.000Z");
    } finally {
      database.close();
    }
    await service.dispose();
    service = new ApplicationLogService({
      cacheRepository: repository,
      events: { emit: (event) => events.push(event) },
      now: () => new Date("2030-01-01T00:00:00.000Z")
    });

    await service.start();
    expect((await repository.listLogs({ limit: 30 })).logs.map((entry) => entry.message).sort())
      .toEqual(["Error", "Historical information", "Ordinary warning"]);

    await service.applySettings({ logPolicies: {
      info: { mode: "retained", retentionDays: 1 },
      performanceSlowdown: { mode: "unlimited" }
    } } as OpenCodexSettings);
    expect((await repository.listLogs({ limit: 30 })).logs.map((entry) => entry.message).sort())
      .toEqual(["Error", "Ordinary warning"]);
  });
});
