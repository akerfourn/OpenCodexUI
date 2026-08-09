import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  CachedProject,
  CachedProjectCommand,
  CachedProjectCommandCreateInput,
  CachedProjectCommandRule,
  CachedProjectCommandRuleCreateInput,
  CachedProjectCommandRuleUpdateInput,
  CachedProjectCommandUpdateInput,
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexProjectCommand,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import {
  ProjectAutomationRuntimeHandler,
  type ProjectAutomationRuntimeHandlerOptions
} from "../src/backend/ProjectAutomationRuntimeHandler";

describe("ProjectAutomationRuntimeHandler", () => {
  it("should construct without a cache and preserve a stable notification adapter", async () => {
    const handler = createHandler();

    await expect(handler.listProjectCommands("project-1"))
      .rejects.toThrowError("Project command persistence is unavailable.");
    await expect(handler.listProjectRules("project-1"))
      .rejects.toThrowError("Project command rule persistence is unavailable.");

    const firstAdapter = handler.getNotificationAdapter();
    const secondAdapter = handler.getNotificationAdapter();
    expect(firstAdapter).toBe(secondAdapter);
    expect(firstAdapter.projectCommandService).toBe(secondAdapter.projectCommandService);
  });

  it("should preserve project-command CRUD payloads and responses", async () => {
    const command = createCommand("command-1");
    const listProjectCommands = vi.fn(async (): Promise<CachedProjectCommand[]> => [command]);
    const createProjectCommand = vi.fn(async (
      input: CachedProjectCommandCreateInput
    ): Promise<CachedProjectCommand> => ({ ...command, ...input }));
    const updateProjectCommand = vi.fn(async (
      commandId: string,
      patch: CachedProjectCommandUpdateInput
    ): Promise<CachedProjectCommand> => ({ ...command, id: commandId, ...patch }));
    const reorderProjectCommands = vi.fn(async (): Promise<CachedProjectCommand[]> => [command]);
    const deleteProjectCommand = vi.fn(async (): Promise<void> => undefined);
    const handler = createHandler({
      cache: createRepository({
        listProjectCommands,
        createProjectCommand,
        updateProjectCommand,
        reorderProjectCommands,
        deleteProjectCommand
      })
    });

    await expect(handler.listProjectCommands("project-1")).resolves.toEqual([command]);
    await expect(handler.createProjectCommand(
      "project-1",
      "Build",
      "npm run build",
      true,
      false
    )).resolves.toMatchObject({
      projectId: "project-1",
      name: "Build",
      command: "npm run build",
      allowParallel: true,
      persistLogs: false
    });

    const patch: CachedProjectCommandUpdateInput = {
      command: "npm run check",
      persistLogs: true
    };
    await expect(handler.updateProjectCommand("command-1", patch))
      .resolves.toMatchObject({ id: "command-1", ...patch });
    await expect(handler.reorderProjectCommands("project-1", ["command-1"]))
      .resolves.toEqual([command]);
    await expect(handler.deleteProjectCommand("command-1")).resolves.toEqual({ ok: true });
    await expect(handler.stopProjectCommandRun("run-1")).resolves.toEqual({ ok: true });

    expect(listProjectCommands).toHaveBeenCalledWith("project-1");
    expect(createProjectCommand).toHaveBeenCalledWith({
      projectId: "project-1",
      name: "Build",
      command: "npm run build",
      allowParallel: true,
      persistLogs: false
    });
    expect(updateProjectCommand).toHaveBeenCalledWith("command-1", patch);
    expect(reorderProjectCommands).toHaveBeenCalledWith({
      projectId: "project-1",
      commandIds: ["command-1"]
    });
    expect(deleteProjectCommand).toHaveBeenCalledWith("command-1");
  });

  it("should resolve the project source before reading rules and preserve rule CRUD", async () => {
    const source = createSource("source-1");
    const project = createProject("project-1", source.id);
    const rule = createRule("rule-1", project.id);
    const listProjects = vi.fn(async (): Promise<CachedProject[]> => [project]);
    const listProjectCommandRules = vi.fn(async (): Promise<CachedProjectCommandRule[]> => [rule]);
    const getProjectCommandRuleFileState = vi.fn(async () => null);
    const createProjectCommandRule = vi.fn(async (
      input: CachedProjectCommandRuleCreateInput
    ): Promise<CachedProjectCommandRule> => ({ ...rule, ...input }));
    const updateProjectCommandRule = vi.fn(async (
      ruleId: string,
      patch: CachedProjectCommandRuleUpdateInput
    ): Promise<CachedProjectCommandRule> => ({ ...rule, id: ruleId, ...patch }));
    const deleteProjectCommandRule = vi.fn(async (): Promise<void> => undefined);
    const resolveSource = vi.fn(async (): Promise<CachedSource> => source);
    const readFile = vi.fn(async () => {
      throw new Error("file not found");
    });
    const handler = createHandler({
      cache: createRepository({
        listProjects,
        listProjectCommandRules,
        getProjectCommandRuleFileState,
        createProjectCommandRule,
        updateProjectCommandRule,
        deleteProjectCommandRule
      }),
      projects: { resolveSource },
      clients: {
        ensureClient: async () => ({ readFile } as unknown as CodexAppServerClient),
        restartClient: async () => undefined
      }
    });

    const snapshot = await handler.listProjectRules(project.id);
    expect(snapshot.rules).toEqual([expect.objectContaining({ id: rule.id })]);
    expect(snapshot.status).toEqual(expect.objectContaining({
      projectId: project.id,
      sourceId: source.id,
      fileStatus: "notGenerated"
    }));
    expect(resolveSource).toHaveBeenCalledWith(source.id);
    expect(readFile).toHaveBeenCalledWith(
      `${project.path}/.codex/rules/opencodex-ui.rules`
    );

    const createInput: CachedProjectCommandRuleCreateInput = {
      projectId: project.id,
      name: "Allow build",
      pattern: ["npm", "run", "build"],
      decision: "allow",
      justification: "Builds are safe.",
      matchExamples: ["npm run build"],
      notMatchExamples: ["npm run clean"],
      enabled: true
    };
    await expect(handler.createProjectRule(createInput)).resolves.toMatchObject(createInput);

    const patch: CachedProjectCommandRuleUpdateInput = {
      decision: "prompt",
      enabled: false
    };
    await expect(handler.updateProjectRule(rule.id, patch))
      .resolves.toMatchObject({ id: rule.id, ...patch });
    await expect(handler.deleteProjectRule(rule.id)).resolves.toEqual({ ok: true });

    expect(createProjectCommandRule).toHaveBeenCalledWith(createInput);
    expect(updateProjectCommandRule).toHaveBeenCalledWith(rule.id, patch);
    expect(deleteProjectCommandRule).toHaveBeenCalledWith(rule.id);
  });
});

