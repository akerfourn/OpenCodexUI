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
      return await this.handleValidRequest(request);
    } catch (error) {
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
    switch (request.type) {
      case "app.bootstrap":
        return this.runtime.bootstrap();
      case "app.openDevTools":
        throw new Error("Developer tools are not available in this runtime.");
      case "projects.list":
        return this.runtime.projects.list();
      case "projects.open":
        return this.runtime.projects.open(
          request.projectPath,
          request.sourceId === undefined ? this.runtime.settings.get().defaultSourceId : request.sourceId,
          request.createIfMissing === true
        );
      case "projects.statistics.read":
        return this.runtime.projects.readStatistics(request.projectPath, request.sourceId);
      case "projects.pickDirectory":
        return this.runtime.projects.pickDirectory(
          request.mode,
          request.sourceId === undefined ? this.runtime.settings.get().defaultSourceId : request.sourceId
        );
      case "projects.setHidden":
        return this.runtime.projects.setHidden(request.projectId, request.isHidden);
      case "projects.displayName.update":
        return this.runtime.projects.setDisplayName(request.projectId, request.displayName);
      case "projects.preferences.update":
        return this.runtime.projects.updatePreferences(request.projectId, request.patch);
      case "projects.context.sync":
        return this.runtime.context.sync(request.projectId);
      case "projects.context.pickFolder":
        return this.runtime.context.pickFolder();
      case "projects.delete":
        return this.runtime.projects.delete(request.projectId);
      case "projectGroups.list":
        return this.runtime.groups.list();
      case "projectGroups.create":
        return this.runtime.groups.create(
          request.name,
          request.parentGroupId ?? null,
          request.color ?? "blue"
        );
      case "projectGroups.update":
        return this.runtime.groups.update(request.groupId, request.patch);
      case "projectGroups.delete":
        return this.runtime.groups.delete(request.groupId);
      case "projectGroups.assignProject":
        return this.runtime.groups.assignProject(request.projectId, request.groupId);
      case "attachments.pickImages":
        return this.runtime.host.pickImages();
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
          request.limit ?? 8
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
      case "threads.eventLog.read":
        return this.runtime.eventLog.read(
          request.threadId,
          request.sourceId ?? null,
          request.limit ?? 500
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
        return this.runtime.threads.create(request.projectPath ?? null, request.sourceId ?? null);
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
          request.serviceTier ?? null
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
      case "git.version":
        return this.runtime.git.readVersion();
      case "git.status":
        return this.runtime.git.readStatus(request.projectPath, request.sourceId);
      case "git.init":
        return this.runtime.git.initializeRepository(request.projectPath, request.sourceId);
      case "git.remotes":
        return this.runtime.git.listRemotes(request.projectPath, request.sourceId);
      case "git.remote.upsert":
        return this.runtime.git.upsertRemote(
          request.projectPath,
          request.sourceId,
          request.name,
          request.url
        );
      case "git.branches":
        return this.runtime.git.listBranches(request.projectPath, request.sourceId);
      case "git.tags":
        return this.runtime.git.listTags(request.projectPath, request.sourceId);
      case "git.tags.fetch":
        return this.runtime.git.fetchTags(request.projectPath, request.sourceId);
      case "git.tags.push":
        return this.runtime.git.pushTags(request.projectPath, request.sourceId);
      case "git.tag.create":
        return this.runtime.git.createTag(request.projectPath, request.sourceId, request.tagName);
      case "git.tag.push":
        return this.runtime.git.pushTag(
          request.projectPath,
          request.sourceId,
          request.tagName,
          request.force
        );
      case "git.tag.commitsSince":
        return this.runtime.git.countCommitsSinceTag(
          request.projectPath,
          request.sourceId,
          request.tagName
        );
      case "git.log":
        return this.runtime.git.readLog(request.projectPath, request.sourceId, request.limit, request.skip);
      case "git.commit.details":
        return this.runtime.git.readCommitDetails(request.projectPath, request.sourceId, request.hash);
      case "git.checkout":
        return this.runtime.git.checkoutBranch(
          request.projectPath,
          request.sourceId,
          request.branchName,
          request.branchKind
        );
      case "git.branch.create":
        return this.runtime.git.createBranch(request.projectPath, request.sourceId, request.branchName);
      case "git.merge":
        return this.runtime.git.mergeBranch(request.projectPath, request.sourceId, request.branchName);
      case "git.stage":
        return this.runtime.git.stage(request.projectPath, request.sourceId, request.paths);
      case "git.unstage":
        return this.runtime.git.unstage(request.projectPath, request.sourceId, request.paths);
      case "git.commit":
        return this.runtime.git.commit(request.projectPath, request.sourceId, request.message);
      case "git.pull":
        return this.runtime.git.pull(request.projectPath, request.sourceId);
      case "git.push":
        return this.runtime.git.push(request.projectPath, request.sourceId);
      case "git.branch.publish":
        return this.runtime.git.publishCurrentBranch(request.projectPath, request.sourceId);
      case "projectCommands.list":
        return this.runtime.automation.commands.list(request.projectId);
      case "projectCommands.create":
        return this.runtime.automation.commands.create(
          request.projectId,
          request.name,
          request.command,
          request.allowParallel,
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
          request.sourceId
        );
      case "projectCommands.stop":
        return this.runtime.automation.commands.stop(request.runId);
      case "projectRules.list":
        return this.runtime.automation.rules.read(request.projectId);
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
        return this.runtime.automation.rules.apply(request.projectId, request.force === true);
      case "projectRules.test":
        return this.runtime.automation.rules.test(request.projectId, request.command);
      case "projectRules.restart":
        return this.runtime.automation.rules.restart(request.projectId);
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
      case "commitPrompt.get":
        return this.runtime.git.commitMessage.readPrompt();
      case "commitPrompt.update":
        return this.runtime.git.commitMessage.updatePrompt(request.prompt);
      case "commitPrompt.reset":
        return this.runtime.git.commitMessage.resetPrompt();
      case "git.commitMessage.generate":
        return this.runtime.git.commitMessage.generate(
          request.projectPath,
          request.sourceId,
          request.instruction,
          request.model,
          request.reasoningEffort,
          request.language
        );
      case "logs.list":
        return this.runtime.logs.list(request.beforeCreatedAt ?? null, request.limit ?? 30);
      case "logs.delete":
        return this.runtime.logs.delete(request.logId);
      case "logs.clear":
        return this.runtime.logs.clear(request.mode, request.amount ?? 24, request.unit ?? "hours");
      case "logs.create":
        return this.runtime.logs.create(request.logType, request.message, request.details ?? null);
      case "settings.get":
        return this.runtime.settings.get();
      case "settings.update":
        return this.runtime.settings.update(request.patch);
    }
  }
}
