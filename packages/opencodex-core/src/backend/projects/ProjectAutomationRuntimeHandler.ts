import type {
  CachedProjectCommandRuleCreateInput,
  CachedProjectCommandRuleUpdateInput,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexProjectCommand,
  OpenCodexProjectCommandRule,
  OpenCodexProjectCommandRuleApplyResult,
  OpenCodexProjectCommandRulesSnapshot,
  OpenCodexProjectCommandRuleTestResult,
  OpenCodexProjectCommandRun
} from "@open-codex-ui/opencodex-protocol";

import { ProjectCommandService } from "./ProjectCommandService.js";
import { ProjectCommandRuleService } from "./ProjectCommandRuleService.js";
import type {
  ClientPort,
  ProjectSourcePort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "../runtime/runtimePorts.js";

/** Dependencies used by project-command and project-rule runtime operations. */
export type ProjectAutomationRuntimeHandlerOptions = {
  /** Cache repository used for project commands and rules, or `null` when unavailable. */
  cache: OpenCodexCacheRepository | null;
  /** Directory used for persisted command output logs. */
  userDataPath?: string;
  /** Runtime settings used when rendering source-specific rules. */
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  /** Source-scoped Codex clients used by command and rule services. */
  clients: Pick<ClientPort, "ensureClient" | "restartClient">;
  /** Project and source cache operations used by rule services. */
  projects: Pick<ProjectSourcePort, "resolveSource">;
  /** Checks whether a source currently owns an active turn. */
  hasActiveTurn(sourceId: string): boolean;
  /** Emits project command and rule events to the host transport. */
  events: Pick<RuntimeEventPort, "emit">;
};

/** Notification adapter consumed by the ordered runtime notification pipeline. */
export type ProjectAutomationRuntimeNotificationAdapter = {
  /** Project command service receiving process output and exit notifications. */
  readonly projectCommandService: Pick<ProjectCommandService, "handleNotification">;
};

/**
 * Owns project-local command execution and command authorization-rule operations.
 *
 * The handler keeps the two stateful services together because both are backed
 * by the same project cache and source/client callbacks, while leaving the
 * runtime class as the compatibility facade used by the transport.
 */
export class ProjectAutomationRuntimeHandler {
  /** Project command definitions and live process runs. */
  private readonly projectCommandService: ProjectCommandService;
  /** Project command authorization rules and generated-file state. */
  private readonly projectCommandRuleService: ProjectCommandRuleService;
  /** Stable adapter object passed to the notification coordinator. */
  private readonly notificationAdapter: ProjectAutomationRuntimeNotificationAdapter;

  /**
   * Creates a project automation handler and wires its command/rule services.
   *
   * @param options Cache, source, client, and runtime callbacks.
   */
  constructor(options: ProjectAutomationRuntimeHandlerOptions) {
    this.projectCommandService = new ProjectCommandService({
      cacheRepository: options.cache,
      userDataPath: options.userDataPath,
      events: options.events,
      clients: options.clients,
      resolveSource: options.projects.resolveSource
    });
    this.projectCommandRuleService = new ProjectCommandRuleService({
      cacheRepository: options.cache,
      settings: options.settings,
      clients: options.clients,
      projects: options.projects,
      hasActiveTurn: options.hasActiveTurn,
      events: options.events
    });
    this.notificationAdapter = {
      projectCommandService: this.projectCommandService
    };
  }

  /**
   * Lists commands configured for one project.
   *
   * @param projectId Project identifier.
   * @returns Project commands.
   */
  async listProjectCommands(projectId: string): Promise<OpenCodexProjectCommand[]> {
    return await this.projectCommandService.listCommands(projectId);
  }

  /**
   * Creates a project command.
   *
   * @param projectId Project identifier.
   * @param name Command display name.
   * @param command Command line.
   * @param allowParallel Whether multiple instances may run at once.
   * @param persistLogs Whether output should be written to disk.
   * @returns Created command.
   */
  async createProjectCommand(
    projectId: string,
    name: string,
    command: string,
    allowParallel: boolean,
    persistLogs: boolean
  ): Promise<OpenCodexProjectCommand> {
    return await this.projectCommandService.createCommand({
      projectId,
      name,
      command,
      allowParallel,
      persistLogs
    });
  }

  /**
   * Updates a project command.
   *
   * @param commandId Command identifier.
   * @param patch Command patch.
   * @returns Updated command.
   */
  async updateProjectCommand(
    commandId: string,
    patch: {
      name?: string;
      command?: string;
      allowParallel?: boolean;
      persistLogs?: boolean;
    }
  ): Promise<OpenCodexProjectCommand> {
    return await this.projectCommandService.updateCommand(commandId, patch);
  }

  /**
   * Reorders project commands.
   *
   * @param projectId Project identifier.
   * @param commandIds Command identifiers in display order.
   * @returns Commands in persisted order.
   */
  async reorderProjectCommands(
    projectId: string,
    commandIds: string[]
  ): Promise<OpenCodexProjectCommand[]> {
    return await this.projectCommandService.reorderCommands(projectId, commandIds);
  }

  /**
   * Deletes a project command.
   *
   * @param commandId Command identifier.
   * @returns Success result.
   */
  async deleteProjectCommand(commandId: string): Promise<{ ok: true }> {
    await this.projectCommandService.deleteCommand(commandId);
    return { ok: true };
  }

  /**
   * Starts a project command.
   *
   * @param commandId Command identifier.
   * @param projectPath Project working directory.
   * @param sourceId Source identifier, or `null` for the default source.
   * @returns Started command run.
   */
  async runProjectCommand(
    commandId: string,
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexProjectCommandRun> {
    return await this.projectCommandService.runCommand(commandId, projectPath, sourceId);
  }

  /**
   * Stops a project command run.
   *
   * @param runId Run identifier.
   * @returns Success result.
   */
  async stopProjectCommandRun(runId: string): Promise<{ ok: true }> {
    return await this.projectCommandService.stopRun(runId);
  }

  /**
   * Finalizes command runs when their Codex app-server client closes.
   *
   * @param sourceId Resolved source identifier whose client closed.
   */
  handleCodexClientClosed(sourceId: string): void {
    this.projectCommandService.handleClientClosed(sourceId);
  }

  /**
   * Lists managed project command rules and synchronization state.
   *
   * @param projectId Project identifier.
   * @returns Project rule snapshot.
   */
  async listProjectRules(projectId: string): Promise<OpenCodexProjectCommandRulesSnapshot> {
    return await this.projectCommandRuleService.readSnapshot(projectId);
  }

  /**
   * Creates a managed project command rule.
   *
   * @param input Rule input.
   * @returns Created rule.
   */
  async createProjectRule(
    input: CachedProjectCommandRuleCreateInput
  ): Promise<OpenCodexProjectCommandRule> {
    return await this.projectCommandRuleService.createRule(input);
  }

  /**
   * Updates a managed project command rule.
   *
   * @param ruleId Rule identifier.
   * @param patch Rule patch.
   * @returns Updated rule.
   */
  async updateProjectRule(
    ruleId: string,
    patch: CachedProjectCommandRuleUpdateInput
  ): Promise<OpenCodexProjectCommandRule> {
    return await this.projectCommandRuleService.updateRule(ruleId, patch);
  }

  /**
   * Deletes a managed project command rule.
   *
   * @param ruleId Rule identifier.
   * @returns Success result.
   */
  async deleteProjectRule(ruleId: string): Promise<{ ok: true }> {
    return await this.projectCommandRuleService.deleteRule(ruleId);
  }

  /**
   * Generates the managed project command rules file.
   *
   * @param projectId Project identifier.
   * @param force Whether an external file change may be overwritten.
   * @returns Apply result.
   */
  async applyProjectRules(
    projectId: string,
    force = false
  ): Promise<OpenCodexProjectCommandRuleApplyResult> {
    return await this.projectCommandRuleService.applyRules(projectId, force);
  }

  /**
   * Tests a command against the generated project command rules file.
   *
   * @param projectId Project identifier.
   * @param command Command line.
   * @returns Policy test result.
   */
  async testProjectRules(
    projectId: string,
    command: string
  ): Promise<OpenCodexProjectCommandRuleTestResult> {
    return await this.projectCommandRuleService.testRules(projectId, command);
  }

  /**
   * Restarts a project's source runtime to load generated rules.
   *
   * @param projectId Project identifier.
   * @returns Refreshed project rule snapshot.
   */
  async restartProjectRules(projectId: string): Promise<OpenCodexProjectCommandRulesSnapshot> {
    return await this.projectCommandRuleService.restartRules(projectId);
  }

  /**
   * Returns the stable project-command notification adapter.
   *
   * @returns Adapter backed by this handler's command service instance.
   */
  getNotificationAdapter(): ProjectAutomationRuntimeNotificationAdapter {
    return this.notificationAdapter;
  }
}
