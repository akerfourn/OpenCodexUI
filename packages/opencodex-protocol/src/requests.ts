/**
 * Declares the requests sent from the UI to the OpenCodex backend.
 */
import type {
  OpenCodexApprovalDecision,
  OpenCodexReasoningEffort,
  OpenCodexSettings,
  OpenCodexThreadScope
} from "./messages";

export type OpenCodexRequest =
  | { type: "app.bootstrap" }
  | { type: "projects.list" }
  | { type: "projects.open"; projectPath: string; createIfMissing?: boolean }
  | { type: "projects.pickDirectory"; mode: "open" | "create" }
  | { type: "threads.list"; scope: OpenCodexThreadScope; projectPath?: string | null; searchTerm?: string }
  | { type: "threads.open"; threadId: string }
  | { type: "threads.loadOlder"; threadId: string }
  | { type: "threads.recover"; threadId: string }
  | { type: "threads.create"; projectPath?: string | null }
  | { type: "threads.rename"; threadId: string; name: string }
  | { type: "system.openLink"; href: string; projectPath?: string | null }
  | {
      type: "turn.start";
      threadId: string | null;
      projectPath?: string | null;
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
