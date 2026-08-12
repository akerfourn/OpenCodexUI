/**
 * Manages OpenCodexUI-owned project command authorization rules.
 */
import path from "node:path";

import {
  resolveCodexCommand,
  type CodexAppServerClient,
  type v2
} from "@open-codex-ui/codex-rpc";
import type {
  CachedProject,
  CachedProjectCommandRule,
  CachedProjectCommandRuleCreateInput,
  CachedProjectCommandRuleUpdateInput,
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexProjectCommandRule,
  OpenCodexProjectCommandRuleApplyResult,
  OpenCodexProjectCommandRuleRuntimeState,
  OpenCodexProjectCommandRulesSnapshot,
  OpenCodexProjectCommandRuleStatus,
  OpenCodexProjectCommandRuleTestResult
} from "@open-codex-ui/opencodex-protocol";

import { hashProjectCommandRules, renderProjectCommandRules, tokenizeCommandLine } from "./projectCommandRuleGenerator.js";
import { errorMessage, toProtocolRule } from "./projectCommandRuleMapping.js";
import { mapPolicyCheckResult } from "./projectCommandRulePolicy.js";
import {
  createUnsupportedStatus,
  getRulesFilePath,
  isSupportedSource,
  resolveFileStatus
} from "./projectCommandRuleStatus.js";
import { resolveSourceCommand } from "./sourceMapping.js";
import type {
  ClientPort,
  ProjectSourcePort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "./runtime/runtimePorts.js";

const commandCheckTimeoutMs = 30_000;
const commandCheckOutputCap = 1024 * 1024;

type RuntimeState = {
  state: OpenCodexProjectCommandRuleRuntimeState;
  message: string | null;
};

export type ProjectCommandRuleServiceOptions = {
  cacheRepository: OpenCodexCacheRepository | null;
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  clients: Pick<ClientPort, "ensureClient" | "restartClient">;
  projects: Pick<ProjectSourcePort, "resolveSource">;
  hasActiveTurn(sourceId: string): boolean;
  events: Pick<RuntimeEventPort, "emit">;
};

/**
 * Coordinates persistence, file generation, policy checks, and source restarts.
 */
export class ProjectCommandRuleService {
  private readonly runtimeStatesBySourceId = new Map<string, RuntimeState>();

  /**
   * Creates a project command rule service.
   *
   * @param options Cache, source, client, and runtime dependencies.
   */
  constructor(private readonly options: ProjectCommandRuleServiceOptions) {}

  /**
   * Lists rules and synchronization state for one project.
   *
   * @param projectId Project identifier.
   * @returns Complete project rule snapshot.
   */
  async readSnapshot(projectId: string): Promise<OpenCodexProjectCommandRulesSnapshot> {
    const repository = this.requireRepository();
    const project = await this.readProject(projectId);
    const rules = await repository.listProjectCommandRules(projectId);
    const status = await this.readStatus(project, rules);
    return {
      rules: rules.map(toProtocolRule),
      status
    };
  }

  /**
   * Creates a project rule.
   *
   * @param input Rule input.
   * @returns Created protocol rule.
   */
  async createRule(input: CachedProjectCommandRuleCreateInput): Promise<OpenCodexProjectCommandRule> {
    const rule = await this.requireRepository().createProjectCommandRule(input);
    return toProtocolRule(rule);
  }

  /**
   * Updates a project rule.
   *
   * @param ruleId Rule identifier.
   * @param patch Rule update.
   * @returns Updated protocol rule.
   */
  async updateRule(
    ruleId: string,
    patch: CachedProjectCommandRuleUpdateInput
  ): Promise<OpenCodexProjectCommandRule> {
    const rule = await this.requireRepository().updateProjectCommandRule(ruleId, patch);
    return toProtocolRule(rule);
  }

  /**
   * Deletes a project rule.
   *
   * @param ruleId Rule identifier.
   * @returns Success result.
   */
  async deleteRule(ruleId: string): Promise<{ ok: true }> {
    await this.requireRepository().deleteProjectCommandRule(ruleId);
    return { ok: true };
  }

  /**
   * Generates the managed rules file after checking external modifications.
   *
   * @param projectId Project identifier.
   * @param force Whether an externally changed file may be overwritten.
   * @returns Apply result and refreshed status.
   */
  async applyRules(
    projectId: string,
    force = false
  ): Promise<OpenCodexProjectCommandRuleApplyResult> {
    const repository = this.requireRepository();
    const project = await this.readProject(projectId);
    const rules = await repository.listProjectCommandRules(projectId);
    const before = await this.readStatus(project, rules);

    if (!before.isSupported || before.filePath === null) {
      return {
        applied: false,
        requiresConfirmation: false,
        snapshot: {
          rules: rules.map(toProtocolRule),
          status: before
        }
      };
    }

    if (before.fileStatus === "external" && !force) {
      return {
        applied: false,
        requiresConfirmation: true,
        snapshot: {
          rules: rules.map(toProtocolRule),
          status: before
        }
      };
    }

    const content = renderProjectCommandRules(rules.map(toProtocolRule));
    const desiredHash = hashProjectCommandRules(content);
    const client = await this.options.clients.ensureClient(project.sourceId);

    await client.createDirectory(path.dirname(before.filePath));
    await client.writeFile(before.filePath, Buffer.from(content, "utf8").toString("base64"));
    await repository.saveProjectCommandRuleFileState({
      projectId,
      generatedHash: desiredHash,
      generatedPath: before.filePath,
      updatedAt: new Date().toISOString()
    });

    if (project.sourceId !== null) {
      this.runtimeStatesBySourceId.set(project.sourceId, {
        state: "restartPending",
        message: "Project command rules changed. Restart Codex to apply them."
      });
    }

    const snapshot = await this.readSnapshot(projectId);
    this.options.events.emit({ type: "projectRules.updated", projectId, snapshot });

    return {
      applied: true,
      requiresConfirmation: false,
      snapshot
    };
  }

  /**
   * Tests one command against the generated project rules file.
   *
   * @param projectId Project identifier.
   * @param commandText Command line entered by the user.
   * @returns Codex exec-policy result.
   */
  async testRules(
    projectId: string,
    commandText: string
  ): Promise<OpenCodexProjectCommandRuleTestResult> {
    const command = tokenizeCommandLine(commandText);

    if (command.length === 0) {
      throw new Error("A command is required.");
    }

    const project = await this.readProject(projectId);
    const snapshot = await this.readSnapshot(projectId);

    if (!snapshot.status.isSupported || snapshot.status.filePath === null) {
      throw new Error("Project command rule testing is unavailable for this source.");
    }

    if (snapshot.status.fileStatus !== "synchronized") {
      throw new Error("Apply the project rules before testing a command.");
    }

    const source = await this.requireSupportedSource(project.sourceId);
    const client = await this.options.clients.ensureClient(project.sourceId);
    const commandLine = resolveSourceCommand(source, this.options.settings.getSettings().codexCommand);
    const resolvedCommand = resolveCodexCommand(commandLine, [
      "execpolicy",
      "check",
      "--pretty",
      "--rules",
      snapshot.status.filePath,
      "--",
      ...command
    ]);
    const response = await client.request<v2.CommandExecResponse>("command/exec", {
      command: [resolvedCommand.command, ...resolvedCommand.args],
      cwd: project.path,
      timeoutMs: commandCheckTimeoutMs,
      outputBytesCap: commandCheckOutputCap
    });

    return mapPolicyCheckResult(command, response);
  }

  /**
   * Restarts the source runtime after project rules have been generated.
   *
   * @param projectId Project identifier.
   * @returns Refreshed project rule snapshot.
   */
  async restartRules(projectId: string): Promise<OpenCodexProjectCommandRulesSnapshot> {
    const project = await this.readProject(projectId);
    const sourceId = project.sourceId;

    if (sourceId === null) {
      throw new Error("This project has no Codex source.");
    }

    const snapshot = await this.readSnapshot(projectId);

    if (snapshot.status.fileStatus !== "synchronized") {
      throw new Error("Apply the project rules before restarting Codex.");
    }

    if (this.options.hasActiveTurn(sourceId)) {
      throw new Error("Codex cannot restart while a turn is active for this source.");
    }

    this.runtimeStatesBySourceId.set(sourceId, {
      state: "restarting",
      message: "Codex is restarting to apply project command rules."
    });
    this.options.events.emit({
      type: "projectRules.updated",
      projectId,
      snapshot: await this.readSnapshot(projectId)
    });

    try {
      await this.options.clients.restartClient(sourceId);
      this.runtimeStatesBySourceId.delete(sourceId);
    } catch (error) {
      this.runtimeStatesBySourceId.set(sourceId, {
        state: "error",
        message: errorMessage(error)
      });
      throw error;
    }

    const nextSnapshot = await this.readSnapshot(projectId);
    this.options.events.emit({ type: "projectRules.updated", projectId, snapshot: nextSnapshot });
    return nextSnapshot;
  }

  /**
   * Reads a project from the cache or raises a clear error.
   *
   * @param projectId Project identifier.
   * @returns Cached project.
   */
  private async readProject(projectId: string): Promise<CachedProject> {
    const project = (await this.requireRepository().listProjects())
      .find((candidate) => candidate.id === projectId);

    if (project === undefined) {
      throw new Error("Project not found.");
    }

    return project;
  }

  /**
   * Reads synchronization and runtime state for one project.
   *
   * @param project Cached project.
   * @param rules Rules used to calculate the desired file content.
   * @returns Project rule status.
   */
  private async readStatus(
    project: CachedProject,
    rules: CachedProjectCommandRule[]
  ): Promise<OpenCodexProjectCommandRuleStatus> {
    const desiredContent = renderProjectCommandRules(rules.map(toProtocolRule));
    const desiredHash = hashProjectCommandRules(desiredContent);
    const fileState = await this.requireRepository().getProjectCommandRuleFileState(project.id);

    if (project.sourceId === null) {
      return createUnsupportedStatus(project, desiredHash, fileState);
    }

    const source = await this.options.projects.resolveSource(project.sourceId);

    if (!isSupportedSource(source)) {
      return createUnsupportedStatus(project, desiredHash, fileState);
    }

    const filePath = getRulesFilePath(project.path);
    const client = await this.options.clients.ensureClient(project.sourceId);
    const currentContent = await readOptionalFile(client, filePath);
    const currentHash = currentContent === null ? null : hashProjectCommandRules(currentContent);
    const fileStatus = resolveFileStatus(fileState?.generatedHash ?? null, currentHash, desiredHash, fileState);
    const runtime = this.runtimeStatesBySourceId.get(project.sourceId) ?? {
      state: "ready" as const,
      message: null
    };

    return {
      projectId: project.id,
      sourceId: project.sourceId,
      filePath,
      fileStatus,
      generatedHash: fileState?.generatedHash ?? null,
      currentHash,
      desiredHash,
      isSupported: true,
      runtimeState: runtime.state,
      runtimeMessage: runtime.message
    };
  }

  /**
   * Resolves a source and verifies that the first-version local integration supports it.
   *
   * @param sourceId Source identifier.
   * @returns Supported source.
   */
  private async requireSupportedSource(sourceId: string | null): Promise<CachedSource> {
    if (sourceId === null) {
      throw new Error("This project has no Codex source.");
    }

    const source = await this.options.projects.resolveSource(sourceId);

    if (!isSupportedSource(source)) {
      throw new Error("Project command rules currently support local Codex sources only.");
    }

    return source;
  }

  /**
   * Returns the cache repository required for rule persistence.
   *
   * @returns Cache repository.
   * @throws When SQLite cache is unavailable.
   */
  private requireRepository(): OpenCodexCacheRepository {
    if (this.options.cacheRepository === null) {
      throw new Error("Project command rule persistence is unavailable.");
    }

    return this.options.cacheRepository;
  }
}

export { getRulesFilePath } from "./projectCommandRuleStatus.js";

/**
 * Reads an optional source-local file.
 *
 * @param client Source Codex client.
 * @param filePath Absolute source-local file path.
 * @returns File content, or `null` when missing.
 */
async function readOptionalFile(client: CodexAppServerClient, filePath: string): Promise<string | null> {
  try {
    const response = await client.readFile(filePath);
    return Buffer.from(response.dataBase64, "base64").toString("utf8");
  } catch (error) {
    const message = errorMessage(error).toLowerCase();

    if (message.includes("not found") || message.includes("no such file")) {
      return null;
    }

    throw error;
  }
}
