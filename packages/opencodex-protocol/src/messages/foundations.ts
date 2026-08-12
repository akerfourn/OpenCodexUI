/**
 * Declares the shared protocol types exchanged between the UI, backend, and transport layers.
 */
/**
 * Reasoning effort values accepted by Codex and displayed in composer controls.
 */
export type OpenCodexReasoningEffort = string;

/**
 * Reasoning effort option advertised by one Codex model.
 */
export type OpenCodexReasoningEffortOption = {
  reasoningEffort: OpenCodexReasoningEffort;
  description: string;
};

/**
 * Conservative reasoning levels used when Codex cannot provide model metadata.
 */
export const DEFAULT_OPEN_CODEX_REASONING_EFFORTS: OpenCodexReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh"
];

/**
 * Assistant message phase emitted by Codex for reasoning-like and final content.
 */
export type OpenCodexMessagePhase = "commentary" | "final_answer";

/**
 * Color scheme preference stored in app settings.
 */
export type OpenCodexColorScheme = "light" | "dark" | "system";

/**
 * Composer behavior for a plain Enter key press.
 */
export type OpenCodexEnterKeyBehavior = "newline" | "send" | "smart";

/**
 * Output language used for generated commit messages.
 */
export type OpenCodexCommitMessageLanguage = "en" | "fr";

/**
 * Vocabulary level used by Git UI labels.
 */
export type OpenCodexVersioningVocabulary = "simple" | "technical";

/**
 * Log entry severity persisted by OpenCodexUI.
 */
export type OpenCodexLogType = "error" | "warning" | "info";

/**
 * Retention unit available when clearing old logs.
 */
export type OpenCodexLogRetentionUnit = "hours" | "days" | "weeks" | "months";

/**
 * Codex exec-policy amendment accepted by permission approvals.
 */
export type OpenCodexExecPolicyAmendment = string[];

/**
 * Codex network-policy amendment accepted by permission approvals.
 */
export type OpenCodexNetworkPolicyAmendment = {
  host: string;
  action: "allow" | "deny";
};

/**
 * UI approval decisions and structured policy amendments sent back to Codex.
 */
export type OpenCodexApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel"
  | {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: OpenCodexExecPolicyAmendment;
      };
    }
  | {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: OpenCodexNetworkPolicyAmendment;
      };
    };

/**
 * Thread list scopes supported by the backend.
 */
export type OpenCodexThreadScope = "currentProject" | "all";

/**
 * UI language preference.
 */
export type OpenCodexLanguage = "system" | "fr" | "en";
