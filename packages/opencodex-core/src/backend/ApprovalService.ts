import type {
  CodexAppServerClient,
  CodexServerRequest
} from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexApprovalDecision,
  OpenCodexEvent,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import {
  buildApprovalResponse,
  createApprovalRequest
} from "../mapping.js";
import { getBackendLabels } from "./errors.js";

export type ApprovalServiceOptions = {
  getSettings(): OpenCodexSettings;
  emit(event: OpenCodexEvent): void;
  getClient(sourceId: string): CodexAppServerClient | undefined;
};

export class ApprovalService {
  private readonly pendingApprovals = new Map<string, { request: CodexServerRequest; sourceId: string }>();

  constructor(private readonly options: ApprovalServiceOptions) {}

  handleServerRequest(request: CodexServerRequest, sourceId: string): void {
    const approval = createApprovalRequest(request, this.options.getSettings().language);
    this.pendingApprovals.set(approval.id, { request, sourceId });
    this.options.emit({ type: "approval.requested", approval });
  }

  resolveApproval(approvalId: string, decision: OpenCodexApprovalDecision): void {
    const pendingApproval = this.pendingApprovals.get(approvalId);
    const client = pendingApproval === undefined
      ? undefined
      : this.options.getClient(pendingApproval.sourceId);

    if (pendingApproval === undefined || client === undefined) {
      this.options.emit({
        type: "error",
        message: getBackendLabels(this.options.getSettings().language).approvalUnavailable
      });
      return;
    }

    const { request } = pendingApproval;
    this.pendingApprovals.delete(approvalId);

    if (request.method === "item/permissions/requestApproval" && decision !== "accept") {
      client.rejectServerRequest(request.id, "Permission request declined by the user.");
    } else {
      client.respond(request.id, buildApprovalResponse(request.method, decision));
    }

    this.options.emit({ type: "approval.resolved", approvalId });
  }
}
