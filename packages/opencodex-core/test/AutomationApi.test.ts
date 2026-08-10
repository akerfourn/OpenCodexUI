import { describe, expect, it, vi } from "vitest";

import type { ProjectAutomationRuntimeHandler } from "../src/backend/ProjectAutomationRuntimeHandler";
import { AutomationApi, CommandsApi, RulesApi } from "../src/backend/runtime/api/AutomationApi";

describe("automation runtime APIs", () => {
  it("exposes commands under commands and forwards their historical arguments", async () => {
    const listProjectCommands = vi.fn<ProjectAutomationRuntimeHandler["listProjectCommands"]>(async () => []);
    const createProjectCommand = vi.fn<ProjectAutomationRuntimeHandler["createProjectCommand"]>(
      async () => undefined as never
    );
    const updateProjectCommand = vi.fn<ProjectAutomationRuntimeHandler["updateProjectCommand"]>(
      async () => undefined as never
    );
    const reorderProjectCommands = vi.fn<ProjectAutomationRuntimeHandler["reorderProjectCommands"]>(
      async () => []
    );
    const deleteProjectCommand = vi.fn<ProjectAutomationRuntimeHandler["deleteProjectCommand"]>(
      async () => ({ ok: true })
    );
    const runProjectCommand = vi.fn<ProjectAutomationRuntimeHandler["runProjectCommand"]>(
      async () => undefined as never
    );
    const stopProjectCommandRun = vi.fn<ProjectAutomationRuntimeHandler["stopProjectCommandRun"]>(
      async () => ({ ok: true })
    );
    const handler = {
      listProjectCommands,
      createProjectCommand,
      updateProjectCommand,
      reorderProjectCommands,
      deleteProjectCommand,
      runProjectCommand,
      stopProjectCommandRun
    };
    const api = new CommandsApi(handler);

    await api.list("project-1");
    await api.create("project-1", "Build", "npm run build", true, false);
    await api.update("command-1", { persistLogs: true });
    await api.reorder("project-1", ["command-1"]);
    await api.delete("command-1");
    await api.run("command-1", "/workspace/project", "source-1");
    await api.stop("run-1");

    expect(listProjectCommands).toHaveBeenCalledWith("project-1");
    expect(createProjectCommand).toHaveBeenCalledWith(
      "project-1",
      "Build",
      "npm run build",
      true,
      false
    );
    expect(updateProjectCommand).toHaveBeenCalledWith("command-1", { persistLogs: true });
    expect(reorderProjectCommands).toHaveBeenCalledWith("project-1", ["command-1"]);
    expect(deleteProjectCommand).toHaveBeenCalledWith("command-1");
    expect(runProjectCommand).toHaveBeenCalledWith("command-1", "/workspace/project", "source-1");
    expect(stopProjectCommandRun).toHaveBeenCalledWith("run-1");
  });

  it("exposes rules under rules and preserves the default apply behavior", async () => {
    const listProjectRules = vi.fn<ProjectAutomationRuntimeHandler["listProjectRules"]>(async () => undefined as never);
    const createProjectRule = vi.fn<ProjectAutomationRuntimeHandler["createProjectRule"]>(
      async () => undefined as never
    );
    const updateProjectRule = vi.fn<ProjectAutomationRuntimeHandler["updateProjectRule"]>(
      async () => undefined as never
    );
    const deleteProjectRule = vi.fn<ProjectAutomationRuntimeHandler["deleteProjectRule"]>(
      async () => ({ ok: true })
    );
    const applyProjectRules = vi.fn<ProjectAutomationRuntimeHandler["applyProjectRules"]>(
      async () => undefined as never
    );
    const testProjectRules = vi.fn<ProjectAutomationRuntimeHandler["testProjectRules"]>(
      async () => undefined as never
    );
    const restartProjectRules = vi.fn<ProjectAutomationRuntimeHandler["restartProjectRules"]>(
      async () => undefined as never
    );
    const handler = {
      listProjectRules,
      createProjectRule,
      updateProjectRule,
      deleteProjectRule,
      applyProjectRules,
      testProjectRules,
      restartProjectRules
    };
    const api = new RulesApi(handler);

    await api.read("project-1");
    await api.create({
      projectId: "project-1",
      name: "Safe build",
      pattern: ["npm", "run", "build"],
      decision: "allow",
      justification: null
    });
    await api.update("rule-1", { justification: "CI" });
    await api.delete("rule-1");
    await api.apply("project-1");
    await api.apply("project-1", true);
    await api.test("project-1", "npm run build");
    await api.restart("project-1");

    expect(listProjectRules).toHaveBeenCalledWith("project-1");
    expect(createProjectRule).toHaveBeenCalledWith({
      projectId: "project-1",
      name: "Safe build",
      pattern: ["npm", "run", "build"],
      decision: "allow",
      justification: null
    });
    expect(updateProjectRule).toHaveBeenCalledWith("rule-1", { justification: "CI" });
    expect(deleteProjectRule).toHaveBeenCalledWith("rule-1");
    expect(applyProjectRules).toHaveBeenNthCalledWith(1, "project-1", false);
    expect(applyProjectRules).toHaveBeenNthCalledWith(2, "project-1", true);
    expect(testProjectRules).toHaveBeenCalledWith("project-1", "npm run build");
    expect(restartProjectRules).toHaveBeenCalledWith("project-1");
  });

  it("groups command and rule APIs under stable readonly properties", () => {
    const handler = createAutomationHandler();
    const api = new AutomationApi(handler);

    expect(api.commands).toBeInstanceOf(CommandsApi);
    expect(api.rules).toBeInstanceOf(RulesApi);
    expect(api.commands).not.toBe(api.rules);
  });
});

/** Creates the complete handler shape needed by the aggregate API test. */
function createAutomationHandler(): ConstructorParameters<typeof AutomationApi>[0] {
  return {
    listProjectCommands: async () => [],
    createProjectCommand: async () => undefined as never,
    updateProjectCommand: async () => undefined as never,
    reorderProjectCommands: async () => [],
    deleteProjectCommand: async () => ({ ok: true }),
    runProjectCommand: async () => undefined as never,
    stopProjectCommandRun: async () => ({ ok: true }),
    listProjectRules: async () => undefined as never,
    createProjectRule: async () => undefined as never,
    updateProjectRule: async () => undefined as never,
    deleteProjectRule: async () => ({ ok: true }),
    applyProjectRules: async () => undefined as never,
    testProjectRules: async () => undefined as never,
    restartProjectRules: async () => undefined as never,
    getNotificationAdapter: () => ({
      projectCommandService: { handleNotification: async () => undefined }
    })
  };
}