/** Creates a handler with deterministic defaults and optional test overrides. */
function createHandler(
  overrides: Partial<ProjectAutomationRuntimeHandlerOptions> = {}
): ProjectAutomationRuntimeHandler {
  const options: ProjectAutomationRuntimeHandlerOptions = {
    cache: null,
    userDataPath: "/tmp/opencodex-ui-tests",
    settings: { getSettings: () => createSettings() },
    clients: {
      ensureClient: async () => createClient(),
      restartClient: async () => undefined
    },
    projects: { resolveSource: async (sourceId) => createSource(sourceId ?? "source-default") },
    hasActiveTurn: () => false,
    events: { emit: () => undefined },
    ...overrides
  };

  return new ProjectAutomationRuntimeHandler(options);
}

/** Builds the narrow fake cache surface used by command and rule tests. */
function createRepository(
  overrides: Partial<{
    listProjectCommands: OpenCodexCacheRepository["listProjectCommands"];
    createProjectCommand: OpenCodexCacheRepository["createProjectCommand"];
    updateProjectCommand: OpenCodexCacheRepository["updateProjectCommand"];
    reorderProjectCommands: OpenCodexCacheRepository["reorderProjectCommands"];
    deleteProjectCommand: OpenCodexCacheRepository["deleteProjectCommand"];
    listProjects: OpenCodexCacheRepository["listProjects"];
    listProjectCommandRules: OpenCodexCacheRepository["listProjectCommandRules"];
    getProjectCommandRuleFileState: OpenCodexCacheRepository["getProjectCommandRuleFileState"];
    createProjectCommandRule: OpenCodexCacheRepository["createProjectCommandRule"];
    updateProjectCommandRule: OpenCodexCacheRepository["updateProjectCommandRule"];
    deleteProjectCommandRule: OpenCodexCacheRepository["deleteProjectCommandRule"];
  }> = {}
): OpenCodexCacheRepository {
  return {
    listProjectCommands: overrides.listProjectCommands ?? (async () => []),
    createProjectCommand: overrides.createProjectCommand ?? (async (input) => ({
      ...createCommand("command-default"),
      ...input
    })),
    updateProjectCommand: overrides.updateProjectCommand ?? (async (commandId, patch) => ({
      ...createCommand(commandId),
      ...patch
    })),
    reorderProjectCommands: overrides.reorderProjectCommands ?? (async () => []),
    deleteProjectCommand: overrides.deleteProjectCommand ?? (async () => undefined),
    listProjects: overrides.listProjects ?? (async () => []),
    listProjectCommandRules: overrides.listProjectCommandRules ?? (async () => []),
    getProjectCommandRuleFileState: overrides.getProjectCommandRuleFileState ?? (async () => null),
    createProjectCommandRule: overrides.createProjectCommandRule ?? (async (input) => ({
      ...createRule("rule-default", input.projectId),
      ...input
    })),
    updateProjectCommandRule: overrides.updateProjectCommandRule ?? (async (ruleId, patch) => ({
      ...createRule(ruleId),
      ...patch
    })),
    deleteProjectCommandRule: overrides.deleteProjectCommandRule ?? (async () => undefined)
  } as unknown as OpenCodexCacheRepository;
}

