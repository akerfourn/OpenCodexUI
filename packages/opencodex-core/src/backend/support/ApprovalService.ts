import type { CodexServerRequest } from "@open-codex-ui/codex-rpc";
import type { OpenCodexApprovalDecision } from "@open-codex-ui/opencodex-protocol";

import {
  buildApprovalResponse,
  createApprovalRequest
} from "../../mapping.js";
import { getBackendLabels } from "../shared/errors.js";
import type { ClientPort, RuntimeEventPort, RuntimeSettingsPort } from "../runtime/runtimePorts.js";

/** Dependencies used by the approval service. */
export type ApprovalServiceOptions = {
  /** Reads the current language used in approval messages. */
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  /** Emits approval state changes to the host. */
  events: Pick<RuntimeEventPort, "emit">;
  /** Looks up the client that owns a pending approval. */
  clients: Pick<ClientPort, "getClient">;
};

/**
 * Manages Codex approval requests until the UI resolves them.
 */
export class ApprovalService {
  private readonly pendingApprovals = new Map<string, { request: CodexServerRequest; sourceId: string }>();

  /**
   * Creates an approval service.
   *
   * @param options Settings, event emitter, and client lookup callbacks.
   */
  constructor(private readonly options: ApprovalServiceOptions) {}

  /**
   * Stores a server-side approval request and emits it to the UI.
   *
   * @param request Codex server request requiring approval.
   * @param sourceId Source that owns the request.
   *
   * @returns Nothing.
   */
  handleServerRequest(request: CodexServerRequest, sourceId: string): void {
    const approval = {
      ...createApprovalRequest(request, this.options.settings.getSettings().language),
      sourceId
    };
    this.pendingApprovals.set(approval.id, { request, sourceId });
    this.options.events.emit({ type: "approval.requested", approval });
  }

  /**
   * Resolves an approval by responding to the owning Codex client.
   *
   * @param approvalId Approval identifier.
   * @param decision User decision to send back to Codex.
   *
   * @returns Nothing.
   */
  resolveApproval(approvalId: string, decision: OpenCodexApprovalDecision): void {
    const pendingApproval = this.pendingApprovals.get(approvalId);
    const client = pendingApproval === undefined
      ? undefined
      : this.options.clients.getClient(pendingApproval.sourceId);

    if (pendingApproval === undefined || client === undefined) {
      this.options.events.emit({
        type: "error",
        message: getBackendLabels(this.options.settings.getSettings().language).approvalUnavailable
      });
      return;
    }

    const { request } = pendingApproval;
    this.pendingApprovals.delete(approvalId);

    if (isDeclinedPermissionRequest(request.method, decision)) {
      client.rejectServerRequest(request.id, "Permission request declined by the user.");
    } else {
      client.respond(request.id, buildApprovalResponse(request.method, decision, request.params));
    }

    this.options.events.emit({ type: "approval.resolved", approvalId });
  }
}

/**
 * Checks whether a permission request should be rejected instead of responded to.
 *
 * @param method Codex request method.
 * @param decision User decision.
 * @returns Whether the request should be rejected.
 */
function isDeclinedPermissionRequest(method: string, decision: OpenCodexApprovalDecision): boolean {
  if (method !== "item/permissions/requestApproval") {
    return false;
  }

  return decision !== "accept" && decision !== "acceptForSession";
}
