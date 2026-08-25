import type {
  ProjectAutomationRuntimeHandler
} from "../../projects/ProjectAutomationRuntimeHandler.js";
import type {
  AutomationApi as AutomationApiContract,
  CommandsApi as CommandsApiContract,
  RulesApi as RulesApiContract
} from "./PublicRuntimeApis.js";

type CommandsHandler = Pick<
  ProjectAutomationRuntimeHandler,
  | "listProjectCommands"
  | "createProjectCommand"
  | "updateProjectCommand"
  | "reorderProjectCommands"
  | "deleteProjectCommand"
  | "runProjectCommand"
  | "stopProjectCommandRun"
>;

type RulesHandler = Pick<
  ProjectAutomationRuntimeHandler,
  | "listProjectRules"
  | "createProjectRule"
  | "updateProjectRule"
  | "deleteProjectRule"
  | "applyProjectRules"
  | "testProjectRules"
  | "restartProjectRules"
>;

type AutomationHandler = CommandsHandler & RulesHandler;

/** Public operations for project command definitions and command runs. */
export class CommandsApi implements CommandsApiContract {
  /** Creates a commands API backed by the supplied automation handler. */
  constructor(private readonly handler: CommandsHandler) {}

  /** Lists commands configured for a project. */
  async list(
    projectId: Parameters<CommandsHandler["listProjectCommands"]>[0]
  ): ReturnType<CommandsHandler["listProjectCommands"]> {
    return await this.handler.listProjectCommands(projectId);
  }

  /** Creates a project command. */
  async create(
    projectId: Parameters<CommandsHandler["createProjectCommand"]>[0],
    name: Parameters<CommandsHandler["createProjectCommand"]>[1],
    command: Parameters<CommandsHandler["createProjectCommand"]>[2],
    allowParallel: Parameters<CommandsHandler["createProjectCommand"]>[3],
    persistLogs: Parameters<CommandsHandler["createProjectCommand"]>[4]
  ): ReturnType<CommandsHandler["createProjectCommand"]> {
    return await this.handler.createProjectCommand(
      projectId,
      name,
      command,
      allowParallel,
      persistLogs
    );
  }

  /** Updates a project command. */
  async update(
    commandId: Parameters<CommandsHandler["updateProjectCommand"]>[0],
    patch: Parameters<CommandsHandler["updateProjectCommand"]>[1]
  ): ReturnType<CommandsHandler["updateProjectCommand"]> {
    return await this.handler.updateProjectCommand(commandId, patch);
  }

  /** Reorders commands configured for a project. */
  async reorder(
    projectId: Parameters<CommandsHandler["reorderProjectCommands"]>[0],
    commandIds: Parameters<CommandsHandler["reorderProjectCommands"]>[1]
  ): ReturnType<CommandsHandler["reorderProjectCommands"]> {
    return await this.handler.reorderProjectCommands(projectId, commandIds);
  }

  /** Deletes a project command. */
  async delete(
    commandId: Parameters<CommandsHandler["deleteProjectCommand"]>[0]
  ): ReturnType<CommandsHandler["deleteProjectCommand"]> {
    return await this.handler.deleteProjectCommand(commandId);
  }

  /** Starts a project command in the requested project and source. */
  async run(
    commandId: Parameters<CommandsHandler["runProjectCommand"]>[0],
    projectPath: Parameters<CommandsHandler["runProjectCommand"]>[1],
    sourceId: Parameters<CommandsHandler["runProjectCommand"]>[2]
  ): ReturnType<CommandsHandler["runProjectCommand"]> {
    return await this.handler.runProjectCommand(commandId, projectPath, sourceId);
  }

  /** Stops a running project command. */
  async stop(
    runId: Parameters<CommandsHandler["stopProjectCommandRun"]>[0]
  ): ReturnType<CommandsHandler["stopProjectCommandRun"]> {
    return await this.handler.stopProjectCommandRun(runId);
  }
}

/** Public operations for managed project command rules. */
export class RulesApi implements RulesApiContract {
  /** Creates a rules API backed by the supplied automation handler. */
  constructor(private readonly handler: RulesHandler) {}

  /** Reads the managed rule snapshot for a project. */
  async read(
    projectId: Parameters<RulesHandler["listProjectRules"]>[0]
  ): ReturnType<RulesHandler["listProjectRules"]> {
    return await this.handler.listProjectRules(projectId);
  }

  /** Creates a managed project command rule. */
  async create(
    input: Parameters<RulesHandler["createProjectRule"]>[0]
  ): ReturnType<RulesHandler["createProjectRule"]> {
    return await this.handler.createProjectRule(input);
  }

  /** Updates a managed project command rule. */
  async update(
    ruleId: Parameters<RulesHandler["updateProjectRule"]>[0],
    patch: Parameters<RulesHandler["updateProjectRule"]>[1]
  ): ReturnType<RulesHandler["updateProjectRule"]> {
    return await this.handler.updateProjectRule(ruleId, patch);
  }

  /** Deletes a managed project command rule. */
  async delete(
    ruleId: Parameters<RulesHandler["deleteProjectRule"]>[0]
  ): ReturnType<RulesHandler["deleteProjectRule"]> {
    return await this.handler.deleteProjectRule(ruleId);
  }

  /** Generates the managed rules file, optionally overwriting external changes. */
  async apply(
    projectId: Parameters<RulesHandler["applyProjectRules"]>[0],
    force: Parameters<RulesHandler["applyProjectRules"]>[1] = false
  ): ReturnType<RulesHandler["applyProjectRules"]> {
    return await this.handler.applyProjectRules(projectId, force);
  }

  /** Tests a command against the generated managed rules file. */
  async test(
    projectId: Parameters<RulesHandler["testProjectRules"]>[0],
    command: Parameters<RulesHandler["testProjectRules"]>[1]
  ): ReturnType<RulesHandler["testProjectRules"]> {
    return await this.handler.testProjectRules(projectId, command);
  }

  /** Restarts a project's source runtime to load generated rules. */
  async restart(
    projectId: Parameters<RulesHandler["restartProjectRules"]>[0]
  ): ReturnType<RulesHandler["restartProjectRules"]> {
    return await this.handler.restartProjectRules(projectId);
  }
}

/** Groups the public command and rule APIs under one automation resource. */
export class AutomationApi implements AutomationApiContract {
  /** Public command operations. */
  readonly commands: CommandsApi;
  /** Public managed-rule operations. */
  readonly rules: RulesApi;

  /** Creates command and rule APIs backed by one automation handler. */
  constructor(handler: AutomationHandler) {
    this.commands = new CommandsApi(handler);
    this.rules = new RulesApi(handler);
  }
}
