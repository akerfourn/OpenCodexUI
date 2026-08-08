/**
 * Covers migration, merge, routing, and reload behavior for collaboration events.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import type { OpenCodexCollaborationEvent } from "@open-codex-ui/opencodex-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../src/SqliteOpenCodexCacheRepository";
import type {
  CachedThreadSummary,
  OpenCodexCacheRepository
} from "../src/types";

describe("collaboration event persistence", () => {
  let directory: string;
  let repository: OpenCodexCacheRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-collaboration-"));
    repository = createOpenCodexSqliteCacheRepository({ directory });
  });

  afterEach(async () => {
    await repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should migrate a version 25 database without losing existing data", async () => {
    const legacyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-collaboration-v25-"));
    const fileName = "legacy.sqlite";
    const databasePath = path.join(legacyDirectory, fileName);
    const legacyDatabase = new Database(databasePath);

    legacyDatabase.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE preserved_data (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        source_id TEXT,
        parent_thread_id TEXT
      );
      INSERT INTO preserved_data (id, value) VALUES ('sentinel', 'keep-me');
    `);
    const insertMigration = legacyDatabase.prepare(
      "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)"
    );

    for (let version = 1; version <= 25; version += 1) {
      insertMigration.run(version, "2026-08-01T00:00:00.000Z");
    }

    legacyDatabase.close();

    const migratedRepository = createOpenCodexSqliteCacheRepository({
      directory: legacyDirectory,
      fileName
    });

    try {
      expect(await migratedRepository.listCollaborationEvents({
        sourceId: "source-1"
      })).toEqual([]);
    } finally {
      await migratedRepository.close();
    }

    const reopenedRepository = createOpenCodexSqliteCacheRepository({
      directory: legacyDirectory,
      fileName
    });
    await reopenedRepository.close();

    const migratedDatabase = new Database(databasePath, { readonly: true });

    try {
      const preserved = migratedDatabase
        .prepare("SELECT value FROM preserved_data WHERE id = ?")
        .get("sentinel") as { value: string } | undefined;
      const migration = migratedDatabase
        .prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 26")
        .get() as { count: number };
      const columns = migratedDatabase
        .prepare("PRAGMA table_info(collaboration_events)")
        .all() as Array<{ name: string }>;

      expect(preserved?.value).toBe("keep-me");
      expect(migration.count).toBe(1);
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "source_id",
          "thread_id",
          "receiver_thread_ids_json",
          "evidence_json"
        ])
      );
    } finally {
      migratedDatabase.close();
      fs.rmSync(legacyDirectory, { recursive: true, force: true });
    }
  });

  it("should reload a complete event without losing normalized fields", async () => {
    const event = createCollaborationEvent({
      id: "event-complete",
      action: "spawn",
      toolName: "spawn_agent",
      receiverThreadIds: ["thread-child"],
      receiverAgentPaths: ["/root/child"],
      prompt: "Inspect the cache.",
      taskName: "cache",
      model: "gpt-5.6-luna",
      reasoningEffort: "high",
      agentRole: "explorer",
      forkTurns: 5,
      status: "completed",
      targetAgentStatuses: {
        "thread-child": "running"
      },
      evidence: ["rawFunctionCall", "canonicalItem"]
    });

    const stored = await repository.upsertCollaborationEvent(event);
    await repository.close();
    repository = createOpenCodexSqliteCacheRepository({ directory });

    const [reloaded] = await repository.listCollaborationEvents({
      sourceId: "source-1",
      threadId: "thread-parent"
    });

    expect(reloaded).toEqual(stored);
    expect(reloaded).toMatchObject(event);
  });

  it("should enrich partial evidence and ignore exact replays", async () => {
    const partial = createCollaborationEvent({
      id: "event-merge",
      callId: "call-merge",
      action: "message",
      receiverThreadIds: ["thread-child"],
      status: "pending",
      evidence: ["canonicalItem"]
    });
    const rawUpdate = createCollaborationEvent({
      id: "event-merge",
      callId: "call-merge",
      action: "followup",
      toolName: "followup_task",
      receiverAgentPaths: ["/root/child"],
      prompt: "Verify the Windows behavior too.",
      status: "completed",
      evidence: ["rawFunctionCall"]
    });

    const first = await repository.upsertCollaborationEvent(partial);
    const merged = await repository.upsertCollaborationEvent(rawUpdate);
    const replayed = await repository.upsertCollaborationEvent(rawUpdate);
    const events = await repository.listCollaborationEvents({ sourceId: "source-1" });

    expect(events).toHaveLength(1);
    expect(merged).toMatchObject({
      action: "followup",
      receiverThreadIds: ["thread-child"],
      receiverAgentPaths: ["/root/child"],
      prompt: "Verify the Windows behavior too.",
      status: "completed",
      evidence: ["canonicalItem", "rawFunctionCall"],
      firstObservedAt: first.firstObservedAt
    });
    expect(replayed.updatedAt).toBe(merged.updatedAt);
  });

  it("should isolate identical event ids across sources and retain orphans", async () => {
    const firstSourceEvent = createCollaborationEvent({
      id: "shared-event-id",
      sourceId: "source-a",
      prompt: "Source A"
    });
    const secondSourceEvent = createCollaborationEvent({
      id: "shared-event-id",
      sourceId: "source-b",
      prompt: "Source B"
    });

    await repository.upsertCollaborationEvent(firstSourceEvent);
    await repository.upsertCollaborationEvent(secondSourceEvent);

    const sourceAEvents = await repository.listCollaborationEvents({ sourceId: "source-a" });
    const sourceBEvents = await repository.listCollaborationEvents({ sourceId: "source-b" });

    expect(sourceAEvents).toHaveLength(1);
    expect(sourceBEvents).toHaveLength(1);
    expect(sourceAEvents[0]?.prompt).toBe("Source A");
    expect(sourceBEvents[0]?.prompt).toBe("Source B");
  });

  it("should query events by observed, sender, receiver, and root threads", async () => {
    await repository.upsertThreadIndex([
      createThreadSummary("thread-root", null),
      createThreadSummary("thread-child", "thread-root"),
      createThreadSummary("thread-grandchild", "thread-child"),
      createThreadSummary("thread-unrelated", null)
    ]);
    const rootEvent = createCollaborationEvent({
      id: "event-root",
      threadId: "thread-root",
      senderThreadId: "thread-root",
      receiverThreadIds: ["thread-child"]
    });
    const childEvent = createCollaborationEvent({
      id: "event-child",
      threadId: "thread-child",
      senderThreadId: "thread-child",
      receiverThreadIds: ["thread-grandchild"]
    });
    const unrelatedEvent = createCollaborationEvent({
      id: "event-unrelated",
      threadId: "thread-unrelated",
      senderThreadId: "thread-unrelated",
      receiverThreadIds: []
    });

    await repository.upsertCollaborationEvent(rootEvent);
    await repository.upsertCollaborationEvent(childEvent);
    await repository.upsertCollaborationEvent(unrelatedEvent);

    expect((await repository.listCollaborationEvents({
      sourceId: "source-1",
      threadId: "thread-child"
    })).map((event) => event.id)).toEqual(["event-child"]);
    expect((await repository.listCollaborationEvents({
      sourceId: "source-1",
      senderThreadId: "thread-child"
    })).map((event) => event.id)).toEqual(["event-child"]);
    expect((await repository.listCollaborationEvents({
      sourceId: "source-1",
      receiverThreadId: "thread-child"
    })).map((event) => event.id)).toEqual(["event-root"]);
    expect((await repository.listCollaborationEvents({
      sourceId: "source-1",
      rootThreadId: "thread-root"
    })).map((event) => event.id)).toEqual(["event-root", "event-child"]);
  });
});

/**
 * Creates one complete protocol event with focused test overrides.
 */
