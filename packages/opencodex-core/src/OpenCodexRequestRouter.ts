import { isGitRequest, routeGitRequest } from "./backend/git/gitRequestRouting.js";
import { isProjectRequest, routeProjectRequest } from "./backend/projects/projectRequestRouting.js";
import { optionalWorkspaceArgument } from "./backend/workspaces/workspaceToolContext.js";
/**
 * Routes protocol requests to the backend runtime.
 */
import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexBackendRuntime } from "./OpenCodexBackendRuntime.js";

/**
 * Converts transport-level requests into explicit runtime method calls.
 */
export class OpenCodexRequestRouter {
  /**
   * Creates a request router.
   *
   * @param runtime Backend runtime receiving routed requests.
   */
  constructor(private readonly runtime: OpenCodexBackendRuntime) {}

  /**
   * Handles one UI protocol request.
   *
   * @param request Request payload.
   * @returns Promise resolved with the request result.
   */
  async handleRequest(request: OpenCodexRequest): Promise<unknown> {
    try {
      return await this.runtime.runWorkspaceRequest(request, async () => {
        const resolved = "workspaceId" in request && request.workspaceId !== undefined
          && request.type !== "turn.start" && request.type !== "threads.workspace.select"
          && !request.type.startsWith("projectWorkspaces.")
          ? await this.runtime.resolveToolRequest(request) : request;
        return await this.handleValidRequest(resolved);
      });
    } catch (error) {
      // Tool and settings dialogs own their error feedback without recovering a chat.
      if (request.type === "debug" || request.type.startsWith("projectWorkspaces.") ||
        request.type.startsWith("messageRendering.") ||
        request.type.startsWith("browserPermissions.") || request.type.startsWith("threadPermissions.") ||
        request.type.startsWith("sourcePermissions.") || request.type.startsWith("sourceInstances.")) throw error;
      this.runtime.handleRequestError(request, error);
    }
  }

