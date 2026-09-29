import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations.js";
import { SqliteMessageRenderingRepository } from "../src/sqlite/SqliteMessageRenderingRepository.js";

const context = { sourceId: "local", threadId: "thread" };
const entry = { turnId: "turn", itemId: "message", markdown: null, math: true };

describe("message rendering persistence", () => {
  let database: Database.Database;
  let repository: SqliteMessageRenderingRepository;
  beforeEach(() => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    database.prepare("INSERT INTO threads (id, title) VALUES (?, ?)").run("thread", "Conversation");
    database.prepare("INSERT INTO threads (id, title) VALUES (?, ?)").run("other", "Other conversation");
    repository = new SqliteMessageRenderingRepository(database);
  });
  afterEach(() => database.close());

  it("should retain overrides and existing content across repeated migrations and repository recreation", async () => {
    await repository.set(context, entry);
    runMigrations(database);
    expect(await new SqliteMessageRenderingRepository(database).read(context)).toEqual([entry]);
    expect(database.prepare("SELECT title FROM threads WHERE id = 'thread'").get()).toEqual({ title: "Conversation" });
    expect(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 42").get())
      .toEqual({ count: 1 });
  });

  it("should isolate sources, threads and turns even when item IDs are identical", async () => {
    await repository.set(context, entry);
    await repository.set(context, { ...entry, turnId: "other-turn", math: false });
    expect(await repository.read({ ...context, sourceId: "other" })).toEqual([]);
    expect(await repository.read({ ...context, sourceId: null })).toEqual([]);
    expect(await repository.read({ ...context, threadId: "other" })).toEqual([]);
    expect(await repository.read(context)).toEqual([{ ...entry, turnId: "other-turn", math: false }, entry]);
  });

  it("should remove exceptions when both values inherit and clean them up when a thread is deleted", async () => {
    await repository.set(context, entry);
    await repository.set(context, { ...entry, math: null });
    expect(await repository.read(context)).toEqual([]);
    await repository.set(context, { ...entry, markdown: false });
    database.prepare("DELETE FROM threads WHERE id = ?").run(context.threadId);
    expect(await repository.read(context)).toEqual([]);
  });
});
