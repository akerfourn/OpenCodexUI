/**
 * Covers SQLite persistence for thread lists, deletion, and titles.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../../src/SqliteOpenCodexCacheRepository";
import type { OpenCodexCacheRepository } from "../../src/types";

describe("SQLite thread persistence", () => {
  let directory: string;
  let repository: OpenCodexCacheRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-cache-thread-persistence-"));
    repository = createOpenCodexSqliteCacheRepository({ directory });
  });

  afterEach(async () => {
    await repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should keep active and archived thread lists separate", async () => {
    await repository.upsertThreadIndex([
      {
        id: "active-thread",
        codexTitle: "Active",
        customTitle: null,
        title: "Active",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "archive-project",
        projectPath: "/tmp/archive-project",
        sourceId: null,
        branchName: null,
        updatedAt: "2026-01-02T00:00:00.000Z",
        isArchived: false
      },
      {
        id: "archived-thread",
        codexTitle: "Archived",
        customTitle: null,
        title: "Archived",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "archive-project",
        projectPath: "/tmp/archive-project",
        sourceId: null,
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
        isArchived: true
      }
    ]);

    const activeThreads = await repository.listThreads({
      scope: "currentProject",
      currentProjectPath: "/tmp/archive-project",
      sourceId: null
    });
    const archivedThreads = await repository.listThreads({
      scope: "currentProject",
      currentProjectPath: "/tmp/archive-project",
      sourceId: null,
      isArchived: true
    });

    expect(activeThreads.map((thread) => thread.id)).toEqual(["active-thread"]);
    expect(archivedThreads.map((thread) => thread.id)).toEqual(["archived-thread"]);
  });

  it("should persist and list thread summaries grouped by project path", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        sessionId: null,
        parentThreadId: null,
        codexTitle: "OpenCodexUI",
        customTitle: null,
        title: "OpenCodexUI",
        preview: "preview",
        model: "gpt-5.5",
        reasoningEffort: "high",
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        sourceId: null,
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z",
        isArchived: false
      }
    ]);

    const threads = await repository.listThreads({
      scope: "currentProject",
      currentProjectPath: "/home/adrien/Projets/Perso/OpenCodexUI"
    });

    expect(threads).toEqual([
      {
        id: "thread-1",
        sessionId: null,
        parentThreadId: null,
        codexTitle: "OpenCodexUI",
        customTitle: null,
        title: "OpenCodexUI",
        preview: "preview",
        model: "gpt-5.5",
        reasoningEffort: "high",
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        sourceId: null,
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z",
        isArchived: false,
        threadSource: null,
        agentNickname: null,
        agentRole: null,
        subAgentSource: null,
        canAcceptDirectInput: null
      }
    ]);
  });

  it("should delete only empty unsynced thread shells", async () => {
    await repository.upsertThreadIndex([
      {
        id: "empty-shell",
        codexTitle: "",
        customTitle: null,
        title: "",
        preview: "",
        model: "gpt-5.5",
        reasoningEffort: "low",
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        sourceId: "source-1",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "real-thread",
        codexTitle: "Real thread",
        customTitle: null,
        title: "Real thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        sourceId: "source-1",
        branchName: "main",
        updatedAt: "2026-01-02T00:00:00.000Z"
      },
      {
        id: "other-source-empty-shell",
        codexTitle: "",
        customTitle: null,
        title: "",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        sourceId: "source-2",
        branchName: "main",
        updatedAt: "2026-01-03T00:00:00.000Z"
      }
    ]);

    const deletedCount = await repository.deleteEmptyUnsyncedThreads(
      "/home/adrien/Projets/Perso/OpenCodexUI",
      "source-1"
    );
    const threads = await repository.listThreads({
      scope: "currentProject",
      currentProjectPath: "/home/adrien/Projets/Perso/OpenCodexUI"
    });

    expect(deletedCount).toBe(1);
    expect(threads.map((thread) => thread.id)).toEqual([
      "other-source-empty-shell",
      "real-thread"
    ]);
  });

  it("should update the local thread title when a chat is renamed", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "Old title",
        customTitle: null,
        title: "Old title",
        preview: "preview",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.updateThreadTitle("thread-1", "Renamed chat");

    const threads = await repository.listThreads({
      scope: "all",
      currentProjectPath: null
    });

    expect(threads[0]).toMatchObject({
      id: "thread-1",
      customTitle: "Renamed chat",
      title: "Renamed chat"
    });
  });

  it("should not replace a renamed title with an empty index title", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "Old title",
        customTitle: null,
        title: "Old title",
        preview: "preview",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.updateThreadTitle("thread-1", "Renamed chat");

    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "",
        customTitle: null,
        title: "",
        preview: "preview",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:01.000Z"
      }
    ]);

    const threads = await repository.listThreads({
      scope: "all",
      currentProjectPath: null
    });

    expect(threads[0]).toMatchObject({
      id: "thread-1",
      customTitle: "Renamed chat",
      title: "Renamed chat"
    });
  });

  it("should not replace a renamed title with the preview fallback", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "Old title",
        customTitle: null,
        title: "Old title",
        preview: "First user message",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.updateThreadTitle("thread-1", "Renamed chat");

    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "First user message",
        customTitle: null,
        title: "First user message",
        preview: "First user message",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: null,
        updatedAt: "2026-01-01T00:00:01.000Z"
      }
    ]);

    const threads = await repository.listThreads({
      scope: "all",
      currentProjectPath: null
    });

    expect(threads[0]).toMatchObject({
      id: "thread-1",
      codexTitle: "First user message",
      customTitle: "Renamed chat",
      title: "Renamed chat"
    });
  });

  it("should keep the custom title when Codex updates its own title", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "Old Codex title",
        customTitle: null,
        title: "Old Codex title",
        preview: "First user message",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.updateThreadTitle("thread-1", "OpenCodex title");
    await repository.updateThreadCodexTitle("thread-1", "First user message");

    const threads = await repository.listThreads({
      scope: "all",
      currentProjectPath: null
    });

    expect(threads[0]).toMatchObject({
      id: "thread-1",
      codexTitle: "First user message",
      customTitle: "OpenCodex title",
      title: "OpenCodex title"
    });
  });
});
