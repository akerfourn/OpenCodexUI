/**
 * Declares the requests sent from the UI to the OpenCodex backend.
 */
import type {
  OpenCodexApprovalDecision,
  OpenCodexCommitMessageLanguage,
  OpenCodexComposerReference,
  OpenCodexImageAttachment,
  OpenCodexLogType,
  OpenCodexLogRetentionUnit,
  OpenCodexReasoningEffort,
  OpenCodexServiceTier,
  OpenCodexGitBranchKind,
  OpenCodexCommandRuleDecision,
  OpenCodexProjectPreferences,
  OpenCodexSourceKind,
  OpenCodexSourceColor,
  OpenCodexSourceSettingsPatch,
  OpenCodexSettings,
  OpenCodexThreadGoalPatch,
  OpenCodexThreadGoalStatus,
  OpenCodexThreadScope,
  OpenCodexUsageHistoryAggregation
} from "./messages";
import type { OpenCodexCollaborationQuery } from "./collaboration";

/**
 * Request union sent by the renderer to the OpenCodex backend.
 *
 * Each variant is intentionally structured-clone-compatible so it can be
 * transported over Electron IPC today and other transports later.
 */
export type OpenCodexRequest =
  | { type: "app.bootstrap" }
  | { type: "app.openDevTools" }
  | { type: "app.openUsageHistory"; sourceId: string }
  | { type: "projects.list" }
  | { type: "projects.open"; projectPath: string; sourceId?: string | null; createIfMissing?: boolean }
  | { type: "projects.statistics.read"; projectPath: string; sourceId: string | null }
  | { type: "projects.pickDirectory"; mode: "open" | "create"; sourceId?: string | null }
  | { type: "projects.setHidden"; projectId: string; isHidden: boolean }
  | { type: "projects.displayName.update"; projectId: string; displayName: string | null }
  | { type: "projects.preferences.update"; projectId: string; patch: Partial<OpenCodexProjectPreferences> }
  | { type: "projects.context.sync"; projectId: string }
  | { type: "projects.context.pickFolder" }
  | { type: "projects.delete"; projectId: string }
  | { type: "projectGroups.list" }
  | {
      type: "projectGroups.create";
      name: string;
      color?: OpenCodexSourceColor;
      parentGroupId?: string | null;
    }
  | {
      type: "projectGroups.update";
      groupId: string;
      patch: { name?: string; color?: OpenCodexSourceColor; isCollapsed?: boolean };
    }
  | { type: "projectGroups.delete"; groupId: string }
  | { type: "projectGroups.assignProject"; projectId: string; groupId: string | null }
  | { type: "attachments.pickImages" }
  | { type: "sources.list" }
  | {
      type: "sources.create";
      name: string;
      kind: OpenCodexSourceKind;
      settings: OpenCodexSourceSettingsPatch;
    }
  | { type: "sources.sync"; sourceId?: string | null }
  | { type: "sources.codexRelease.check"; force?: boolean }
  | { type: "sources.codexUpdate.apply"; sourceId: string }
  | { type: "sources.delete"; sourceId: string }
  | {
      type: "sources.update";
      sourceId: string;
      patch: {
        name?: string;
        settings?: OpenCodexSourceSettingsPatch;
      };
    }
  | { type: "sources.pickExecutable" }
  | {
      type: "files.search";
      projectPath: string;
      sourceId: string | null;
      query: string;
      limit?: number;
    }
  | {
      type: "skills.search";
      projectPath: string;
      sourceId: string | null;
      query: string;
      limit?: number;
    }
  | {
      type: "threads.list";
      scope: OpenCodexThreadScope;
      projectPath?: string | null;
      sourceId?: string | null;
      searchTerm?: string;
      archived?: boolean;
    }
  | { type: "threads.open"; threadId: string; sourceId?: string | null }
  | { type: "threads.goal.read"; threadId: string; sourceId?: string | null }
  | {
      type: "threads.goal.set";
      threadId: string;
      sourceId?: string | null;
      objective?: OpenCodexThreadGoalPatch["objective"];
      status?: OpenCodexThreadGoalStatus | null;
      tokenBudget?: OpenCodexThreadGoalPatch["tokenBudget"];
    }
  | { type: "threads.goal.clear"; threadId: string; sourceId?: string | null }
  | {
      type: "threads.eventLog.read";
      threadId: string;
      sourceId?: string | null;
      limit?: number;
    }
  | { type: "threads.subAgents.list"; sourceId: string | null; parentThreadId: string }
  | ({ type: "threads.collaboration.list" } & OpenCodexCollaborationQuery)
  | { type: "threads.readReadonly"; sourceId: string | null; threadId: string }
  | { type: "threads.loadOlder"; threadId: string }
  | { type: "threads.recover"; threadId: string }
  | { type: "threads.runtimeStatus.read"; threadId: string }
  | { type: "threads.create"; projectPath?: string | null; sourceId?: string | null }
  | { type: "threads.rename"; threadId: string; name: string }
  | { type: "threads.archive"; threadId: string }
  | { type: "threads.delete"; threadId: string }
  | { type: "threads.unarchive"; threadId: string }
  | {
      type: "threads.updateComposerSettings";
      threadId: string;
      model: string | null;
      reasoningEffort: OpenCodexReasoningEffort | null;
      serviceTier?: OpenCodexServiceTier | null;
    }
  | { type: "thread.review"; threadId: string; projectPath?: string | null }
  | { type: "thread.compact"; threadId: string; projectPath?: string | null }
  | { type: "system.openLink"; href: string; projectPath?: string | null; sourceId?: string | null }
  | { type: "system.openProject"; projectPath: string; sourceId: string | null }
  | { type: "system.openProjectFolder"; projectPath: string; sourceId: string | null }
  | { type: "system.openProjectTerminal"; projectPath: string; sourceId: string | null }
  | {
      type: "turn.start";
      threadId: string | null;
      projectPath?: string | null;
      sourceId?: string | null;
      text: string;
      attachments?: OpenCodexImageAttachment[];
      references?: OpenCodexComposerReference[];
      model?: string | null;
      reasoningEffort?: OpenCodexReasoningEffort | null;
      serviceTier?: OpenCodexServiceTier | null;
    }
  | {
      type: "turn.steer";
      threadId: string;
      turnId: string;
      text: string;
      attachments?: OpenCodexImageAttachment[];
      references?: OpenCodexComposerReference[];
    }
  | {
      type: "turn.editLast";
      threadId: string;
      projectPath?: string | null;
      sourceId?: string | null;
      text: string;
      attachments?: OpenCodexImageAttachment[];
      references?: OpenCodexComposerReference[];
      model?: string | null;
      reasoningEffort?: OpenCodexReasoningEffort | null;
      serviceTier?: OpenCodexServiceTier | null;
    }
  | { type: "turn.interrupt"; threadId: string; turnId: string }
  | { type: "approval.respond"; approvalId: string; decision: OpenCodexApprovalDecision }
  | { type: "project.trust"; projectPath: string }
  | { type: "project.trust.dismiss"; projectPath: string }
  | { type: "models.list" }
  | { type: "usage.read"; sourceId?: string | null }
  | {
      type: "usage.history.read";
      sourceId: string;
      from: string;
      to: string;
      aggregation?: OpenCodexUsageHistoryAggregation;
    }
  | {
      type: "usage.reset.consume";
      sourceId: string;
      creditId: string;
      idempotencyKey: string;
    }
  | { type: "discord.reconnect" }
  | { type: "plugins.list"; sourceId: string | null }
  | { type: "plugins.installed"; sourceId: string | null }
  | {
      type: "plugins.search";
      sourceId: string | null;
      searchTerm: string;
      cursor?: string | null;
      limit?: number;
    }
  | { type: "plugins.refresh"; sourceId: string | null }
  | {
      type: "plugins.read";
      sourceId: string | null;
      marketplaceName: string;
      marketplacePath: string | null;
      pluginName: string;
    }
  | {
      type: "plugins.install";
      sourceId: string | null;
      marketplaceName: string;
      marketplacePath: string | null;
      pluginName: string;
    }
  | { type: "plugins.uninstall"; sourceId: string | null; pluginId: string }
  | { type: "docker.host.snapshot.read" }
  | { type: "docker.host.container.start"; containerId: string }
  | { type: "docker.host.container.stop"; containerId: string }
  | { type: "docker.host.container.restart"; containerId: string }
  | { type: "docker.host.container.logs.read"; containerId: string; tail?: number }
  | { type: "docker.compose.snapshot.read"; projectPath: string; sourceId: string }
  | {
      type: "docker.compose.service.up";
      projectPath: string;
      sourceId: string;
      serviceName: string;
    }
  | {
      type: "docker.compose.service.stop";
      projectPath: string;
      sourceId: string;
      serviceName: string;
    }
  | {
      type: "docker.compose.service.restart";
      projectPath: string;
      sourceId: string;
      serviceName: string;
    }
  | {
      type: "docker.compose.service.logs.read";
      projectPath: string;
      sourceId: string;
      serviceName: string;
      tail?: number;
    }
  | { type: "git.version" }
  | { type: "git.status"; projectPath: string; sourceId: string | null }
  | { type: "git.init"; projectPath: string; sourceId: string | null }
  | { type: "git.remotes"; projectPath: string; sourceId: string | null }
  | { type: "git.remote.upsert"; projectPath: string; sourceId: string | null; name: string; url: string }
  | { type: "git.branches"; projectPath: string; sourceId: string | null }
  | { type: "git.tags"; projectPath: string; sourceId: string | null }
  | { type: "git.tags.fetch"; projectPath: string; sourceId: string | null }
  | {
      type: "git.tags.push";
      projectPath: string;
      sourceId: string | null;
    }
  | {
      type: "git.tag.create";
      projectPath: string;
      sourceId: string | null;
      tagName: string;
    }
  | {
      type: "git.tag.push";
      projectPath: string;
      sourceId: string | null;
      tagName: string;
      force: boolean;
    }
  | { type: "git.tag.commitsSince"; projectPath: string; sourceId: string | null; tagName: string }
  | { type: "git.log"; projectPath: string; sourceId: string | null; limit: number; skip: number }
  | { type: "git.commit.details"; projectPath: string; sourceId: string | null; hash: string }
  | {
      type: "git.checkout";
      projectPath: string;
      sourceId: string | null;
      branchName: string;
      branchKind: OpenCodexGitBranchKind;
    }
  | { type: "git.branch.create"; projectPath: string; sourceId: string | null; branchName: string }
  | { type: "git.merge"; projectPath: string; sourceId: string | null; branchName: string }
  | { type: "git.stage"; projectPath: string; sourceId: string | null; paths: string[] }
  | { type: "git.unstage"; projectPath: string; sourceId: string | null; paths: string[] }
  | {
      type: "git.commit";
      projectPath: string;
      sourceId: string | null;
      projectId: string;
      message: string;
    }
  | { type: "git.pull"; projectPath: string; sourceId: string | null }
  | { type: "git.push"; projectPath: string; sourceId: string | null }
  | { type: "git.branch.publish"; projectPath: string; sourceId: string | null }
  | { type: "projectCommands.list"; projectId: string }
  | {
      type: "projectCommands.create";
      projectId: string;
      name: string;
      command: string;
      allowParallel: boolean;
      persistLogs: boolean;
    }
  | {
      type: "projectCommands.update";
      commandId: string;
      patch: {
        name?: string;
        command?: string;
        allowParallel?: boolean;
        persistLogs?: boolean;
      };
    }
  | { type: "projectCommands.delete"; commandId: string }
  | { type: "projectCommands.reorder"; projectId: string; commandIds: string[] }
  | {
      type: "projectCommands.run";
      commandId: string;
      projectPath: string;
      sourceId: string | null;
    }
  | { type: "projectCommands.stop"; runId: string }
  | { type: "projectRules.list"; projectId: string }
  | {
      type: "projectRules.create";
      projectId: string;
      name: string;
      pattern: string[];
      decision: OpenCodexCommandRuleDecision;
      justification: string | null;
      matchExamples: string[];
      notMatchExamples: string[];
      enabled: boolean;
    }
  | {
      type: "projectRules.update";
      ruleId: string;
      patch: {
        name?: string;
        pattern?: string[];
        decision?: OpenCodexCommandRuleDecision;
        justification?: string | null;
        matchExamples?: string[];
        notMatchExamples?: string[];
        enabled?: boolean;
      };
    }
  | { type: "projectRules.delete"; ruleId: string }
  | { type: "projectRules.apply"; projectId: string; force?: boolean }
  | { type: "projectRules.test"; projectId: string; command: string }
  | { type: "projectRules.restart"; projectId: string }
  | { type: "projectTasks.list"; projectId: string }
  | {
      type: "projectTasks.create";
      projectId: string;
      title: string;
      description: string;
      status: "todo" | "inProgress" | "toValidate" | "done";
    }
  | {
      type: "projectTasks.update";
      taskId: string;
      patch: {
        title?: string;
        description?: string;
        status?: "todo" | "inProgress" | "toValidate" | "done";
      };
    }
  | { type: "projectTasks.delete"; taskId: string }
  | { type: "commitPrompt.get" }
  | { type: "commitPrompt.update"; prompt: string }
  | { type: "commitPrompt.reset" }
  | {
      type: "git.commitMessage.generate";
      projectPath: string;
      sourceId: string | null;
      instruction: string;
      model: string | null;
      reasoningEffort: OpenCodexReasoningEffort | null;
      language: OpenCodexCommitMessageLanguage;
    }
  | { type: "logs.list"; beforeCreatedAt?: string | null; limit?: number }
  | { type: "logs.delete"; logId: string }
  | {
      type: "logs.clear";
      mode: "all" | "olderThan";
      amount?: number;
      unit?: OpenCodexLogRetentionUnit;
    }
  | { type: "logs.create"; logType: OpenCodexLogType; message: string; details?: unknown }
  | { type: "settings.get" }
  | { type: "settings.update"; patch: Partial<OpenCodexSettings> };