function createCollaborationEvent(
  patch: Partial<OpenCodexCollaborationEvent>
): OpenCodexCollaborationEvent {
  return {
    id: "event-1",
    sourceId: "source-1",
    threadId: "thread-parent",
    turnId: "turn-1",
    callId: "call-1",
    action: "message",
    toolName: "send_message",
    senderThreadId: "thread-parent",
    senderAgentPath: "/root",
    receiverThreadIds: [],
    receiverAgentPaths: [],
    prompt: null,
    result: null,
    taskName: null,
    model: null,
    reasoningEffort: null,
    agentRole: null,
    forkTurns: null,
    status: "unknown",
    targetAgentStatuses: {},
    evidence: ["canonicalItem"],
    ...patch
  };
}

/**
 * Creates a source-aware cached thread summary for hierarchy queries.
 */
function createThreadSummary(
  id: string,
  parentThreadId: string | null
): CachedThreadSummary {
  return {
    id,
    sessionId: id,
    parentThreadId,
    sourceId: "source-1",
    codexTitle: id,
    customTitle: null,
    title: id,
    preview: "",
    model: null,
    reasoningEffort: null,
    projectName: "Project",
    projectPath: "/tmp/collaboration-project",
    branchName: null,
    updatedAt: "2026-08-08T00:00:00.000Z",
    isArchived: false,
    threadSource: "subAgent",
    agentNickname: null,
    agentRole: null,
    status: "idle"
  };
}
