/**
 * Maps Codex approval requests and responses.
 */
import type { CodexServerRequest } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexApproval,
  OpenCodexApprovalDecision,
  OpenCodexLanguage
} from "@open-codex-ui/opencodex-protocol";

import { getCoreLabels } from "./labels.js";
import {
  readNullableString,
  readObject,
  readString
} from "./primitives.js";

export function createApprovalRequest(
  request: CodexServerRequest,
  language: OpenCodexLanguage = "fr"
): OpenCodexApproval {
  const params = readObject(request.params);
  const threadId = readNullableString(params.threadId) ?? undefined;

  return {
    id: String(request.id),
    threadId,
    title: createApprovalTitle(request.method, params, language),
    kind: createApprovalKind(request.method),
    body: JSON.stringify(request.params ?? {}, null, 2),
    reason: readNullableString(params.reason),
    command: readNullableString(params.command),
    cwd: readNullableString(params.cwd),
    grantRoot: readNullableString(params.grantRoot),
    permissions: params.permissions,
    choices: readAvailableDecisions(params.availableDecisions)
  };
}

export function buildApprovalResponse(method: string, decision: OpenCodexApprovalDecision): unknown {
  if (method === "item/commandExecution/requestApproval") {
    return { decision };
  }

  if (method === "item/fileChange/requestApproval") {
    return { decision };
  }

  if (method === "execCommandApproval" || method === "applyPatchApproval") {
    return { decision: mapLegacyDecision(decision) };
  }

  return { decision };
}

function createApprovalTitle(
  method: string,
  params: Record<string, unknown>,
  language: OpenCodexLanguage
): string {
  const labels = getCoreLabels(language);

  if (method === "item/commandExecution/requestApproval") {
    return `${labels.command}: ${readString(params.command) || labels.approvalRequired}`;
  }

  if (method === "item/fileChange/requestApproval") {
    return `${labels.fileChange}: ${readString(params.grantRoot) || labels.approvalRequired}`;
  }

  if (method === "item/permissions/requestApproval") {
    return labels.permissionsRequested;
  }

  return method;
}

function createApprovalKind(method: string): OpenCodexApproval["kind"] {
  if (method === "item/commandExecution/requestApproval" || method === "execCommandApproval") {
    return "command";
  }

  if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
    return "fileChange";
  }

  if (method === "item/permissions/requestApproval") {
    return "permissions";
  }

  return "other";
}

function readAvailableDecisions(value: unknown): OpenCodexApprovalDecision[] {
  if (!Array.isArray(value)) {
    return ["accept", "acceptForSession", "decline", "cancel"];
  }

  const decisions = value.filter(isApprovalDecision);
  const fallbackDecisions: OpenCodexApprovalDecision[] = ["accept", "decline", "cancel"];
  const availableDecisions = decisions.length > 0 ? decisions : fallbackDecisions;
  return availableDecisions.includes("decline") ? availableDecisions : [...availableDecisions, "decline"];
}

function isApprovalDecision(value: unknown): value is OpenCodexApprovalDecision {
  if (
    value === "accept" ||
    value === "acceptForSession" ||
    value === "decline" ||
    value === "cancel"
  ) {
    return true;
  }

  const candidate = readObject(value);
  const execpolicyDecision = readObject(candidate.acceptWithExecpolicyAmendment);
  const networkPolicyDecision = readObject(candidate.applyNetworkPolicyAmendment);
  const execpolicyAmendment = execpolicyDecision.execpolicy_amendment;
  const networkPolicyAmendment = readObject(networkPolicyDecision.network_policy_amendment);
  const networkAction = networkPolicyAmendment.action;

  if (Array.isArray(execpolicyAmendment) && execpolicyAmendment.every(isString)) {
    return true;
  }

  return (
    typeof networkPolicyAmendment.host === "string" &&
    (networkAction === "allow" || networkAction === "deny")
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function mapLegacyDecision(decision: OpenCodexApprovalDecision): string {
  if (decision === "accept") {
    return "approved";
  }

  if (decision === "acceptForSession") {
    return "approved_for_session";
  }

  if (decision === "cancel") {
    return "abort";
  }

  return "denied";
}

