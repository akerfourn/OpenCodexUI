import Database, { type Database as BetterSqliteDatabase } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runMigrations } from "../src/sqlite/migrations.js";
import { SqliteThreadCacheRepository } from "../src/sqlite/threads/SqliteThreadCacheRepository.js";
import type { CachedThreadSnapshot, CachedTurnExecutionMetadata, CachedTurnExecutionSettings } from "../src/types.js";

const firstObservedAt = "2026-10-11T10:00:00.000Z";
const updatedAt = "2026-10-11T10:01:00.000Z";
const settings: CachedTurnExecutionSettings = {
  requestedModel: "requested-model",
  effectiveModel: "effective-model",
  requestedReasoningEffort: "high",
  effectiveReasoningEffort: "medium",
  serviceTier: "fast"
};
const unknownSettings: CachedTurnExecutionSettings = {
  requestedModel: null,
  effectiveModel: null,
  requestedReasoningEffort: null,
  effectiveReasoningEffort: null,
  serviceTier: null
};

/** Creates deterministic metadata, allowing each test to change only its relevant fields. */
function createMetadata(patch: Partial<CachedTurnExecutionMetadata> = {}): CachedTurnExecutionMetadata {
  return {
    sourceId: "source-a", threadId: "thread-a", turnId: "turn-a",
    ...settings, firstObservedAt, updatedAt, ...patch
  };
}

/** Reads persisted values independently of the write path, including timestamps absent from turn DTOs. */
function readMetadataRows(database: BetterSqliteDatabase): CachedTurnExecutionMetadata[] {
  return database.prepare(`
    SELECT source_id AS sourceId, thread_id AS threadId, turn_id AS turnId,
      requested_model AS requestedModel, effective_model AS effectiveModel,
      requested_reasoning_effort AS requestedReasoningEffort,
      effective_reasoning_effort AS effectiveReasoningEffort, service_tier AS serviceTier,
      first_observed_at AS firstObservedAt, updated_at AS updatedAt
    FROM turn_execution_metadata
    ORDER BY source_id, thread_id, turn_id
  `).all() as CachedTurnExecutionMetadata[];
}

/** Supplies a minimal real thread snapshot for exercising turn persistence and its transaction. */
function createSnapshot(turns: unknown[]): CachedThreadSnapshot {
  return {
    thread: {
      id: "thread-a", sessionId: null, parentThreadId: null, sourceId: "source-a",
      codexTitle: "Thread", customTitle: null, title: "Thread", preview: "",
      model: null, reasoningEffort: null, projectName: "Project", projectPath: "/project",
      branchName: null, updatedAt, isArchived: false, threadSource: null,
      agentNickname: null, agentRole: null, subAgentSource: null, canAcceptDirectInput: null
    },
    turns,
    syncState: {
      threadId: "thread-a", newestTurnId: null, oldestTurnId: null, olderCursor: null,
      hasLoadedLatest: true, hasLoadedAllOlderTurns: true, lastSyncedAt: updatedAt
    },
    tokenUsage: null
  };
}

