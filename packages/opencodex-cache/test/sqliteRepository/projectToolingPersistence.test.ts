/**
 * Covers persisted project commands, command rules, tasks, and deletion behavior.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../../src/SqliteOpenCodexCacheRepository";
import type { OpenCodexCacheRepository } from "../../src/types";

describe("project tooling persistence", () => {
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

  it("should persist project commands", async () => {
    const project = await repository.upsertProject("/tmp/commands-project");

    const command = await repository.createProjectCommand({
      projectId: project.id,
      name: "Dev",
      command: "npm run dev",
      allowParallel: false,
      persistLogs: true
    });
    const secondCommand = await repository.createProjectCommand({
      projectId: project.id,
      name: "Build",
      command: "npm run build",
      allowParallel: false,
      persistLogs: false
    });

    expect(await repository.listProjectCommands(project.id)).toMatchObject([
      {
        id: command.id,
        projectId: project.id,
        name: "Dev",
        command: "npm run dev",
        allowParallel: false,
        persistLogs: true,
        sortOrder: 0
      },
      {
        id: secondCommand.id,
        projectId: project.id,
        name: "Build",
        command: "npm run build",
        allowParallel: false,
        persistLogs: false,
        sortOrder: 1
      }
    ]);

    const reorderedCommands = await repository.reorderProjectCommands({
      projectId: project.id,
      commandIds: [secondCommand.id, command.id]
    });

    expect(reorderedCommands.map((entry) => entry.id)).toEqual([secondCommand.id, command.id]);
    expect(reorderedCommands.map((entry) => entry.sortOrder)).toEqual([0, 1]);

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

    expect(await repository.listProjectCommands(project.id)).toMatchObject([
      {
        id: secondCommand.id,
        sortOrder: 0
      }
    ]);
  });

  it("should persist project command rules and generated file state", async () => {
    const project = await repository.upsertProject("/tmp/rules-project");

    const rule = await repository.createProjectCommandRule({
      projectId: project.id,
      name: "Project tests",
      pattern: ["uv", "run", "pytest"],
      decision: "allow",
      justification: "Project tests are safe.",
      matchExamples: ["uv run pytest tests -q"],
      notMatchExamples: ["uv run"],
      enabled: true
    });

    expect(await repository.listProjectCommandRules(project.id)).toMatchObject([
      {
        id: rule.id,
        projectId: project.id,
        name: "Project tests",
        pattern: ["uv", "run", "pytest"],
        decision: "allow",
        justification: "Project tests are safe.",
        matchExamples: ["uv run pytest tests -q"],
        notMatchExamples: ["uv run"],
        enabled: true
      }
    ]);

    const updatedRule = await repository.updateProjectCommandRule(rule.id, {
      enabled: false,
      decision: "prompt"
    });

    expect(updatedRule).toMatchObject({
      id: rule.id,
      enabled: false,
      decision: "prompt"
    });

    await repository.saveProjectCommandRuleFileState({
      projectId: project.id,
      generatedHash: "hash-1",
      generatedPath: "/tmp/rules-project/.codex/rules/opencodex-ui.rules",
      updatedAt: "2026-07-13T00:00:00.000Z"
    });

    expect(await repository.getProjectCommandRuleFileState(project.id)).toEqual({
      projectId: project.id,
      generatedHash: "hash-1",
      generatedPath: "/tmp/rules-project/.codex/rules/opencodex-ui.rules",
      updatedAt: "2026-07-13T00:00:00.000Z"
    });

    await repository.deleteProjectCommandRule(rule.id);

    expect(await repository.listProjectCommandRules(project.id)).toHaveLength(0);
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
});