  /**
   * Routes a validated request to the matching runtime method.
   *
   * @param request Request payload.
   *
   * @returns Promise resolved with the runtime result.
   */
  private async handleValidRequest(request: OpenCodexRequest): Promise<unknown> {
    if (isProjectRequest(request)) {
      return routeProjectRequest(this.runtime, request);
    }

    if (isGitRequest(request)) {
      return routeGitRequest(this.runtime, request);
    }

    switch (request.type) {
      case "sourceInstances.list":
      case "sourceInstances.start":
      case "sourceInstances.stop":
      case "sourceInstances.restart":
        return this.runtime.sourceInstances.execute(request);
      case "sourcePermissions.read":
      case "sourcePermissions.change":
        return this.runtime.sourcePermissions.execute(request);
      case "threadPermissions.read":
      case "threadPermissions.change":
        return this.runtime.threadPermissions.execute(request);
      case "images.read":
        return this.runtime.files.readImage(request);
      case "browserPermissions.read":
      case "browserPermissions.change":
      case "browserPermissions.reload":
        return this.runtime.browserPermissions.execute(request);
      case "messageRendering.read":
      case "messageRendering.set":
        return this.runtime.messageRendering.execute(request);
      case "debug":
        return this.runtime.debug.execute(request.action);
      case "workspaceFiles.linkAccess":
      case "workspaceFiles.setLinkAccess":
      case "workspaceFiles.stat":
      case "workspaceFiles.list":
      case "workspaceFiles.read":
      case "workspaceFiles.check":
      case "workspaceFiles.save":
      case "workspaceFiles.copy":
      case "workspaceFiles.rename":
      case "workspaceFiles.delete":
        return this.runtime.files.execute(request);
      case "app.bootstrap":
        return this.runtime.bootstrap();
      case "app.openDevTools":
        throw new Error("Developer tools are not available in this runtime.");
      case "attachments.pickImages":
        return (await this.runtime.host.pickFiles()).filter((attachment) => attachment.kind === "image");
      case "attachments.pickFiles":
        return this.runtime.host.pickFiles();
      case "sources.list":
        return this.runtime.sources.list();
      case "sources.create":
        return this.runtime.sources.create(request.name, request.kind, request.settings);
      case "sources.sync":
        return this.runtime.sources.sync(request.sourceId ?? null);
      case "sources.codexRelease.check":
        return this.runtime.updates.checkRelease(request.force === true);
      case "sources.codexUpdate.apply":
        return this.runtime.updates.applyToSource(request.sourceId);
      case "sources.delete":
        return this.runtime.sources.delete(request.sourceId);
      case "sources.update":
        return this.runtime.sources.update(request.sourceId, request.patch);
      case "sources.pickExecutable":
        return this.runtime.host.pickExecutable();
      case "files.search":
        return this.runtime.search.files(
          request.projectPath,
          request.sourceId,
          request.query,
          request.limit ?? 8,
          request.searchMode ?? "indexed"
        );
      case "skills.search":
        return this.runtime.search.skills(
          request.projectPath,
          request.sourceId,
          request.query,
          request.limit ?? 8
        );
      case "threads.list":
        return this.runtime.threads.list(
          request.scope,
          request.projectPath ?? null,
          request.sourceId ?? null,
          request.searchTerm,
          request.archived === true
        );
      case "threads.open":
        return this.runtime.threads.open(request.threadId, request.sourceId ?? null);
      case "threads.goal.read":
        return this.runtime.threads.readGoal(request.threadId, request.sourceId ?? null);
      case "threads.goal.set":
        return this.runtime.threads.setGoal(request.threadId, request.sourceId ?? null, {
          objective: request.objective,
          status: request.status,
          tokenBudget: request.tokenBudget
        });
      case "threads.goal.clear":
        return this.runtime.threads.clearGoal(request.threadId, request.sourceId ?? null);
      case "threads.eventLog.read":
        return this.runtime.eventLog.read(
          request.threadId,
          request.sourceId ?? null,
          request.limit ?? 500
        );
      case "threads.turnDiagnostic.read":
        return this.runtime.turnDiagnostics.read(
          request.threadId,
          request.sourceId ?? null,
          request.turnId
        );
      case "threads.subAgents.list":
        return this.runtime.threads.listSubAgents(request.parentThreadId, request.sourceId);
      case "threads.collaboration.list":
        return this.runtime.collaboration.list({
          sourceId: request.sourceId,
          threadId: request.threadId,
          senderThreadId: request.senderThreadId,
          receiverThreadId: request.receiverThreadId,
          rootThreadId: request.rootThreadId,
          limit: request.limit
        });
      case "threads.readReadonly":
        return this.runtime.threads.readReadonly(request.threadId, request.sourceId);
      case "threads.loadOlder":
        return this.runtime.threads.loadOlderMessages(request.threadId);
      case "threads.recover":
        return this.runtime.threads.recover(request.threadId);
      case "threads.runtimeStatus.read":
        return this.runtime.threads.readRuntimeStatus(request.threadId);
      case "threads.create":
        if (request.clientDraftId !== undefined) {
          return this.runtime.threads.create(request.projectPath ?? null, request.sourceId ?? null,
            request.workspaceId, request.clientDraftId);
        }
        return this.runtime.threads.create(request.projectPath ?? null, request.sourceId ?? null,
          ...optionalWorkspaceArgument(request.workspaceId));
      case "threads.rename":
        return this.runtime.threads.rename(request.threadId, request.name);
      case "threads.archive":
        return this.runtime.threads.archive(request.threadId);
      case "threads.delete":
        return this.runtime.threads.delete(request.threadId);
      case "threads.unarchive":
        return this.runtime.threads.restore(request.threadId);
      case "threads.updateComposerSettings":
        await this.runtime.threads.updateComposerSettings(
          request.threadId,
          request.model,
          request.reasoningEffort
        );
        return { ok: true };
      case "thread.review":
        return this.runtime.threads.startReview(request.threadId, request.projectPath ?? null);
      case "thread.compact":
        return this.runtime.threads.compact(request.threadId, request.projectPath ?? null);
      case "system.openLink":
        return this.runtime.host.openLink(
          request.href,
          request.projectPath ?? null,
          request.sourceId ?? null
        );
      case "system.openProject":
        return this.runtime.host.openInIde(request.projectPath, request.sourceId);
      case "system.openProjectFolder":
        return this.runtime.host.openFolder(request.projectPath, request.sourceId);
      case "system.openProjectTerminal":
        return this.runtime.host.openTerminal(request.projectPath, request.sourceId);
      case "turn.start":
        return this.runtime.threads.startTurn(
          request.threadId,
          request.projectPath ?? null,
          request.sourceId ?? null,
          request.text,
          request.attachments ?? [],
          request.references ?? [],
          request.model ?? null,
          request.reasoningEffort ?? null,
          request.serviceTier ?? null,
          request.workspaceId ?? null
        );
      case "turn.steer":
        return this.runtime.threads.steerTurn(
          request.threadId,
          request.turnId,
          request.text,
          request.attachments ?? [],
          request.references ?? []
        );
      case "turn.editLast":
        return this.runtime.threads.editLastTurn(
          request.threadId,
          request.projectPath ?? null,
          request.sourceId ?? null,
          request.text,
          request.attachments ?? [],
          request.references ?? [],
          request.model ?? null,
          request.reasoningEffort ?? null,
          request.serviceTier ?? null
        );
      case "turn.interrupt":
        return this.runtime.threads.interruptTurn(request.threadId, request.turnId);
      case "approval.respond":
        return this.runtime.approvals.resolve(request.approvalId, request.decision);
      case "project.trust":
        return this.runtime.trust.grant(request.projectPath);
      case "project.trust.dismiss":
        this.runtime.trust.dismiss(request.projectPath);
        return { ok: true };
      case "models.list":
        return this.runtime.models.list();
      case "usage.read":
        return this.runtime.usage.readLimits(request.sourceId ?? null);
      case "usage.history.read":
        return this.runtime.usage.readHistory(
          request.sourceId,
          request.from,
          request.to,
          request.aggregation
        );
      case "usage.reset.consume":
        return this.runtime.usage.consumeReset(
          request.sourceId,
          request.creditId,
          request.idempotencyKey
        );
      case "plugins.list":
        return this.runtime.plugins.list(request.sourceId);
      case "plugins.installed":
        return this.runtime.plugins.installed(request.sourceId);
      case "plugins.search":
        return this.runtime.plugins.search(
          request.sourceId,
          request.searchTerm,
          request.cursor ?? null,
          request.limit
        );
      case "plugins.refresh":
        return this.runtime.plugins.refresh(request.sourceId);
      case "plugins.read":
        return this.runtime.plugins.read({
          sourceId: request.sourceId,
          marketplaceName: request.marketplaceName,
          marketplacePath: request.marketplacePath,
          pluginName: request.pluginName
        });
      case "plugins.install":
        return this.runtime.plugins.install({
          sourceId: request.sourceId,
          marketplaceName: request.marketplaceName,
          marketplacePath: request.marketplacePath,
          pluginName: request.pluginName
        });
      case "plugins.uninstall":
        return this.runtime.plugins.uninstall(request.sourceId, request.pluginId);
      case "docker.host.snapshot.read":
        return this.runtime.docker.readSnapshot();
      case "docker.host.container.start":
        return this.runtime.docker.start(request.containerId);
      case "docker.host.container.stop":
        return this.runtime.docker.stop(request.containerId);
      case "docker.host.container.restart":
        return this.runtime.docker.restart(request.containerId);
      case "docker.host.container.logs.read":
        return this.runtime.docker.readLogs(request.containerId, request.tail);
      case "docker.compose.snapshot.read":
        return this.runtime.dockerCompose.readSnapshot(request.projectPath, request.sourceId, request.workspaceId, request.composeFile);
      case "docker.compose.service.up":
        return this.runtime.dockerCompose.up(
          request.projectPath,
          request.sourceId,
          request.serviceName,
          request.workspaceId, request.composeFile
        );
      case "docker.compose.service.stop":
        return this.runtime.dockerCompose.stop(
          request.projectPath,
          request.sourceId,
          request.serviceName,
          request.workspaceId, request.composeFile
        );
      case "docker.compose.service.restart":
        return this.runtime.dockerCompose.restart(
          request.projectPath,
          request.sourceId,
          request.serviceName,
          request.workspaceId, request.composeFile
        );
      case "docker.compose.service.logs.read":
        return this.runtime.dockerCompose.readLogs(
          request.projectPath,
          request.sourceId,
          request.serviceName,
          request.tail,
          request.workspaceId, request.composeFile
        );
      case "projectCommands.list":
        return this.runtime.automation.commands.list(request.projectId);
      case "projectCommands.create":
        return this.runtime.automation.commands.create(
          request.projectId,
          request.name,
          request.command,
          request.executionMode,
          request.persistLogs
        );
      case "projectCommands.update":
        return this.runtime.automation.commands.update(request.commandId, request.patch);
      case "projectCommands.delete":
        return this.runtime.automation.commands.delete(request.commandId);
      case "projectCommands.reorder":
        return this.runtime.automation.commands.reorder(request.projectId, request.commandIds);
      case "projectCommands.run":
        return this.runtime.automation.commands.run(
          request.commandId,
          request.projectPath,
          request.sourceId,
          ...optionalWorkspaceArgument(request.workspaceId)
        );
      case "projectCommands.stop":
        return this.runtime.automation.commands.stop(request.runId);
      case "projectRules.list":
        return this.runtime.automation.rules.read(request.projectId, ...optionalWorkspaceArgument(request.workspaceId));
      case "projectRules.create":
        return this.runtime.automation.rules.create({
          projectId: request.projectId,
          name: request.name,
          pattern: request.pattern,
          decision: request.decision,
          justification: request.justification,
          matchExamples: request.matchExamples,
          notMatchExamples: request.notMatchExamples,
          enabled: request.enabled
        });
      case "projectRules.update":
        return this.runtime.automation.rules.update(request.ruleId, request.patch);
      case "projectRules.delete":
        return this.runtime.automation.rules.delete(request.ruleId);
      case "projectRules.apply":
        return this.runtime.automation.rules.apply(request.projectId, request.force === true, ...optionalWorkspaceArgument(request.workspaceId));
      case "projectRules.test":
        return this.runtime.automation.rules.test(request.projectId, request.command, ...optionalWorkspaceArgument(request.workspaceId));
      case "projectRules.restart":
        return this.runtime.automation.rules.restart(request.projectId, ...optionalWorkspaceArgument(request.workspaceId));
      case "projectTasks.list":
        return this.runtime.tasks.list(request.projectId);
      case "projectTasks.create":
        return this.runtime.tasks.create(
          request.projectId,
          request.title,
          request.description,
          request.status
        );
      case "projectTasks.update":
        return this.runtime.tasks.update(request.taskId, request.patch);
      case "projectTasks.delete":
        return this.runtime.tasks.delete(request.taskId);
      case "projectGoals.list":
        return this.runtime.goals.list(request.projectId, request.includeArchived === true);
      case "projectGoals.create":
        return this.runtime.goals.create(
          request.projectId,
          request.name,
          request.objective,
          request.tokenBudget
        );
      case "projectGoals.update":
        return this.runtime.goals.update(request.goalId, request.patch);
      case "projectGoals.execution.update":
        return this.runtime.goals.updateExecution(request.goalId, request.patch);
      case "projectGoals.archive":
        return this.runtime.goals.archive(request.goalId);
      case "projectGoals.unarchive":
        return this.runtime.goals.unarchive(request.goalId);
      case "projectGoals.delete":
        return this.runtime.goals.delete(request.goalId);
      case "logs.list":
        return this.runtime.logs.list(
          request.beforeCreatedAt ?? null,
          request.limit ?? 30,
          request.types,
          request.beforeId
        );
      case "logs.delete":
        return this.runtime.logs.delete(request.logId);
      case "logs.clear":
        return this.runtime.logs.clear(request.mode, request.amount ?? 24, request.unit ?? "hours");
      case "logs.create":
        return this.runtime.logs.create(
          request.logType,
          request.message,
          request.details ?? null,
          request.category
        );
      case "settings.get":
        return this.runtime.settings.get();
      case "settings.update":
        return this.runtime.settings.update(request.patch);
    }
  }
}
