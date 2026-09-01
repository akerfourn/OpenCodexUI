/**
 * Covers SQLite project persistence, identity, grouping, and activity.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../../src/SqliteOpenCodexCacheRepository";
import type { OpenCodexCacheRepository } from "../../src/types";

describe("project persistence", () => {
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

  it("should persist a mixed project tree and preserve projects when deleting a group", async () => {
    const firstProject = await repository.upsertProject("/tmp/first-project");
    const secondProject = await repository.upsertProject("/tmp/second-project");
    const group = await repository.createProjectGroup({
      name: "Related projects",
      color: "purple"
    });

    expect(group).toMatchObject({
      color: "purple",
      isCollapsed: true
    });

    await repository.assignProjectToGroup(firstProject.id, group.id);
    await repository.assignProjectToGroup(secondProject.id, group.id);

    const groupedSnapshot = await repository.listProjectGroups();
    expect(groupedSnapshot.groups).toHaveLength(1);
    expect(groupedSnapshot.groups[0]).toMatchObject({
      color: "purple",
      isCollapsed: true
    });
    expect(groupedSnapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "project",
          projectId: firstProject.id,
          parentGroupId: group.id
        }),
        expect.objectContaining({
          type: "project",
          projectId: secondProject.id,
          parentGroupId: group.id
        })
      ])
    );

    const updatedGroup = await repository.updateProjectGroup(group.id, {
      color: "teal",
      isCollapsed: false
    });
    expect(updatedGroup).toMatchObject({
      color: "teal",
      isCollapsed: false
    });
    expect((await repository.listProjectGroups()).groups[0]).toMatchObject({
      color: "teal",
      isCollapsed: false
    });

    await repository.deleteProjectGroup(group.id);

    expect((await repository.listProjects()).map((project) => project.id)).toEqual(
      expect.arrayContaining([firstProject.id, secondProject.id])
    );
    expect((await repository.listProjectGroups()).groups).toHaveLength(0);
    expect(
      (await repository.listProjectGroups()).items.filter((item) => item.type === "project")
    ).toHaveLength(2);
  });

  it("should persist projects with the same path per source", async () => {
    const localProject = await repository.upsertProject("/tmp/shared-project", "source-local");
    const remoteProject = await repository.upsertProject("/tmp/shared-project", "source-ssh");

    expect(localProject.id).not.toBe(remoteProject.id);

    const projects = await repository.listProjects();
    const matchingProjects = projects.filter((project) => project.path === "/tmp/shared-project");

    expect(matchingProjects).toHaveLength(2);
    expect(matchingProjects.map((project) => project.sourceId).sort()).toEqual([
      "source-local",
      "source-ssh"
    ]);
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
        referenceTagName: "v1.2.0",
        deferredPaths: ["src/experimental.ts", "notes/"]
      }
    });

    expect(updatedProject?.preferences).toEqual({
      git: {
        referenceTagName: "v1.2.0",
        deferredPaths: ["notes", "src/experimental.ts"]
      }
    });

    const projects = await repository.listProjects();
    const persistedProject = projects.find((entry) => entry.id === project.id);

    expect(persistedProject?.preferences).toEqual({
      git: {
        referenceTagName: "v1.2.0",
        deferredPaths: ["notes", "src/experimental.ts"]
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
            enabled: true,
            permission: "write",
            envFilePermission: "read"
          },
          {
            id: "folder-2",
            path: "/tmp/project-fixtures",
            label: null,
            enabled: false,
            permission: "read",
            envFilePermission: "write"
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
          enabled: true,
          permission: "write",
          envFilePermission: "read"
        },
        {
          id: "folder-2",
          path: "/tmp/project-fixtures",
          label: null,
          enabled: false,
          permission: "read",
          envFilePermission: "deny"
        }
      ],
      lastSyncedAt: null
    });

    const projects = await repository.listProjects();
    const persistedProject = projects.find((entry) => entry.id === project.id);

    expect(persistedProject?.preferences.context?.folders).toHaveLength(2);
  });

  it("should default legacy context preferences to denied env-file access", async () => {
    const project = await repository.upsertProject("/tmp/legacy-project-context");

    const updatedProject = await repository.updateProjectPreferences(project.id, {
      context: {
        folders: [
          {
            id: "folder-1",
            path: "/tmp/project-docs",
            label: null,
            enabled: true
          }
        ],
        lastSyncedAt: null
      }
    });

    expect(updatedProject?.preferences.context?.folders?.[0]).toMatchObject({
      permission: "read",
      envFilePermission: "deny"
    });
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

  it("should use the latest cached turn timestamp for project activity", async () => {
    await repository.upsertThreadIndex([
      {
        id: "dated-thread",
        codexTitle: "Dated",
        customTitle: null,
        title: "Dated",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "dated-project",
        projectPath: "/tmp/dated-project",
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.saveThreadSnapshot({
      thread: {
        id: "dated-thread",
        codexTitle: "Dated",
        customTitle: null,
        title: "Dated",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "dated-project",
        projectPath: "/tmp/dated-project",
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      turns: [
        {
          id: "dated-turn",
          startedAt: "2026-03-01T00:00:00.000Z",
          completedAt: "2026-03-01T00:00:05.000Z",
          items: []
        }
      ],
      syncState: {
        threadId: "dated-thread",
        newestTurnId: "dated-turn",
        oldestTurnId: "dated-turn",
        olderCursor: null,
        hasLoadedLatest: true,
        hasLoadedAllOlderTurns: true,
        lastSyncedAt: "2026-03-01T00:00:05.000Z"
      },
      tokenUsage: null
    });

    const project = (await repository.listProjects()).find(
      (entry) => entry.path === "/tmp/dated-project"
    );
    expect(project?.editedAt).toBe("2026-03-01T00:00:05.000Z");
  });

  it("should keep orphan and source-scoped projects separate for the same path", async () => {
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
    const matchingProjects = projects.filter((entry) => entry.path === "/tmp/source-project");

    expect(matchingProjects).toHaveLength(2);
    expect(matchingProjects.map((project) => project.sourceId).sort()).toEqual([
      source.id,
      null
    ].sort());
  });

  it("should remove an empty orphan duplicate when a source project exists", async () => {
    const source = await repository.ensureDefaultSource();
    const projectPath = "/tmp/redundant-orphan-project";

    await repository.upsertProject(projectPath, source.id);
    const orphanProject = await repository.upsertProject(projectPath, null);

    const removedCount = await repository.deleteRedundantOrphanProjects();
    const projects = await repository.listProjects();

    expect(removedCount).toBe(1);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.id).not.toBe(orphanProject.id);
    expect(projects[0]?.sourceId).toBe(source.id);
  });

  it("should preserve an orphan duplicate that still owns a thread", async () => {
    const source = await repository.ensureDefaultSource();
    const projectPath = "/tmp/orphan-project-with-thread";

    await repository.upsertProject(projectPath, source.id);
    await repository.upsertThreadIndex([
      {
        id: "orphan-thread",
        codexTitle: "Orphan thread",
        customTitle: null,
        title: "Orphan thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "orphan-project-with-thread",
        projectPath,
        sourceId: null,
        branchName: null,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    const removedCount = await repository.deleteRedundantOrphanProjects();
    const projects = await repository.listProjects();

    expect(removedCount).toBe(0);
    expect(projects.filter((project) => project.path === projectPath)).toHaveLength(2);
  });

  it("should preserve an orphan duplicate with a custom display name", async () => {
    const source = await repository.ensureDefaultSource();
    const projectPath = "/tmp/customized-orphan-project";

    await repository.upsertProject(projectPath, source.id);
    const orphanProject = await repository.upsertProject(projectPath, null);
    await repository.updateProjectDisplayName(orphanProject.id, "Projet conservé");

    const removedCount = await repository.deleteRedundantOrphanProjects();
    const projects = await repository.listProjects();

    expect(removedCount).toBe(0);
    expect(projects.find((project) => project.id === orphanProject.id)?.displayName)
      .toBe("Projet conservé");
  });
});
