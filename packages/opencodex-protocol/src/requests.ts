/**
 * Declares the requests sent from the UI to the OpenCodex backend.
 */
import type {
  OpenCodexApprovalDecision,
  OpenCodexCommitMessageLanguage,
  OpenCodexComposerReference,
  OpenCodexImageAttachment,
  OpenCodexLogRetentionUnit,
  OpenCodexReasoningEffort,
  OpenCodexGitBranchKind,
  OpenCodexProjectPreferences,
  OpenCodexSourceLocalSettings,
  OpenCodexSettings,
  OpenCodexThreadScope
} from "./messages";

export type OpenCodexRequest =
  | { type: "app.bootstrap" }
  | { type: "projects.list" }
  | { type: "projects.open"; projectPath: string; sourceId?: string | null; createIfMissing?: boolean }
  | { type: "projects.pickDirectory"; mode: "open" | "create"; sourceId?: string | null }
  | { type: "projects.setHidden"; projectId: string; isHidden: boolean }
  | { type: "projects.preferences.update"; projectId: string; patch: Partial<OpenCodexProjectPreferences> }
  | { type: "projects.delete"; projectId: string }
  | { type: "attachments.pickImages" }
  | { type: "sources.list" }
  | { type: "sources.create"; name?: string }
  | { type: "sources.sync"; sourceId?: string | null }
  | { type: "sources.delete"; sourceId: string }
  | {
      type: "sources.update";
      sourceId: string;
      patch: {
        name?: string;
        settings?: Partial<OpenCodexSourceLocalSettings>;
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
    }
  | { type: "threads.open"; threadId: string }
  | { type: "threads.loadOlder"; threadId: string }
  | { type: "threads.recover"; threadId: string }
  | { type: "threads.create"; projectPath?: string | null; sourceId?: string | null }
  | { type: "threads.rename"; threadId: string; name: string }
  | {
      type: "threads.updateComposerSettings";
      threadId: string;
      model: string | null;
      reasoningEffort: OpenCodexReasoningEffort | null;
    }
  | { type: "thread.review"; threadId: string; projectPath?: string | null }
  | { type: "thread.compact"; threadId: string; projectPath?: string | null }
  | { type: "system.openLink"; href: string; projectPath?: string | null; sourceId?: string | null }
  | { type: "system.openProject"; projectPath: string; sourceId: string | null }
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
    }
  | { type: "turn.interrupt"; threadId: string; turnId: string }
  | { type: "approval.respond"; approvalId: string; decision: OpenCodexApprovalDecision }
  | { type: "project.trust"; projectPath: string }
  | { type: "project.trust.dismiss"; projectPath: string }
  | { type: "models.list" }
  | { type: "usage.read" }
  | { type: "plugins.list"; sourceId: string | null }
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
  | { type: "git.version" }
  | { type: "git.status"; projectPath: string; sourceId: string | null }
  | { type: "git.init"; projectPath: string; sourceId: string | null }
  | { type: "git.branches"; projectPath: string; sourceId: string | null }
  | { type: "git.tags"; projectPath: string; sourceId: string | null }
  | { type: "git.tags.fetch"; projectPath: string; sourceId: string | null }
  | { type: "git.tag.create"; projectPath: string; sourceId: string | null; tagName: string }
  | { type: "git.tag.commitsSince"; projectPath: string; sourceId: string | null; tagName: string }
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
  | { type: "git.commit"; projectPath: string; sourceId: string | null; message: string }
  | { type: "git.pull"; projectPath: string; sourceId: string | null }
  | { type: "git.push"; projectPath: string; sourceId: string | null }
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
  | {
      type: "projectCommands.run";
      commandId: string;
      projectPath: string;
      sourceId: string | null;
    }
  | { type: "projectCommands.stop"; runId: string }
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
  | { type: "settings.get" }
  | { type: "settings.update"; patch: Partial<OpenCodexSettings> };
