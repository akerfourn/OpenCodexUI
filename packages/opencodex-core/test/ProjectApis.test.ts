import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import type { ProjectRuntimeHandler } from "../src/backend/ProjectRuntimeHandler";
import {
  CodexUpdatesApi,
  GroupsApi,
  ProjectContextApi,
  ProjectTasksApi,
  ProjectTrustApi,
  ProjectsApi,
  SourcesApi
} from "../src/backend/runtime/api/ProjectApis";

describe("project runtime APIs", () => {
  it("maps project operations to their historical handler methods", async () => {
    const project = createProject();
    const listProjects = vi.fn<ProjectRuntimeHandler["listProjects"]>(async () => [project]);
    const setProjectHidden = vi.fn<ProjectRuntimeHandler["setProjectHidden"]>(async () => ({ ok: true }));
    const updateProjectDisplayName = vi.fn<ProjectRuntimeHandler["updateProjectDisplayName"]>(
      async () => project
    );
    const updateProjectPreferences = vi.fn<ProjectRuntimeHandler["updateProjectPreferences"]>(
      async () => project
    );
    const deleteProject = vi.fn<ProjectRuntimeHandler["deleteProject"]>(async () => ({ ok: true }));
    const openProject = vi.fn<ProjectRuntimeHandler["openProject"]>(async () => project);
    const pickProjectDirectory = vi.fn<ProjectRuntimeHandler["pickProjectDirectory"]>(async () => project);
    const readProjectStatistics = vi.fn<ProjectRuntimeHandler["readProjectStatistics"]>(async () => ({
      chatCount: 1,
      chatsWithTokenUsage: 1,
      chatsWithoutTokenUsage: 0,
      tokenUsage: {
        totalTokens: 1,
        inputTokens: 1,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0
      }
    }));
    const api = new ProjectsApi({
      listProjects,
      setProjectHidden,
      updateProjectDisplayName,
      updateProjectPreferences,
      deleteProject,
      openProject,
      pickProjectDirectory,
      readProjectStatistics
    });

    await expect(api.list()).resolves.toEqual([project]);
    await api.setHidden("project-1", true);
    await api.setDisplayName("project-1", null);
    await api.updatePreferences("project-1", { git: { referenceTagName: "v1" } });
    await api.delete("project-1");
    await api.open("/workspace/project", "source-1", false);
    await api.pickDirectory("create", null);
    await api.readStatistics("/workspace/project", "source-1");

    expect(setProjectHidden).toHaveBeenCalledWith("project-1", true);
    expect(updateProjectDisplayName).toHaveBeenCalledWith("project-1", null);
    expect(updateProjectPreferences).toHaveBeenCalledWith("project-1", {
      git: { referenceTagName: "v1" }
    });
    expect(deleteProject).toHaveBeenCalledWith("project-1");
    expect(openProject).toHaveBeenCalledWith("/workspace/project", "source-1", false);
    expect(pickProjectDirectory).toHaveBeenCalledWith("create", null);
    expect(readProjectStatistics).toHaveBeenCalledWith("/workspace/project", "source-1");
  });

  it("keeps resource-scoped names and forwards source, group, context, task, trust, and update arguments", async () => {
    const listSources = vi.fn<ProjectRuntimeHandler["listSources"]>(async () => []);
    const createSource = vi.fn<ProjectRuntimeHandler["createSource"]>(async () => undefined as never);
    const syncSources = vi.fn<ProjectRuntimeHandler["syncSources"]>(async () => []);
    const deleteSource = vi.fn<ProjectRuntimeHandler["deleteSource"]>(async () => ({ ok: true }));
    const updateSource = vi.fn<ProjectRuntimeHandler["updateSource"]>(async () => undefined as never);
    const sources = new SourcesApi({
      listSources,
      createSource,
      syncSources,
      deleteSource,
      updateSource
    });

    await sources.list();
    await sources.create("Local", "local", { commandMode: "auto" });
    await sources.sync(null);
    await sources.delete("source-1");
    await sources.update("source-1", { name: "Renamed" });

    expect(createSource).toHaveBeenCalledWith("Local", "local", { commandMode: "auto" });
    expect(syncSources).toHaveBeenCalledWith(null);
    expect(deleteSource).toHaveBeenCalledWith("source-1");
    expect(updateSource).toHaveBeenCalledWith("source-1", { name: "Renamed" });

    const listProjectGroups = vi.fn<ProjectRuntimeHandler["listProjectGroups"]>(async () => ({
      groups: [],
      items: []
    }));
    const createProjectGroup = vi.fn<ProjectRuntimeHandler["createProjectGroup"]>(async () => ({
      groups: [],
      items: []
    }));
    const updateProjectGroup = vi.fn<ProjectRuntimeHandler["updateProjectGroup"]>(async () => ({
      groups: [],
      items: []
    }));
    const deleteProjectGroup = vi.fn<ProjectRuntimeHandler["deleteProjectGroup"]>(async () => ({
      groups: [],
      items: []
    }));
    const assignProjectToGroup = vi.fn<ProjectRuntimeHandler["assignProjectToGroup"]>(async () => ({
      groups: [],
      items: []
    }));
    const groups = new GroupsApi({
      listProjectGroups,
      createProjectGroup,
      updateProjectGroup,
      deleteProjectGroup,
      assignProjectToGroup
    });

    await groups.list();
    await groups.create("Work");
    await groups.update("group-1", { isCollapsed: true });
    await groups.delete("group-1");
    await groups.assignProject("project-1", null);

    expect(createProjectGroup).toHaveBeenCalledWith("Work", null, "blue");
    expect(updateProjectGroup).toHaveBeenCalledWith("group-1", { isCollapsed: true });
    expect(deleteProjectGroup).toHaveBeenCalledWith("group-1");
    expect(assignProjectToGroup).toHaveBeenCalledWith("project-1", null);

    const syncProjectContext = vi.fn<ProjectRuntimeHandler["syncProjectContext"]>(async () => createProject());
    const pickProjectContextFolder = vi.fn<ProjectRuntimeHandler["pickProjectContextFolder"]>(
      async () => "/workspace/context"
    );
    const context = new ProjectContextApi({ syncProjectContext, pickProjectContextFolder });
    await context.sync("project-1");
    await context.pickFolder();
    expect(syncProjectContext).toHaveBeenCalledWith("project-1");
    expect(pickProjectContextFolder).toHaveBeenCalledWith();

    const listProjectTasks = vi.fn<ProjectRuntimeHandler["listProjectTasks"]>(async () => []);
    const createProjectTask = vi.fn<ProjectRuntimeHandler["createProjectTask"]>(async () => undefined as never);
    const updateProjectTask = vi.fn<ProjectRuntimeHandler["updateProjectTask"]>(async () => undefined as never);
    const deleteProjectTask = vi.fn<ProjectRuntimeHandler["deleteProjectTask"]>(async () => ({ ok: true }));
    const tasks = new ProjectTasksApi({
      listProjectTasks,
      createProjectTask,
      updateProjectTask,
      deleteProjectTask
    });
    await tasks.list("project-1");
    await tasks.create("project-1", "Build", "Run checks", "todo");
    await tasks.update("task-1", { status: "done" });
    await tasks.delete("task-1");
    expect(createProjectTask).toHaveBeenCalledWith("project-1", "Build", "Run checks", "todo");
    expect(updateProjectTask).toHaveBeenCalledWith("task-1", { status: "done" });
    expect(deleteProjectTask).toHaveBeenCalledWith("task-1");

    const trustProject = vi.fn<ProjectRuntimeHandler["trustProject"]>(async () => ({ ok: true }));
    const dismissProjectTrustRequest = vi.fn<ProjectRuntimeHandler["dismissProjectTrustRequest"]>();
    const trust = new ProjectTrustApi({ trustProject, dismissProjectTrustRequest });
    await trust.grant("/workspace/project");
    trust.dismiss("/workspace/project");
    expect(trustProject).toHaveBeenCalledWith("/workspace/project");
    expect(dismissProjectTrustRequest).toHaveBeenCalledWith("/workspace/project");

    const checkCodexRelease = vi.fn<ProjectRuntimeHandler["checkCodexRelease"]>(async () => undefined as never);
    const updateCodexSource = vi.fn<ProjectRuntimeHandler["updateCodexSource"]>(async () => []);
    const updates = new CodexUpdatesApi({ checkCodexRelease, updateCodexSource });
    await updates.checkRelease(true);
    await updates.applyToSource("source-1");
    expect(checkCodexRelease).toHaveBeenCalledWith(true);
    expect(updateCodexSource).toHaveBeenCalledWith("source-1");
  });
});

/** Creates a complete project value for facade forwarding tests. */
function createProject(): OpenCodexProject {
  return {
    id: "project-1",
    sourceId: "source-1",
    path: "/workspace/project",
    defaultName: "project",
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    editedAt: "2026-01-01T00:00:00.000Z"
  };
}
