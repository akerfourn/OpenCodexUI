/** Stable UI projection of Codex's experimental automatic approval review. */
export interface OpenCodexAutoApprovalReview {
  reviewId: string;
  status: "inProgress" | "approved" | "denied" | "timedOut" | "aborted" | "unknown";
  /** Compact action label; never executable UI content. */
  action: string;
  /** Plain-text action metadata for the details dialog. */
  actionDetails: string;
  rationale: string | null;
  riskLevel: string | null;
  userAuthorization: string | null;
}