describe("turn execution metadata persistence", () => {
  let database: BetterSqliteDatabase;
  let repository: SqliteThreadCacheRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(updatedAt);
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    repository = new SqliteThreadCacheRepository(database);
  });

  afterEach(() => {
    database.close();
    vi.useRealTimers();
  });

  it("should persist every metadata field before the associated thread arrives", async () => {
    const metadata = createMetadata();

    await repository.saveTurnExecutionMetadata(metadata);

    expect(readMetadataRows(database)).toEqual([metadata]);
    expect(await repository.getThread("thread-a")).toBeNull();
  });

  it("should enrich initially unknown settings without creating duplicate rows", async () => {
    await repository.saveTurnExecutionMetadata(createMetadata(unknownSettings));

    await repository.saveTurnExecutionMetadata(createMetadata());
    await repository.saveTurnExecutionMetadata(createMetadata());

    expect(readMetadataRows(database)).toEqual([createMetadata()]);
  });

  it("should replace known fields selectively and retain values reported as null", async () => {
    await repository.saveTurnExecutionMetadata(createMetadata());
    const patch = { ...unknownSettings, effectiveModel: "rerouted-model", serviceTier: "flex" };

    await repository.saveTurnExecutionMetadata(createMetadata(patch));
    await repository.saveTurnExecutionMetadata(createMetadata(unknownSettings));

    expect(readMetadataRows(database)).toEqual([
      createMetadata({ effectiveModel: "rerouted-model", serviceTier: "flex" })
    ]);
  });

  it("should replace all known settings when a subsequent report supplies new values", async () => {
    await repository.saveTurnExecutionMetadata(createMetadata());
    const replacement = createMetadata({ requestedModel: "new-requested", effectiveModel: "new-effective",
      requestedReasoningEffort: "low", effectiveReasoningEffort: "high", serviceTier: "flex" });

    await repository.saveTurnExecutionMetadata(replacement);

    expect(readMetadataRows(database)).toEqual([replacement]);
  });

  it("should retain the earliest observation while recording each incoming update timestamp", async () => {
    await repository.saveTurnExecutionMetadata(createMetadata());
    const earlier = "2026-10-11T09:00:00.000Z";
    await repository.saveTurnExecutionMetadata(createMetadata({ firstObservedAt: earlier,
      updatedAt: "2026-10-11T10:02:00.000Z" }));

    const nextUpdate = "2026-10-11T10:03:00.000Z";
    await repository.saveTurnExecutionMetadata(createMetadata({ firstObservedAt: nextUpdate, updatedAt: nextUpdate }));

    expect(readMetadataRows(database)).toEqual([createMetadata({ firstObservedAt: earlier, updatedAt: nextUpdate })]);
  });

  it("should isolate updates by the complete source, thread and turn identity", async () => {
    const identities = [
      { sourceId: "source-a", threadId: "thread-a", turnId: "turn-a" },
      { sourceId: "source-b", threadId: "thread-a", turnId: "turn-a" },
      { sourceId: "source-a", threadId: "thread-b", turnId: "turn-a" },
      { sourceId: "source-a", threadId: "thread-a", turnId: "turn-b" }
    ];
    for (const identity of identities) {
      await repository.saveTurnExecutionMetadata(createMetadata(identity));
    }

    await repository.saveTurnExecutionMetadata(createMetadata({ effectiveModel: "changed" }));

    const rows = readMetadataRows(database);
    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual(createMetadata({ effectiveModel: "changed" }));
    for (const identity of identities.slice(1)) {
      expect(rows).toContainEqual(createMetadata(identity));
    }
  });

  it("should persist embedded turn settings and expose subsequent metadata enrichment on reads", async () => {
    await repository.saveThreadSnapshot(createSnapshot([
      { id: "turn-a", status: "completed", startedAt: firstObservedAt, items: [], openCodexUiExecution: settings }
    ]));
    expect(readMetadataRows(database)).toEqual([createMetadata()]);

    await repository.saveTurnExecutionMetadata(createMetadata({ ...unknownSettings,
      effectiveModel: "rerouted-model", serviceTier: "flex" }));

    const snapshot = await repository.getThread("thread-a");
    expect(snapshot?.turns).toEqual([
      { id: "turn-a", status: "completed", startedAt: firstObservedAt, items: [],
        openCodexUiExecution: { ...settings, effectiveModel: "rerouted-model", serviceTier: "flex" } }
    ]);
    const raw = database.prepare("SELECT raw_json FROM turns WHERE thread_id = ? AND id = ?")
      .get("thread-a", "turn-a") as { raw_json: string };
    expect(JSON.parse(raw.raw_json)).not.toHaveProperty("openCodexUiExecution");
  });

  it("should merge embedded partial settings with preexisting source-owned metadata", async () => {
    await repository.saveTurnExecutionMetadata(createMetadata());
    await repository.saveTurnExecutionMetadata(createMetadata({ sourceId: "source-b", effectiveModel: "other-source" }));

    await repository.saveThreadSnapshot(createSnapshot([
      { id: "turn-a", status: "completed", startedAt: firstObservedAt, items: [],
        openCodexUiExecution: { ...unknownSettings, effectiveReasoningEffort: "low" } }
    ]));

    const snapshot = await repository.getThread("thread-a");
    expect(snapshot?.turns[0]).toMatchObject({
      openCodexUiExecution: { ...settings, effectiveReasoningEffort: "low" }
    });
    expect(readMetadataRows(database)).toEqual([
      createMetadata({ effectiveReasoningEffort: "low" }),
      createMetadata({ sourceId: "source-b", effectiveModel: "other-source" })
    ]);
  });

  it("should roll back embedded metadata when the enclosing snapshot transaction fails", async () => {
    await repository.saveThreadSnapshot(createSnapshot([]));
    database.exec(`
      CREATE TRIGGER fail_fixture_turn BEFORE INSERT ON turns
      WHEN NEW.id = 'turn-fail'
      BEGIN
        SELECT RAISE(ABORT, 'fixture turn failure');
      END;
    `);

    const pending = repository.saveThreadSnapshot(createSnapshot([
      { id: "turn-a", status: "completed", startedAt: firstObservedAt, items: [], openCodexUiExecution: settings },
      { id: "turn-fail", status: "completed", startedAt: updatedAt, items: [], openCodexUiExecution: settings }
    ]));

    await expect(pending).rejects.toThrow(Error);
    await expect(pending).rejects.toThrow("fixture turn failure");
    expect(readMetadataRows(database)).toEqual([]);
    expect((await repository.getThread("thread-a"))?.turns).toEqual([]);
  });
});
