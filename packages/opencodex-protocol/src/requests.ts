import type {
  OpenCodexApprovalDecision,
  OpenCodexReasoningEffort,
  OpenCodexSettings,
  OpenCodexThreadScope
} from "./messages";

export type OpenCodexRequest =
  | { type: "app.bootstrap" }
  | { type: "threads.list"; scope: OpenCodexThreadScope; searchTerm?: string }
  | { type: "threads.open"; threadId: string }
  | { type: "threads.loadOlder"; threadId: string }
  | { type: "threads.recover"; threadId: string }
  | { type: "threads.create" }
  | { type: "threads.rename"; threadId: string; name: string }
  | { type: "system.openLink"; href: string }
  | {
      type: "turn.start";
      threadId: string | null;
      text: string;
      model?: string | null;
      reasoningEffort?: OpenCodexReasoningEffort | null;
    }
  | { type: "turn.interrupt"; threadId: string; turnId: string }
  | { type: "approval.respond"; approvalId: string; decision: OpenCodexApprovalDecision }
  | { type: "project.trust"; projectPath: string }
  | { type: "project.trust.dismiss"; projectPath: string }
  | { type: "models.list" }
  | { type: "settings.get" }
  | { type: "settings.update"; patch: Partial<OpenCodexSettings> };