/** Creates a stable command fixture. */
function createCommand(id: string, projectId = "project-1"): CachedProjectCommand {
  return {
    id,
    projectId,
    name: "Build",
    command: "npm run build",
    allowParallel: false,
    persistLogs: true,
    sortOrder: 0,
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z"
  };
}

/** Creates a stable rule fixture. */
function createRule(id: string, projectId = "project-1"): CachedProjectCommandRule {
  return {
    id,
    projectId,
    name: "Allow build",
    pattern: ["npm", "run", "build"],
    decision: "allow",
    justification: "Builds are safe.",
    matchExamples: ["npm run build"],
    notMatchExamples: ["npm run clean"],
    enabled: true,
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z"
  };
}

/** Creates a local source fixture accepted by project-rule operations. */
function createSource(id: string): CachedSource {
  return {
    id,
    name: "Local Codex",
    kind: "local",
    settings: {
      commandMode: "auto",
      command: null,
      color: "blue",
      openFolderCommand: null,
      openFileCommand: null
    },
    lastDetectedCodexVersion: null,
    lastDetectedCodexAt: null,
    lastDetectionError: null,
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z"
  };
}

/** Creates a project fixture linked to an explicit source. */
function createProject(id: string, sourceId: string | null): CachedProject {
  return {
    id,
    sourceId,
    path: "/workspace/project",
    defaultName: "project",
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
    lastSeenAt: "2026-08-09T10:00:00.000Z",
    editedAt: "2026-08-09T10:00:00.000Z"
  };
}

/** Creates a narrow fake Codex client for cacheless handler construction. */
function createClient(): CodexAppServerClient {
  return {
    readFile: async () => ({ dataBase64: "" })
  } as unknown as CodexAppServerClient;
}

/** Creates the smallest complete settings snapshot accepted by rule services. */
function createSettings(): OpenCodexSettings {
  return {
    codexCommand: "codex",
    codexReleaseCheck: {
      latestVersion: "1.12.0",
      checkedAt: "2099-01-01T00:00:00.000Z",
      error: null
    },
    defaultSourceId: null,
    defaultUsageLimitId: null,
    defaultModel: null,
    defaultReasoningEffort: null,
    commitMessageModel: null,
    commitMessageReasoningEffort: null,
    commitMessageLanguage: "en",
    showActivityPanel: true,
    experimentalApi: false,
    allowTurnSteering: true,
    language: "en",
    colorScheme: "system",
    enterKeyBehavior: "smart",
    versioningVocabulary: "technical",
    desktopNotifications: {
      turnCompleted: false,
      approvalRequested: false
    },
    discordRichPresenceEnabled: false,
    onboardingCompleted: true,
    allowOutdatedCodex: false,
    developerMode: false,
    performanceMonitoringEnabled: false,
    advancedPerformanceMonitoringEnabled: false
  };
}
