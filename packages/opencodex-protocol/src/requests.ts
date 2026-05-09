/**
 * Declares the requests sent from the UI to the OpenCodex backend.
 */
import type {
  OpenCodexApprovalDecision,
  OpenCodexImageAttachment,
  OpenCodexReasoningEffort,
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
  | { type: "system.openLink"; href: string; projectPath?: string | null }
  | {
      type: "turn.start";
      threadId: string | null;
      projectPath?: string | null;
      sourceId?: string | null;
      text: string;
      attachments?: OpenCodexImageAttachment[];
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
