import type {
  OpenCodexAutoApprovalReview,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

import { readObject, readString } from "./primitives.js";

/** Identifies experimental review notifications without leaking RPC types into the UI. */
export function isAutoApprovalReviewNotification(method: string): boolean {
  return method === "item/autoApprovalReview/started" || method === "item/autoApprovalReview/completed";
}

/** Projects a review into a synthetic raw item retained by the existing turn cache. */
export function createAutoApprovalReviewItem(params: Record<string, unknown>): Record<string, unknown> | null {
  const reviewId = readString(params.reviewId);
  if (reviewId.length === 0) {
    return null;
  }

  const review = readObject(params.review);
  const action = readObject(params.action);
  const autoApprovalReview: OpenCodexAutoApprovalReview = {
    reviewId,
    status: readReviewStatus(review.status),
    action: summarizeAction(action),
    actionDetails: JSON.stringify(action, null, 2),
    rationale: readString(review.rationale) || null,
    riskLevel: readString(review.riskLevel) || null,
    userAuthorization: readString(review.userAuthorization) || null
  };

  return { id: `auto-approval-review:${reviewId}`, type: "autoApprovalReview", autoApprovalReview };
}

/** Restores the same stable projection for historical and live activity rendering. */
export function mapAutoApprovalReviewItem(item: Record<string, unknown>): OpenCodexTurnItem {
  const value = readObject(item.autoApprovalReview);
  const review: OpenCodexAutoApprovalReview = {
    reviewId: readString(value.reviewId),
    status: readReviewStatus(value.status),
    action: readString(value.action),
    actionDetails: readString(value.actionDetails),
    rationale: readString(value.rationale) || null,
    riskLevel: readString(value.riskLevel) || null,
    userAuthorization: readString(value.userAuthorization) || null
  };
  let status: OpenCodexTurnItem["status"] = "completed";
  if (review.status === "inProgress") {
    status = "streaming";
  } else if (review.status !== "approved") {
    status = "error";
  }

  return {
    id: readString(item.id),
    role: "activity",
    kind: "autoApprovalReview",
    content: `Auto-review (${review.status}): ${review.action}`,
    status,
    createdAt: null,
    autoApprovalReview: review
  };
}

/** Keeps future or malformed outcomes explicit instead of assuming approval. */
function readReviewStatus(value: unknown): OpenCodexAutoApprovalReview["status"] {
  switch (value) {
    case "inProgress":
    case "approved":
    case "denied":
    case "timedOut":
    case "aborted":
      return value;
    default:
      return "unknown";
  }
}

/** Summarizes supported actions; full metadata remains available in the dialog. */
function summarizeAction(action: Record<string, unknown>): string {
  switch (action.type) {
    case "command":
      return readString(action.command);
    case "execve":
      return [readString(action.program), ...readStrings(action.argv)].join(" ");
    case "applyPatch":
      return readStrings(action.files).join(", ");
    case "networkAccess":
      return readString(action.target) || readString(action.host);
    case "mcpToolCall":
      return [readString(action.server), readString(action.toolName)].filter(Boolean).join(" / ");
    case "requestPermissions":
      return readString(action.reason);
    default:
      return readString(action.type);
  }
}

/** Rejects non-text values in action arrays supplied by the experimental API. */
function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}
