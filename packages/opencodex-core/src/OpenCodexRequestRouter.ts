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
      case "projects.list":
        return this.runtime.listProjects();
      case "projects.open":
        return this.runtime.openProject(
          request.projectPath,
          request.sourceId === undefined ? this.runtime.getSettings().defaultSourceId : request.sourceId,
          request.createIfMissing === true
        );
      case "projects.pickDirectory":
        return this.runtime.pickProjectDirectory(
          request.mode,
          request.sourceId === undefined ? this.runtime.getSettings().defaultSourceId : request.sourceId
        );
      case "projects.setHidden":
        return this.runtime.setProjectHidden(request.projectId, request.isHidden);
      case "attachments.pickImages":
        return this.runtime.pickImageFiles();
      case "sources.list":
        return this.runtime.listSources();
      case "sources.create":
        return this.runtime.createSource(request.name);
      case "sources.sync":
        return this.runtime.syncSources(request.sourceId ?? null);
      case "sources.delete":
        return this.runtime.deleteSource(request.sourceId);
      case "sources.update":
        return this.runtime.updateSource(request.sourceId, request.patch);
      case "sources.pickExecutable":
        return this.runtime.pickSourceExecutable();
      case "threads.list":
        return this.runtime.listThreads(
          request.scope,
          request.projectPath ?? null,
          request.sourceId ?? null,
          request.searchTerm
        );
      case "threads.open":
        return this.runtime.openThread(request.threadId);
      case "threads.loadOlder":
        return this.runtime.loadOlderThreadMessages(request.threadId);
      case "threads.recover":
        return this.runtime.recoverThread(request.threadId);
      case "threads.create":
        return this.runtime.createThread(request.projectPath ?? null, request.sourceId ?? null);
      case "threads.rename":
        return this.runtime.renameThread(request.threadId, request.name);
      case "system.openLink":
        return this.runtime.openLink(request.href, request.projectPath ?? null);
      case "turn.start":
        return this.runtime.startTurn(
          request.threadId,
          request.projectPath ?? null,
          request.sourceId ?? null,
          request.text,
          request.attachments ?? [],
          request.model ?? null,
          request.reasoningEffort ?? null
        );
      case "turn.steer":
        return this.runtime.steerTurn(
          request.threadId,
          request.turnId,
          request.text,
          request.attachments ?? []
        );
      case "turn.editLast":
        return this.runtime.editLastTurn(
          request.threadId,
          request.projectPath ?? null,
          request.sourceId ?? null,
          request.text,
          request.attachments ?? [],
          request.model ?? null,
          request.reasoningEffort ?? null
        );
      case "turn.interrupt":
        return this.runtime.interruptTurn(request.threadId, request.turnId);
      case "approval.respond":
        return this.runtime.resolveApproval(request.approvalId, request.decision);
      case "project.trust":
        return this.runtime.trustProject(request.projectPath);
      case "project.trust.dismiss":
        this.runtime.dismissProjectTrustRequest(request.projectPath);
        return { ok: true };
      case "models.list":
        return this.runtime.listModels();
      case "usage.read":
        return this.runtime.readUsageLimits();
      case "git.status":
        return this.runtime.readGitStatus(request.projectPath, request.sourceId);
      case "git.stage":
        return this.runtime.stageGitPaths(request.projectPath, request.sourceId, request.paths);
      case "git.unstage":
        return this.runtime.unstageGitPaths(request.projectPath, request.sourceId, request.paths);
      case "git.commit":
        return this.runtime.commitGitChanges(request.projectPath, request.sourceId, request.message);
      case "git.pull":
        return this.runtime.pullGitChanges(request.projectPath, request.sourceId);
      case "git.push":
        return this.runtime.pushGitChanges(request.projectPath, request.sourceId);
      case "commitPrompt.get":
        return this.runtime.readCommitPrompt();
      case "commitPrompt.update":
        return this.runtime.updateCommitPrompt(request.prompt);
      case "commitPrompt.reset":
        return this.runtime.resetCommitPrompt();
      case "git.commitMessage.generate":
        return this.runtime.generateGitCommitMessage(
          request.projectPath,
          request.sourceId,
          request.instruction,
          request.model,
          request.reasoningEffort,
          request.language
        );
      case "logs.list":
        return this.runtime.listLogs(request.beforeCreatedAt ?? null, request.limit ?? 30);
      case "logs.delete":
        return this.runtime.deleteLog(request.logId);
      case "logs.clear":
        return this.runtime.clearLogs(request.mode, request.amount ?? 24, request.unit ?? "hours");
      case "settings.get":
        return this.runtime.getSettings();
      case "settings.update":
        return this.runtime.updateSettings(request.patch);
    }
  }
}
