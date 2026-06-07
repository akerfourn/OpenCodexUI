/**
 * Covers SQLite cache persistence for thread lists, turns, pagination, and titles.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../src/SqliteOpenCodexCacheRepository";
import { parseTurnRows } from "../src/sqlite/turnSerialization";
import type { OpenCodexCacheRepository } from "../src/types";

describe("SqliteOpenCodexCacheRepository", () => {
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

  it("should persist projects independently from threads", async () => {
    const project = await repository.upsertProject("/home/adrien/Projets/Perso/OpenCodexUI");

    expect(project).toMatchObject({
      path: "/home/adrien/Projets/Perso/OpenCodexUI",
      defaultName: "OpenCodexUI",
      displayName: null
    });

    await repository.upsertProject("/home/adrien/Projets/Perso/OpenCodexUI");
    const projects = await repository.listProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: project.id,
      path: "/home/adrien/Projets/Perso/OpenCodexUI",
      defaultName: "OpenCodexUI",
      displayName: null,
      editedAt: project.createdAt
    });
  });

  it("should update project visibility", async () => {
    const project = await repository.upsertProject("/tmp/hidden-project");

    await repository.setProjectHidden(project.id, true);

    const hiddenProjects = await repository.listProjects();
    const hiddenProject = hiddenProjects.find((entry) => entry.id === project.id);

    expect(hiddenProject?.isHidden).toBe(true);

    await repository.setProjectHidden(project.id, false);

    const visibleProjects = await repository.listProjects();
    const visibleProject = visibleProjects.find((entry) => entry.id === project.id);

    expect(visibleProject?.isHidden).toBe(false);
  });

  it("should persist project preferences", async () => {
    const project = await repository.upsertProject("/tmp/project-preferences");

    const updatedProject = await repository.updateProjectPreferences(project.id, {
      git: {
        referenceTagName: "v1.2.0"
      }
    });

    expect(updatedProject?.preferences).toEqual({
      git: {
        referenceTagName: "v1.2.0"
      }
    });

    const projects = await repository.listProjects();
    const persistedProject = projects.find((entry) => entry.id === project.id);

    expect(persistedProject?.preferences).toEqual({
      git: {
        referenceTagName: "v1.2.0"
      }
    });
  });

  it("should persist project context folder preferences", async () => {
    const project = await repository.upsertProject("/tmp/project-context");

    const updatedProject = await repository.updateProjectPreferences(project.id, {
      context: {
        permissionsProfileId: "opencodex-context",
        folders: [
          {
            id: "folder-1",
            path: "/tmp/project-docs",
            label: "Docs",
            enabled: true
          },
          {
            id: "folder-2",
            path: "/tmp/project-fixtures",
            label: null,
            enabled: false
          }
        ],
        lastSyncedAt: null
      }
    });

    expect(updatedProject?.preferences.context).toEqual({
      permissionsProfileId: "opencodex-context",
      folders: [
        {
          id: "folder-1",
          path: "/tmp/project-docs",
          label: "Docs",
          enabled: true
        },
        {
          id: "folder-2",
          path: "/tmp/project-fixtures",
          label: null,
          enabled: false
        }
      ],
      lastSyncedAt: null
    });

    const projects = await repository.listProjects();
    const persistedProject = projects.find((entry) => entry.id === project.id);

    expect(persistedProject?.preferences.context?.folders).toHaveLength(2);
  });

  it("should persist the latest thread token usage", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-usage",
        codexTitle: "Usage",
        customTitle: null,
        title: "Usage",
        preview: "",
        model: "gpt-5.5",
        reasoningEffort: "medium",
        projectName: "OpenCodexUI",
        projectPath: "/tmp/thread-usage-project",
        sourceId: null,
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z",
        isArchived: false
      }
    ]);

    await repository.saveThreadTokenUsage({
      threadId: "thread-usage",
      turnId: "turn-1",
      total: {
        totalTokens: 2_500,
        inputTokens: 2_000,
        cachedInputTokens: 500,
        outputTokens: 400,
        reasoningOutputTokens: 100
      },
      last: {
        totalTokens: 500,
        inputTokens: 300,
        cachedInputTokens: 100,
        outputTokens: 150,
        reasoningOutputTokens: 50
      },
      contextWindowTokens: 500,
      modelContextWindow: 10_000,
      usedPercent: 5
    });

    const snapshot = await repository.getThread("thread-usage");

    expect(snapshot?.tokenUsage).toMatchObject({
      threadId: "thread-usage",
      turnId: "turn-1",
      modelContextWindow: 10_000,
      contextWindowTokens: 500,
      usedPercent: 5,
      total: {
        totalTokens: 2_500
      }
    });
  });

  it("should persist project commands", async () => {
    const project = await repository.upsertProject("/tmp/commands-project");

    const command = await repository.createProjectCommand({
      projectId: project.id,
      name: "Dev",
      command: "npm run dev",
      allowParallel: false,
      persistLogs: true
    });

    expect(await repository.listProjectCommands(project.id)).toMatchObject([
      {
        id: command.id,
        projectId: project.id,
        name: "Dev",
        command: "npm run dev",
        allowParallel: false,
        persistLogs: true
      }
    ]);

    const updatedCommand = await repository.updateProjectCommand(command.id, {
      name: "Dev server",
      allowParallel: true
    });

    expect(updatedCommand).toMatchObject({
      id: command.id,
      name: "Dev server",
      command: "npm run dev",
      allowParallel: true,
      persistLogs: true
    });

    await repository.deleteProjectCommand(command.id);

    expect(await repository.listProjectCommands(project.id)).toHaveLength(0);
  });

  it("should persist local project tasks", async () => {
    const project = await repository.upsertProject("/tmp/tasks-project");

    const task = await repository.createProjectTask({
      projectId: project.id,
      title: "Write release notes",
      description: "Draft the markdown release notes before publishing.",
      status: "todo"
    });

    expect(await repository.listProjectTasks(project.id)).toMatchObject([
      {
        id: task.id,
        projectId: project.id,
        title: "Write release notes",
        description: "Draft the markdown release notes before publishing.",
        status: "todo"
      }
    ]);

    const updatedTask = await repository.updateProjectTask(task.id, {
      title: "Review release notes",
      status: "toValidate"
    });

    expect(updatedTask).toMatchObject({
      id: task.id,
      projectId: project.id,
      title: "Review release notes",
      description: "Draft the markdown release notes before publishing.",
      status: "toValidate"
    });

    await repository.deleteProjectTask(task.id);

    expect(await repository.listProjectTasks(project.id)).toHaveLength(0);
  });

  it("should delete a cached project without deleting its threads", async () => {
    const project = await repository.upsertProject("/tmp/deleted-project");
    await repository.createProjectCommand({
      projectId: project.id,
      name: "Dev",
      command: "npm run dev",
      allowParallel: false,
      persistLogs: false
    });
    await repository.createProjectTask({
      projectId: project.id,
      title: "Local task",
      description: "",
      status: "todo"
    });
    await repository.upsertThreadIndex([
      {
        id: "deleted-project-thread",
        codexTitle: "Deleted project thread",
        customTitle: null,
        title: "Deleted project thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "deleted-project",
        projectPath: "/tmp/deleted-project",
        sourceId: null,
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.deleteProject(project.id);

    const projects = await repository.listProjects();
    const threads = await repository.listThreads({
      scope: "currentProject",
      currentProjectPath: "/tmp/deleted-project",
      sourceId: null
    });

    expect(projects.some((entry) => entry.id === project.id)).toBe(false);
    expect(await repository.listProjectCommands(project.id)).toHaveLength(0);
    expect(await repository.listProjectTasks(project.id)).toHaveLength(0);
    expect(threads).toMatchObject([
      {
        id: "deleted-project-thread",
        projectPath: "/tmp/deleted-project",
        projectName: null
      }
    ]);
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

  it("should keep projects hidden when the synced path is unavailable", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "Hidden",
        customTitle: null,
        title: "Hidden",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "hidden-project",
        projectPath: "/tmp/hidden-project",
        projectHidden: true,
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.upsertThreadIndex([
      {
        id: "thread-2",
        codexTitle: "Visible",
        customTitle: null,
        title: "Visible",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "hidden-project",
        projectPath: "/tmp/hidden-project",
        projectHidden: false,
        branchName: null,
        updatedAt: "2026-01-02T00:00:00.000Z"
      }
    ]);

    const projects = await repository.listProjects();
    const project = projects.find((entry) => entry.path === "/tmp/hidden-project");

    expect(project?.isHidden).toBe(true);
  });

  it("should store source-specific configuration in settings", async () => {
    const source = await repository.ensureDefaultSource();

    await repository.updateSource(source.id, {
      settings: {
        commandMode: "custom",
        command: "wsl.exe codex"
      }
    });

    const updatedSource = await repository.getSource(source.id);

    expect(updatedSource).toMatchObject({
      id: source.id,
      kind: "local",
      settings: {
        commandMode: "custom",
        command: "wsl.exe codex"
      }
    });
  });

  it("should persist source colors in settings", async () => {
    const source = await repository.ensureDefaultSource();

    expect(source.settings.color).toBe("blue");

    await repository.updateSource(source.id, {
      settings: {
        color: "teal"
      }
    });

    const updatedSource = await repository.getSource(source.id);

    expect(updatedSource).toMatchObject({
      id: source.id,
      settings: {
        color: "teal"
      }
    });
  });

  it("should persist the latest Codex detection for a source", async () => {
    const source = await repository.ensureDefaultSource();

    await repository.updateSourceCodexDetection(source.id, {
      version: "codex-cli 0.130.0",
      checkedAt: "2026-06-01T12:00:00.000Z",
      error: null
    });

    const detectedSource = await repository.getSource(source.id);

    expect(detectedSource).toMatchObject({
      id: source.id,
      lastDetectedCodexVersion: "codex-cli 0.130.0",
      lastDetectedCodexAt: "2026-06-01T12:00:00.000Z",
      lastDetectionError: null
    });
  });

  it("should create the automatic default source with a generated id", async () => {
    const source = await repository.ensureDefaultSource();
    const sameSource = await repository.ensureDefaultSource();

    expect(source.id).not.toBe("default");
    expect(sameSource.id).toBe(source.id);
  });

  it("should order projects by latest thread update", async () => {
    await repository.upsertProject("/tmp/older");
    await repository.upsertProject("/tmp/recent");
    await repository.upsertThreadIndex([
      {
        id: "older-thread",
        codexTitle: "Older",
        customTitle: null,
        title: "Older",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "older",
        projectPath: "/tmp/older",
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "recent-thread",
        codexTitle: "Recent",
        customTitle: null,
        title: "Recent",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "recent",
        projectPath: "/tmp/recent",
        branchName: null,
        updatedAt: "2026-02-01T00:00:00.000Z"
      }
    ]);

    const projects = await repository.listProjects();

    expect(projects.map((project) => project.path)).toEqual([
      "/tmp/recent",
      "/tmp/older"
    ]);
    expect(projects[0]?.editedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(projects[1]?.editedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("should preserve source associations when caching an orphan project", async () => {
    const source = await repository.ensureDefaultSource();

    await repository.upsertThreadIndex([
      {
        id: "source-thread",
        codexTitle: "Source thread",
        customTitle: null,
        title: "Source thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "source-project",
        projectPath: "/tmp/source-project",
        sourceId: source.id,
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.upsertProject("/tmp/source-project", null);

    const projects = await repository.listProjects();
    const project = projects.find((entry) => entry.path === "/tmp/source-project");

    expect(project?.sourceId).toBe(source.id);
  });

  it("should clear source associations explicitly", async () => {
    const source = await repository.ensureDefaultSource();

    await repository.upsertThreadIndex([
      {
        id: "source-thread",
        codexTitle: "Source thread",
        customTitle: null,
        title: "Source thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "source-project",
        projectPath: "/tmp/source-project",
        sourceId: source.id,
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.clearSourceAssociations(source.id);

    const projects = await repository.listProjects();
    const project = projects.find((entry) => entry.path === "/tmp/source-project");
    const sourceThreads = await repository.listThreads({
      scope: "currentProject",
      currentProjectPath: "/tmp/source-project",
      sourceId: source.id
    });
    const orphanThreads = await repository.listThreads({
      scope: "currentProject",
      currentProjectPath: "/tmp/source-project",
      sourceId: null
    });

    expect(project?.sourceId).toBeNull();
    expect(sourceThreads).toHaveLength(0);
    expect(orphanThreads).toHaveLength(1);
    expect(orphanThreads[0]?.sourceId).toBeNull();
  });

  it("should count and delete sources", async () => {
    const source = await repository.createSource("WSL");

    await repository.upsertThreadIndex([
      {
        id: "source-thread",
        codexTitle: "Source thread",
        customTitle: null,
        title: "Source thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "source-project",
        projectPath: "/tmp/source-project",
        sourceId: source.id,
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    expect(await repository.getSourceProjectCount(source.id)).toBe(1);

    await repository.clearSourceAssociations(source.id);
    await repository.deleteSource(source.id);

    expect(await repository.getSource(source.id)).toBeNull();
    expect(await repository.getSourceProjectCount(source.id)).toBe(0);
  });

  it("should persist and list thread summaries grouped by project path", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-1",
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

  it("should persist turns without storing the UI message projection", async () => {
    await repository.saveThreadSnapshot({
      thread: {
        id: "thread-1",
        codexTitle: "Thread",
        customTitle: null,
        title: "Thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      turns: [
        {
          id: "turn-1",
          startedAt: "2026-01-01T00:00:00.000Z",
          items: [
            {
              type: "userMessage",
              id: "user-1",
              content: [{ type: "text", text: "Bonjour" }]
            }
          ]
        }
      ],
      syncState: {
        threadId: "thread-1",
        newestTurnId: "turn-1",
        oldestTurnId: "turn-1",
        olderCursor: null,
        hasLoadedLatest: true,
        hasLoadedAllOlderTurns: true,
        lastSyncedAt: "2026-01-01T00:00:01.000Z"
      },
      tokenUsage: null
    });

    const snapshot = await repository.getThread("thread-1");

    expect(snapshot).toMatchObject({
      thread: {
        id: "thread-1",
        projectName: "OpenCodexUI"
      },
      turns: [
        {
          id: "turn-1",
          items: [
            {
              type: "userMessage",
              id: "user-1"
            }
          ]
        }
      ],
      syncState: {
        hasLoadedLatest: true,
        hasLoadedAllOlderTurns: true
      }
    });
  });

  it("should read only the latest cached turns when a limit is provided", async () => {
    await repository.saveThreadSnapshot({
      thread: {
        id: "thread-1",
        codexTitle: "Thread",
        customTitle: null,
        title: "Thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      turns: [
        { id: "turn-1", startedAt: "2026-01-01T00:00:00.000Z", items: [] },
        { id: "turn-2", startedAt: "2026-01-01T00:00:01.000Z", items: [] },
        { id: "turn-3", startedAt: "2026-01-01T00:00:02.000Z", items: [] }
      ],
      syncState: {
        threadId: "thread-1",
        newestTurnId: "turn-3",
        oldestTurnId: "turn-1",
        olderCursor: null,
        hasLoadedLatest: true,
        hasLoadedAllOlderTurns: true,
        lastSyncedAt: "2026-01-01T00:00:03.000Z"
      },
      tokenUsage: null
    });

    const snapshot = await repository.getThread("thread-1", { latestTurnLimit: 2 });

    expect(snapshot?.turns).toMatchObject([
      { id: "turn-2" },
      { id: "turn-3" }
    ]);
    expect(snapshot?.syncState.hasLoadedAllOlderTurns).toBe(false);
    expect(snapshot?.syncState.olderCursor).toBe("cache:turn-2");
  });

  it("should sort numeric Codex turn timestamps when reading latest turns", async () => {
    await repository.saveThreadSnapshot({
      thread: {
        id: "thread-1",
        codexTitle: "Thread",
        customTitle: null,
        title: "Thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      turns: [
        { id: "turn-1", startedAt: 1, items: [] },
        { id: "turn-2", startedAt: 2, items: [] },
        { id: "turn-3", startedAt: 3, items: [] }
      ],
      syncState: {
        threadId: "thread-1",
        newestTurnId: "turn-3",
        oldestTurnId: "turn-1",
        olderCursor: null,
        hasLoadedLatest: true,
        hasLoadedAllOlderTurns: true,
        lastSyncedAt: "2026-01-01T00:00:03.000Z"
      },
      tokenUsage: null
    });

    const snapshot = await repository.getThread("thread-1", { latestTurnLimit: 2 });

    expect(snapshot?.turns).toMatchObject([
      { id: "turn-2" },
      { id: "turn-3" }
    ]);
  });

  it("should read older cached turns before a known turn", async () => {
    await repository.saveThreadSnapshot({
      thread: {
        id: "thread-1",
        codexTitle: "Thread",
        customTitle: null,
        title: "Thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      turns: [
        { id: "turn-1", startedAt: "2026-01-01T00:00:00.000Z", items: [] },
        { id: "turn-2", startedAt: "2026-01-01T00:00:01.000Z", items: [] },
        { id: "turn-3", startedAt: "2026-01-01T00:00:02.000Z", items: [] }
      ],
      syncState: {
        threadId: "thread-1",
        newestTurnId: "turn-3",
        oldestTurnId: "turn-1",
        olderCursor: null,
        hasLoadedLatest: true,
        hasLoadedAllOlderTurns: true,
        lastSyncedAt: "2026-01-01T00:00:03.000Z"
      },
      tokenUsage: null
    });

    const result = await repository.getOlderTurns({
      threadId: "thread-1",
      beforeTurnId: "turn-3",
      limit: 1
    });

    expect(result.turns).toMatchObject([{ id: "turn-2" }]);
    expect(result.hasMoreOlderTurns).toBe(true);
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
        branchName: "main",
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

describe("turn serialization", () => {
  it("should drop duplicate chat items with different live and history ids", () => {
    const turns = parseTurnRows([
      {
        id: "turn-1",
        raw_json: JSON.stringify({
          id: "turn-1",
          items: [
            { id: "uuid-user", type: "userMessage", content: [{ type: "text", text: "Hello" }] },
            { id: "item-1", type: "userMessage", content: [{ type: "text", text: "Hello" }] },
            { id: "msg-final", type: "agentMessage", text: "Done", phase: "final_answer" },
            { id: "item-2", type: "agentMessage", text: "Done", phase: "final_answer" }
          ]
        })
      }
    ]);

    expect(turns).toMatchObject([
      {
        id: "turn-1",
        items: [
          { id: "uuid-user" },
          { id: "msg-final" }
        ]
      }
    ]);
  });
});
